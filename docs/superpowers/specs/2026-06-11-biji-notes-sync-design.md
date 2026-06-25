# Design: Biji Notes → Obsidian Vault Sync via GitHub

## 1. Background / Problem

`biji-cli` currently provides `get-latest` / `get-latest-original`, which fetch only the single most-recently-created note from biji.com (得到大脑) and write it as Markdown into a local folder (default `~/Documents/A第二大脑`, the user's Obsidian vault).

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
| Multi-note handling | New `getNewNotes(sinceTimestamp)`, filters the notes-list by `created_at`, paginating via "load more" if `has_more` and still above `sinceTimestamp` |
| Sync target folder | Notes → `<syncRepoPath>/inbox/` (triage area); images → `<syncRepoPath>/Assets/` (shared with rest of vault) |
| Relay mechanism | The idle Mac holds its own git clone of the same `obsidian-vault` GitHub repo; `biji sync` commits/pushes to it |
| State tracking | `.biji-sync-state.json` (high-water mark + last status), committed only when it changes |
| Failure visibility | `_biji-sync-status.md` in the vault (primary, surfaces via Obsidian Git pull) + local log + email via SMTP on status transitions (secondary) |
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
  │  3. saveNoteAsMarkdown({ noteId, isOriginal: true, outputDir: <syncRepoPath>/inbox, ... }) per new note
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
- Reuses the existing notes-list interception (`/voicenotes/web/notes?sort=create_desc`, actual host `get-notes.luojilab.com`)
- Returns items from `data.c.list` where `created_at > sinceTimestamp`, sorted **oldest first**
- `created_at` is in the format `"YYYY-MM-DD HH:MM:SS"`, which sorts correctly with plain string comparison — no date parsing needed
- Each item's id is `note.note_id || note.id`, matching the existing `getLatestNoteId()` convention

**Pagination (>10 new notes per interval)**: verified during design research that the response includes `total_items` and `has_more`, and the request URL includes `limit`/`since_id` — so the default page of 10 is not the full note history; the API supports paging. Calling the API directly with a different `limit` from outside the page hit CORS ("Failed to fetch"), so `getNewNotes` does **not** try to control `limit` itself — it relies entirely on the page's own "load more" (infinite scroll) for subsequent pages, using whatever params the page itself sends.

`getNewNotes` loops over pages (each page sorted `create_desc`, items accumulated oldest-first overall):
1. Take the initial intercepted page (10 items).
2. If the **oldest item accumulated so far** has `created_at > sinceTimestamp` AND `has_more === true`, trigger "load more" and intercept the next page; append its items.
3. Repeat step 2 until either the oldest accumulated item's `created_at <= sinceTimestamp`, or `has_more === false`.
4. Return all accumulated items where `created_at > sinceTimestamp`, oldest-first.

**Robust to deleted notes**: the stop condition is a **timestamp threshold** (`created_at <= sinceTimestamp`), not "find the specific note we synced last time". `sinceTimestamp` is just a cutoff value — it doesn't need to correspond to a note that still exists. If the user deletes the note that originally had that `created_at`, the comparison is unaffected: the next page's oldest item still has *some* `created_at`, and as soon as that's `<= sinceTimestamp` the loop stops normally. Pagination only runs long (toward `total_items` pages) in the unlikely case that *every* note older than `sinceTimestamp` has been deleted — and even then it's bounded by `total_items`, not infinite.

(Minor edge case, not handled: if two notes share the exact same `created_at` to the second and the cutoff falls between them, a same-second note could theoretically be missed. Considered negligible for hand-created voice notes.)

**Implementation-time investigation**: confirm the concrete scroll/UI trigger that causes `https://www.biji.com/note` to issue the next paginated request (a first attempt during this design's research did not trigger one). Puppeteer can drive scrolling (`page.evaluate(() => el.scrollTo(...))`, `page.mouse.wheel(...)`) — likely needs a larger viewport, scrolling the correct inner list container (not just `document.body`), and waiting long enough for an IntersectionObserver-driven fetch to fire. This is a scoped, verifiable first step of implementation, not a design blocker.

In practice, exceeding 10 new notes within one sync interval should be rare for personal voice-note usage — but with this loop, the mechanism is *correct* (paginate until caught up) rather than *silently lossy*.

### 4.2 `biji sync` CLI command

- Location: new subcommand in `src/cli.ts`, orchestration in `src/core/sync_notes.ts`

**First run**: if `<syncRepoPath>/.biji-sync-state.json` does not exist, initialize `lastSyncedAt = <current timestamp, "YYYY-MM-DD HH:MM:SS">` and `lastStatus = "ok"`, write the file and an initial `_biji-sync-status.md`, commit and push them, then exit without fetching any notes. This establishes a baseline (recorded in the repo, so it survives reinstalls) so the first scheduled run doesn't unexpectedly backfill the user's note history; only notes created *after* setup get synced.

**Each run**:

1. `git -C <syncRepoPath> pull --rebase`
   - On failure: append to local log, send a failure email, exit non-zero. (Nothing else has run yet, so no state to update.)
2. Read `.biji-sync-state.json` → `{ lastSyncedAt, lastStatus, lastErrorMessage }`
3. Attempt the sync:
   - `notes = getNewNotes(lastSyncedAt)`
   - For each note, oldest-first: `saveNoteAsMarkdown({ noteId, outputDir: <syncRepoPath>/inbox, assetsDir: <syncRepoPath>/Assets, imageFormat: 'obsidian', isOriginal: true })`
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
     - On repeated failure: `git rebase --abort`, append to local log, send a failure email, exit non-zero. The commit remains local and will be retried on the next scheduled run.
   - Else (`!stateChanged`): no git write operations — working tree is clean, nothing to commit
6. Append a line to `~/.biji-cli/sync.log` every run (timestamp, result, notes-synced count, error if any) regardless of `stateChanged` — this is the local heartbeat/debug trail
7. If `newStatus !== lastStatus` (a transition: ok→error or error→ok), send a failure/recovery email (see 4.6). Routine successful syncs (even with new notes) and repeated identical error states do not send email, to avoid hourly spam while a known issue is unresolved.

### 4.3 Config additions (`~/.bijirc.json` on the idle Mac)

- `syncRepoUrl` — git remote URL for the vault repo (e.g. `git@github.com:ghh-l-djl/obsidian-vault.git`). No default; `biji sync` errors with setup instructions if unset.
- `syncRepoPath` — local clone path, default `~/.biji-cli/vault-sync`.

`biji sync` writes notes into `<syncRepoPath>/inbox/` and images into `<syncRepoPath>/Assets/` (the same shared assets folder the rest of the vault already uses, per the existing vault structure), independent of the existing `outputDir`/`assetsDir` config used by `get-note`/`get-latest`/`get-latest-original`. The `inbox/` folder gives the user an explicit triage location in Obsidian for newly-synced note text, while images join the vault's single shared `Assets/` folder — avoiding a separate, redundant assets tree and keeping image references valid if/when notes are later moved out of `inbox/`.

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

### 4.6 Email failure notifications

- New dependency: `nodemailer` — small, pure-JS, sending an email is ~10 lines of code; not a heavy addition.
- New config, idle-Mac-local `~/.bijirc.json` only (NOT part of the synced repo, so it never reaches GitHub):
  - `notifyEmail` — recipient address
  - `smtp: { host, port, secure, user, pass, from }` — credentials for sending
- Sent only on: ok↔error transitions (4.2 step 7) and git pull/push failures (4.2 steps 1 and 5) — same trigger conditions originally specified for the macOS-notification approach.
- **Credential storage note**: the SMTP password/API key sits in plaintext in `~/.bijirc.json` on the idle Mac — the same risk class as the disk-encryption question the user already decided not to pursue for the vault. Recommend a dedicated low-privilege credential (e.g. a Gmail "App Password" on a separate account, or a send-only transactional-email API key), so a leak only allows sending mail as that address rather than broader account access. This is a setup-time choice, not a code-level mitigation.

## 5. Failure Handling & Visibility

Two layers, since the idle Mac isn't actively watched:

1. **Status note** (`_biji-sync-status.md`, primary): committed/pushed on state changes (new notes or status transitions), propagates to the primary Mac's vault via the existing Obsidian Git plugin auto-pull — visible like any other note.
   - Exception: if the failure is a **git pull/push failure itself**, the status note can't reach GitHub. Covered only by layer 2.
2. **Local log + email** (`~/.biji-cli/sync.log` + SMTP via `nodemailer`, secondary/best-effort — see 4.6): every run appends a line to the log; an email is sent only on ok↔error transitions and on git pull/push failures. Reaches the user wherever they check email, without needing physical or remote access to the idle Mac; the log gives a local debugging trail.

**Login expiry** (most likely failure mode — biji.com sessions expire periodically): `getNewNotes`/`saveNoteAsMarkdown` throw "未登录..." via `withLoggedInPage`. This is a pre-git-operation failure, so the status note update IS committed/pushed normally (layer 1), plus log + email (layer 2). Recovery: user sees the status note in Obsidian or the email, accesses the idle Mac, runs `biji login` there (interactive, phone verification — cannot be automated).

## 6. Scheduling

- **Mechanism**: launchd LaunchAgent (user-session scope) on the idle Mac: `~/Library/LaunchAgents/com.bijicli.sync.plist`
- **Schedule**: hourly via `StartCalendarInterval` with `Minute: 0`
- **Command**: a wrapper script (e.g. `~/.biji-cli/run-sync.sh`) sets `PATH` (so `git`/`node`/`biji` resolve under launchd's minimal environment) and runs `biji sync`, with stdout/stderr redirected to `~/.biji-cli/sync.log`
- LaunchAgents only run while a user session is active — the idle Mac must remain logged into the user's account (e.g. auto-login enabled) for the schedule to fire. To be verified during setup.
- **Interval choice**: a 30-minute interval was considered as a workaround for the >10-new-notes case, but `getNewNotes`'s pagination loop (4.1) now handles that regardless of interval — so interval choice only affects sync latency, not data loss. Hourly is kept. Halving to 30 minutes would roughly double headless-Chrome launches/API calls per day (24 → 48); for an otherwise-idle Mac that's a negligible resource cost, and at this volume it's unlikely to be a meaningful anti-bot signal (the dominant fingerprinting factor is running headless Chrome at all, which is unchanged either way). Switch to 30 minutes only if fresher sync is independently desired.

## 7. Testing Approach

No existing test framework in this project; testing is manual/ad-hoc, consistent with existing code.

- `getNewNotes(sinceTimestamp)` filtering/sorting logic: pure logic over a list — exercise with a hardcoded sample list (similar to the throwaway inspection scripts used during this design's research) before wiring it into `sync_notes.ts`.
- `getNewNotes` pagination loop: first confirm the scroll/UI trigger that yields a second page (4.1), then verify the loop correctly stops at `has_more === false` or once `created_at <= sinceTimestamp`.
- `biji sync` end-to-end: dry-run against a scratch git repo/clone (not the real vault) first — verify state file creation, status note content, `inbox/` placement of notes/assets, commit behavior (including the "no commit when nothing changed" path), and the rebase-retry-on-push-rejection path (simulate by pushing from a second clone between pull and push).
- Email notifications (4.6): verify with a throwaway SMTP credential/recipient before wiring real ones in.
- Only after local end-to-end verification, point `syncRepoUrl`/`syncRepoPath` at the real vault repo and deploy the launchd job on the idle Mac.

## 8. Out of Scope

- **Obsidian Git plugin auto-pull configuration** on the primary Mac — already installed; just confirm an auto-pull interval is configured. No code changes here.
- **Encrypted Disk Image** for the sync folder on the idle Mac — explicitly declined by the user.
- **Automating biji.com login** — not possible (interactive phone verification), unchanged.
- **Migrating to a remote server** in the future — independent of this design; the idle-Mac deployment uses the same general shape (its own clone, its own config) that any future host would also use.
