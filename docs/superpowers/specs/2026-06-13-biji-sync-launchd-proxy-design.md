# Design: Clash Proxy Detection for `run-sync.sh` (launchd)

## 1. Background / Problem

A 5-minute test run of the `com.bijicli.sync` launchd job
(`StartInterval=300`, deployed as
`~/Library/LaunchAgents/com.bijicli.sync.test.plist` for testing) failed
after ~5 minutes with:

```
git pull --rebase 失败: spawnSync git ETIMEDOUT
```

Root cause chain:

- This Mac requires a local Clash proxy (`127.0.0.1:7890`) to reach
  `github.com` — a direct HTTPS connection (`curl --noproxy '*'
  https://github.com`) times out (curl error 28), while the same request
  through the proxy succeeds in ~3-6s.
- The proxy environment variables (`http_proxy` / `https_proxy` /
  `all_proxy`) are set by a **zsh interactive `precmd` hook**
  (`_auto_proxy` in `~/.zshrc`, lines 136-168), which only runs in
  interactive zsh sessions.
- launchd's `ProgramArguments` runs `/bin/bash -l
  ~/.biji-cli/run-sync.sh` — a **non-interactive bash** login shell. It
  never sources `~/.zshrc` and the hook never fires, so the proxy variables
  are absent.
- A separate, already-uncommitted change to `src/core/git_ops.ts`
  (`bypassUserGitConfig`, sets `GIT_CONFIG_GLOBAL=/dev/null` for HTTPS
  remotes) correctly avoids `~/.gitconfig`'s global `url
  "git@github.com:" insteadOf = https://github.com/` rewrite — but the
  resulting direct HTTPS connection still needs the proxy, which isn't
  there.

Net effect: `git pull --rebase` on the `vault-sync` repo (HTTPS origin)
makes a direct, unproxied connection to `github.com` from launchd's
environment, hangs, and fails with `ETIMEDOUT` after the configured
300-second timeout.

## 2. Decisions

| Topic | Decision |
|---|---|
| Where to fix | `scripts/launchd/run-sync.sh` only — a deployment script, not `biji-cli` core. No `biji-cli` rebuild/republish needed. |
| Detection mechanism | Mirror `~/.zshrc`'s `_auto_proxy`: check `127.0.0.1:7890` with `nc -z -G 1`, export proxy vars only if open |
| Clash port | Hardcode `7890` (matches this Mac's `_CLASH_PORT` default), as a script variable for easy editing |
| `src/core/git_ops.ts` (existing uncommitted diff: `bypassUserGitConfig` + 300s timeout + `BIJI_GIT_TIMEOUT_MS`) | Keep as-is — `bypassUserGitConfig` is correct/necessary regardless of the proxy fix; 300s timeout is a deliberate choice (headroom for large private-vault clones), confirmed by user |
| `docs/biji-sync.md` §8 | Update to document the new proxy-detection step and correct the stale "30秒超时" description to match the actual 300s default |

## 3. Implementation

### 3.1 `scripts/launchd/run-sync.sh`

After the existing `biji` executable check, before `biji sync`:

```bash
# ── Auto Clash Proxy (mirrors ~/.zshrc's _auto_proxy, but one-shot:
# this script runs once per launchd trigger, not per shell prompt) ────
CLASH_PORT=7890
if nc -z -G 1 127.0.0.1 "$CLASH_PORT" 2>/dev/null; then
  export http_proxy="http://127.0.0.1:${CLASH_PORT}"
  export https_proxy="http://127.0.0.1:${CLASH_PORT}"
  export all_proxy="socks5://127.0.0.1:${CLASH_PORT}"
  export no_proxy="localhost,127.0.0.1,::1"
fi
```

If Clash isn't running, no proxy vars are set — behavior matches today
(direct connection, eventual `ETIMEDOUT` + failure email). Not worse than
current state.

### 3.2 `src/core/git_ops.ts` / `git_ops.test.ts`

No changes. The existing uncommitted diff (bypass + timeout +
`BIJI_GIT_TIMEOUT_MS`) is correct and stays as-is.

### 3.3 `docs/biji-sync.md` §8

Update the launchd section to:
- Mention the new proxy-detection block in `run-sync.sh` and why it's
  needed (non-interactive bash doesn't run `~/.zshrc`'s proxy hook)
- Replace the "30秒超时" reference with the actual 300s default +
  `BIJI_GIT_TIMEOUT_MS` override

## 4. Verification

1. `npx vitest run src/core/git_ops.test.ts` — existing 4 tests should
   still pass unchanged (sanity check, code untouched)
2. Re-deploy: `cp scripts/launchd/run-sync.sh ~/.biji-cli/run-sync.sh &&
   chmod +x ~/.biji-cli/run-sync.sh`
3. Re-load the existing 5-minute test job:
   `launchctl load ~/Library/LaunchAgents/com.bijicli.sync.test.plist`
4. Watch `~/.biji-cli/sync.log` — expect `同步完成: status=...` within
   tens of seconds (not another 5-minute `ETIMEDOUT`)
5. `launchctl unload
   ~/Library/LaunchAgents/com.bijicli.sync.test.plist` once confirmed

## 5. Out of Scope

- Whether `getNewNotes` (Puppeteer → biji.com) has its own connectivity
  issue under launchd — the failed test run never reached this step (it
  failed earlier, at `git pull --rebase`). Re-test after this fix lands;
  address separately if a new failure mode appears here.
- The unrelated uncommitted `README.md` change (links to
  `docs/biji-sync.md`, adds screenshots) — untouched by this work.
