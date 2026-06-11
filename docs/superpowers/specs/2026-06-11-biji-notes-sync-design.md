# Design: Biji Notes → Obsidian Vault Sync via GitHub

## 1. Background / Problem

`biji-cli` currently provides `get-latest` / `get-latest-original`, which fetch only the single most-recently-created note from biji.com (Get笔记) and write it as Markdown into a local folder (default `~/Documents/A第二大脑`, the user's Obsidian vault).

Goal: automate this so new biji notes appear in the Obsidian vault periodically without manual CLI invocation.

Two issues block naive automation (cron + `get-latest`):

- **Single-note limit**: `get-latest` returns only the newest note (`list[0]` from the notes-list API). If more than one note is created between polling runs, earlier ones are silently dropped.
- **Portability / relay**: the sync service should be runnable on a machine other than the primary Mac, with GitHub as the relay between the fetch service and the Obsidian vault (which the primary Mac already syncs via the Obsidian Git plugin).

## 2. Decisions Summary

| Topic | Decision |
|---|---|
| Where it runs | A spare/idle Mac — always-on, occasionally accessible for manual re-login |
| Sync frequency | Hourly |
| Note type fetched | 原文 (original) only, via existing `isOriginal: true` path |
| Multi-note handling | New `getNewNotes(sinceTimestamp)`, filters the existing 10-item notes-list by `created_at` |
| Relay mechanism | The idle Mac holds its own git clone of the same `obsidian-vault` GitHub repo; `biji sync` commits/pushes to it |
| State tracking | `.biji-sync-state.json` (high-water mark + last status), committed only when it changes |
| Failure visibility | `_biji-sync-status.md` in the vault (primary, surfaces via Obsidian Git pull) + local log + best-effort macOS notification on status transitions (secondary) |
| Encryption | None (declined) |
| Scheduling mechanism | launchd LaunchAgent, hourly |

## 3. Architecture & Data Flow

```
biji.com
  │  (Puppeteer, persistent logged-in session, idle Mac)
  ▼
biji sync   (new CLI command, src/core/sync_notes.ts)
  │  1. git pull --rebase   (idle Mac's clone)
  │  2. getNewNotes(lastSyncedAt)
  │  3. saveNoteAsMarkdown({ noteId, isOriginal: true, outputDir: syncRepoPath, ... }) per new note
  │  4. update .biji-sync-state.json + _biji-sync-status.md (only if changed)
  │  5. git commit + push (rebase-retry once on rejection)
  ▼
GitHub: ghh-l-djl/obsidian-vault
  ▼
Obsidian Git plugin auto-pull (primary Mac, existing/unchanged)
  ▼
~/Documents/A第二大脑 (Obsidian vault)
```

The idle Mac's clone is independent of the primary Mac's vault clone — there is no file-level sharing between machines. GitHub is the sole relay, mirroring how the Obsidian Git plugin already operates.

## 4. New Components

### 4.1 `getNewNotes(sinceTimestamp: string): Promise<NoteListItem[]>`

- Location: `src/core/get_new_notes.ts` (sibling to `get_latest_note.ts`)
- Reuses the existing notes-list interception (`/voicenotes/web/notes?sort=create_desc`)
- Returns items from `data.c.list` where `created_at > sinceTimestamp`, sorted **oldest first**
- `created_at` is in the format `"YYYY-MM-DD HH:MM:SS"`, which sorts correctly with plain string comparison — no date parsing needed
- Each item's id is `note.note_id || note.id`, matching the existing `getLatestNoteId()` convention

**Known limitation**: the API returns at most 10 items. If more than 10 notes are created within a single sync interval, only the 10 most recent are visible — older ones in that batch are permanently missed. Acceptable for hourly personal-use cadence; not solved by this design.

### 4.2 `biji sync` CLI command

- Location: new subcommand in `src/cli.ts`, orchestration in `src/core/sync_notes.ts`

**First run**: if `<syncRepoPath>/.biji-sync-state.json` does not exist, initialize `lastSyncedAt = <current timestamp, "YYYY-MM-DD HH:MM:SS">` and `lastStatus = "ok"`, write the file and an initial `_biji-sync-status.md`, commit and push them, then exit without fetching any notes. This establishes a baseline (recorded in the repo, so it survives reinstalls) so the first scheduled run doesn't unexpectedly backfill the user's note history; only notes created *after* setup get synced.

**Each run**:

1. `git -C <syncRepoPath> pull --rebase`
   - On failure: append to local log, send macOS notification, exit non-zero. (Nothing else has run yet, so no state to update.)
2. Read `.biji-sync-state.json` → `{ lastSyncedAt, lastStatus, lastErrorMessage }`
3. Attempt the sync:
   - `notes = getNewNotes(lastSyncedAt)`
   - For each note, oldest-first: `saveNoteAsMarkdown({ noteId, outputDir: syncRepoPath, assetsDir: <syncRepoPath>/Assets, imageFormat: 'obsidian', isOriginal: true })`
   - On success: `newStatus = "ok"`, `newErrorMessage = null`, `newLastSyncedAt = notes.length ? max(created_at of notes) : lastSyncedAt`
   - On any error (e.g. `withLoggedInPage` throwing "未登录..."): `newStatus = "error"`, `newErrorMessage = err.message`, `newLastSyncedAt = lastSyncedAt` (unchanged)
4. Compute `stateChanged = (newLastSyncedAt !== lastSyncedAt) || (newStatus !== lastStatus) || (newErrorMessage !== lastErrorMessage)`
5. If `stateChanged`:
   - Write updated `.biji-sync-state.json`
   - Regenerate `_biji-sync-status.md` from the new state (see 4.5)
   - `git add -A`
   - `git commit -m "biji sync: <n> new note(s)"` (or `"biji sync: status update"` if `n === 0`)
   - `git push`
     - On non-fast-forward rejection: `git pull --rebase` once, retry push
     - On repeated failure: `git rebase --abort`, append to local log, send macOS notification, exit non-zero. The commit remains local and will be retried on the next scheduled run.
   - Else (`!stateChanged`): no git write operations — working tree is clean, nothing to commit
6. Append a line to `~/.biji-cli/sync.log` every run (timestamp, result, notes-synced count, error if any) regardless of `stateChanged` — this is the local heartbeat/debug trail
7. If `newStatus !== lastStatus` (a transition: ok→error or error→ok), send a best-effort macOS notification. Routine successful syncs (even with new notes) and repeated identical error states do not notify, to avoid hourly spam while a known issue is unresolved.

### 4.3 Config additions (`~/.bijirc.json` on the idle Mac)

- `syncRepoUrl` — git remote URL for the vault repo (e.g. `git@github.com:ghh-l-djl/obsidian-vault.git`). No default; `biji sync` errors with setup instructions if unset.
- `syncRepoPath` — local clone path, default `~/.biji-cli/vault-sync`.

`biji sync` writes into `syncRepoPath` (and `syncRepoPath/Assets`), independent of the existing `outputDir`/`assetsDir` config used by `get-note`/`get-latest`/`get-latest-original`. This keeps the sync target explicit and decoupled from any ad-hoc fetch configuration on the same machine.

### 4.4 State file: `.biji-sync-state.json`

Located at `<syncRepoPath>/.biji-sync-state.json`, committed to the repo (so the high-water mark survives idle-Mac reinstalls/migrations).

```json
{
  "lastSyncedAt": "2026-06-11 09:00:00",
  "lastStatus": "ok",
  "lastErrorMessage": null,
  "lastChangedAt": "2026-06-11 09:00:03"
}
```

### 4.5 Status note: `_biji-sync-status.md`

Located at `<syncRepoPath>/_biji-sync-status.md` (leading underscore for visual distinction in Obsidian). Regenerated from `.biji-sync-state.json` whenever the state changes (i.e., committed alongside it).

Success example:
```markdown
# Biji Sync Status

- Last change: 2026-06-11 09:00:03
- Result: ✅ ok
```

Error example:
```markdown
# Biji Sync Status

- Last change: 2026-06-11 11:00:02
- Result: ❌ error
- Error: 未登录，请到闲置 Mac 上运行 `biji login`
```

This file only updates in git history when something meaningful happens (new notes synced, or a status transition) — not on every hourly run — to keep the vault's commit history readable.

## 5. Failure Handling & Visibility

Two layers, since the idle Mac isn't actively watched:

1. **Status note** (`_biji-sync-status.md`, primary): committed/pushed on state changes (new notes or status transitions), propagates to the primary Mac's vault via the existing Obsidian Git plugin auto-pull — visible like any other note.
   - Exception: if the failure is a **git pull/push failure itself**, the status note can't reach GitHub. Covered only by layer 2.
2. **Local log + macOS notification** (`~/.biji-cli/sync.log`, secondary/best-effort): every run appends a line; notifications fire only on ok↔error transitions (see 4.2 step 7) and on git pull/push failures. Useful for the rare occasions the user is physically at the idle Mac, and gives a debugging trail.

**Login expiry** (most likely failure mode — biji.com sessions expire periodically): `getNewNotes`/`saveNoteAsMarkdown` throw "未登录..." via `withLoggedInPage`. This is a pre-git-operation failure, so the status note update IS committed/pushed normally (layer 1), plus log + notification (layer 2). Recovery: user sees the status note in Obsidian or the notification, accesses the idle Mac, runs `biji login` there (interactive, phone verification — cannot be automated).

## 6. Scheduling

- **Mechanism**: launchd LaunchAgent (user-session scope) on the idle Mac: `~/Library/LaunchAgents/com.bijicli.sync.plist`
- **Schedule**: hourly via `StartCalendarInterval` with `Minute: 0`
- **Command**: a wrapper script (e.g. `~/.biji-cli/run-sync.sh`) sets `PATH` (so `git`/`node`/`biji` resolve under launchd's minimal environment) and runs `biji sync`, with stdout/stderr redirected to `~/.biji-cli/sync.log`
- LaunchAgents only run while a user session is active — the idle Mac must remain logged into the user's account (e.g. auto-login enabled) for the schedule to fire. To be verified during setup.

## 7. Testing Approach

No existing test framework in this project; testing is manual/ad-hoc, consistent with existing code.

- `getNewNotes(sinceTimestamp)`: pure filtering/sorting logic over a list — can be exercised with a hardcoded sample list (similar to the throwaway inspection script used during this design's research) before wiring it into `sync_notes.ts`.
- `biji sync` end-to-end: dry-run against a scratch git repo/clone (not the real vault) first — verify state file creation, status note content, commit behavior (including the "no commit when nothing changed" path), and the rebase-retry-on-push-rejection path (simulate by pushing from a second clone between pull and push).
- Only after local end-to-end verification, point `syncRepoUrl`/`syncRepoPath` at the real vault repo and deploy the launchd job on the idle Mac.

## 8. Out of Scope

- **Obsidian Git plugin auto-pull configuration** on the primary Mac — already installed; just confirm an auto-pull interval is configured. No code changes here.
- **Encrypted Disk Image** for the sync folder on the idle Mac — explicitly declined by the user.
- **Automating biji.com login** — not possible (interactive phone verification), unchanged.
- **Backfilling >10 notes in a single interval** — documented limitation (4.1), not solved.
- **Migrating to a remote server** in the future — independent of this design; the idle-Mac deployment uses the same general shape (its own clone, its own config) that any future host would also use.
