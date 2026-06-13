# Biji Sync launchd Proxy Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `biji sync` launchd job succeed by auto-detecting and exporting the local Clash proxy in `run-sync.sh`, so HTTPS git operations to github.com don't hang in launchd's non-interactive shell.

**Architecture:** Commit the pre-existing `git_ops.ts` hardening (5-minute timeout + HTTPS gitconfig bypass) that this fix depends on. Add a one-shot proxy-detection block (mirrors `~/.zshrc`'s `_auto_proxy`) to `scripts/launchd/run-sync.sh`, before calling `biji sync`. Update `docs/biji-sync.md` to document both. Verify end-to-end using the existing 5-minute test LaunchAgent (`~/Library/LaunchAgents/com.bijicli.sync.test.plist`).

**Tech Stack:** bash, launchd (macOS), git, vitest, TypeScript (biji-cli)

**Reference spec:** `docs/superpowers/specs/2026-06-13-biji-sync-launchd-proxy-design.md`

---

### Task 1: Commit the pre-existing `git_ops.ts` hardening

This is already-written, already-approved code sitting as an uncommitted
diff. It must land first because `dist/cli.js` (the binary `biji` actually
runs) is already built from it — Task 4's verification depends on its
5-minute timeout and HTTPS gitconfig bypass behavior.

**Files:**
- Modify: `src/core/git_ops.ts` (already modified, uncommitted)
- Test: `src/core/git_ops.test.ts` (already created, untracked)

- [ ] **Step 1: Run the existing tests to confirm they pass**

Run: `npx vitest run src/core/git_ops.test.ts`

Expected: all 4 tests pass, e.g.

```
 ✓ src/core/git_ops.test.ts (4 tests)

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

- [ ] **Step 2: Commit**

```bash
git add src/core/git_ops.ts src/core/git_ops.test.ts
git commit -m "$(cat <<'EOF'
fix: bypass global gitconfig URL rewrites for HTTPS sync remotes

~/.gitconfig's global `url "git@github.com:" insteadOf =
https://github.com/` rewrite was forcing HTTPS-configured sync repos onto
SSH, which the idle Mac has no key for. Set GIT_CONFIG_GLOBAL=/dev/null
for HTTPS remotes in clone/pull/push so the configured URL is used as-is.

Also raise the default git operation timeout from 30s to 300s (5 min,
overridable via BIJI_GIT_TIMEOUT_MS) to give large private-vault
clones/pulls enough headroom.
EOF
)"
```

---

### Task 2: Add Clash proxy detection to `run-sync.sh`

**Files:**
- Modify: `scripts/launchd/run-sync.sh`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `scripts/launchd/run-sync.sh` with:

```bash
#!/bin/bash
# Wrapper script for `biji sync`, run hourly via launchd on the idle Mac.
# Sets PATH so git/node/biji resolve under launchd's minimal environment
# (spec §6).

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

if ! command -v biji >/dev/null 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: 'biji' not found on PATH ($PATH). Check your Node/npm install location and update the PATH line above." >&2
  exit 1
fi

# Auto Clash proxy (one-shot version of ~/.zshrc's _auto_proxy precmd hook).
# launchd runs this as a non-interactive shell, which never sources
# ~/.zshrc, so without this git's HTTPS connections to github.com have no
# proxy and hang until git_ops.ts's timeout (ETIMEDOUT).
CLASH_PORT=7890
if nc -z -G 1 127.0.0.1 "$CLASH_PORT" 2>/dev/null; then
  export http_proxy="http://127.0.0.1:${CLASH_PORT}"
  export https_proxy="http://127.0.0.1:${CLASH_PORT}"
  export all_proxy="socks5://127.0.0.1:${CLASH_PORT}"
  export no_proxy="localhost,127.0.0.1,::1"
fi

biji sync
```

- [ ] **Step 2: Syntax-check the script**

Run: `bash -n scripts/launchd/run-sync.sh`

Expected: no output, exit code 0 (no syntax errors).

- [ ] **Step 3: Commit**

```bash
git add scripts/launchd/run-sync.sh
git commit -m "$(cat <<'EOF'
feat(launchd): auto-detect Clash proxy for non-interactive sync runs

run-sync.sh now checks 127.0.0.1:7890 (Clash) before calling `biji
sync` and exports http_proxy/https_proxy/all_proxy/no_proxy if it's
open. This is a one-shot version of ~/.zshrc's _auto_proxy hook, which
only runs in interactive zsh sessions and never fires for launchd's
non-interactive bash. Without a proxy, this Mac cannot reach
github.com directly and git pull --rebase hangs until ETIMEDOUT.
EOF
)"
```

---

### Task 3: Update `docs/biji-sync.md`

**Files:**
- Modify: `docs/biji-sync.md` (§5 around line 128, §8 around lines 269-292)

- [ ] **Step 1: Correct the git timeout description in §5**

In `docs/biji-sync.md`, find this text (currently lines 126-130):

```markdown
## 5. Git 操作与推送重试（`src/core/git_ops.ts`）

- 所有 git 命令使用 `GIT_TERMINAL_PROMPT=0` + 30 秒超时，避免无人值守时卡在交互式
  凭据/host key 提示。
- `gitPushWithRetry`：
```

Replace with:

```markdown
## 5. Git 操作与推送重试（`src/core/git_ops.ts`）

- 所有 git 命令使用 `GIT_TERMINAL_PROMPT=0` + 300 秒（5 分钟）超时（可通过环境变量
  `BIJI_GIT_TIMEOUT_MS` 覆盖），避免无人值守时卡在交互式凭据/host key 提示，同时给
  大型私有 vault 的克隆/拉取留出足够时间。
- 对 HTTPS 远程地址（`clone` / `pull --rebase` / `push`），临时设置
  `GIT_CONFIG_GLOBAL=/dev/null`，避免 `~/.gitconfig` 中类似
  `url "git@github.com:" insteadOf = https://github.com/` 的全局规则把 HTTPS
  远程改写成 SSH（闲置 Mac 上通常没有配置对应的 SSH key）。
- `gitPushWithRetry`：
```

- [ ] **Step 2: Document the proxy-detection step in §8**

In `docs/biji-sync.md`, find this text (currently lines 269-292):

````markdown
## 8. 定时运行（launchd）

模板文件：
- `scripts/launchd/run-sync.sh` — 设置
  `PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"`，检查 `biji`
  是否可执行（找不到时输出诊断信息并以非零退出），再调用 `biji sync`
- `scripts/launchd/com.bijicli.sync.plist` — `StartCalendarInterval { Minute: 0 }`
  （每小时整点触发），stdout/stderr 都重定向到 `~/.biji-cli/sync.log`

部署步骤：

```bash
mkdir -p ~/.biji-cli
cp scripts/launchd/run-sync.sh ~/.biji-cli/run-sync.sh
chmod +x ~/.biji-cli/run-sync.sh

# 将模板中的 <USERNAME> 替换为 `whoami` 的输出
sed "s/<USERNAME>/$(whoami)/g" scripts/launchd/com.bijicli.sync.plist > ~/Library/LaunchAgents/com.bijicli.sync.plist

launchctl load ~/Library/LaunchAgents/com.bijicli.sync.plist
```

注意：launchd LaunchAgent 只在用户处于登录会话时运行，闲置 Mac 需要开启自动登录，
否则定时任务不会触发。
````

Replace with:

````markdown
## 8. 定时运行（launchd）

模板文件：
- `scripts/launchd/run-sync.sh` — 设置
  `PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"`，检查 `biji`
  是否可执行（找不到时输出诊断信息并以非零退出），检测本机 Clash 代理（见 8.1），
  再调用 `biji sync`
- `scripts/launchd/com.bijicli.sync.plist` — `StartCalendarInterval { Minute: 0 }`
  （每小时整点触发），stdout/stderr 都重定向到 `~/.biji-cli/sync.log`

### 8.1 Clash 代理检测

`run-sync.sh` 在调用 `biji sync` 前会检测本机 `127.0.0.1:7890`（Clash 默认端口）是否
开放，若开放则导出 `http_proxy` / `https_proxy` / `all_proxy` / `no_proxy`：

```bash
CLASH_PORT=7890
if nc -z -G 1 127.0.0.1 "$CLASH_PORT" 2>/dev/null; then
  export http_proxy="http://127.0.0.1:${CLASH_PORT}"
  export https_proxy="http://127.0.0.1:${CLASH_PORT}"
  export all_proxy="socks5://127.0.0.1:${CLASH_PORT}"
  export no_proxy="localhost,127.0.0.1,::1"
fi
```

**为什么需要这一步**：`~/.zshrc` 里的 `_auto_proxy`（`precmd` 钩子）只在交互式 zsh
会话中运行，每次显示提示符前检测一次 Clash 是否开放。而 launchd 以非交互方式运行
`run-sync.sh`，永远不会触发这个钩子，因此 `git pull --rebase` 等命令会在没有代理的
情况下直连 `github.com`——如果这台 Mac 的直连网络不通，就会一直挂到第 5 节所述的
超时（`ETIMEDOUT`）。这段检测是 `_auto_proxy` 的"一次性"版本：每次 launchd 触发时
检测一次，而不是每次提示符都检测。

如果 Clash 未运行（`nc` 检测失败），不设置任何代理变量，行为与改动前一致（直连，
失败后记录日志+发邮件）。

部署步骤：

```bash
mkdir -p ~/.biji-cli
cp scripts/launchd/run-sync.sh ~/.biji-cli/run-sync.sh
chmod +x ~/.biji-cli/run-sync.sh

# 将模板中的 <USERNAME> 替换为 `whoami` 的输出
sed "s/<USERNAME>/$(whoami)/g" scripts/launchd/com.bijicli.sync.plist > ~/Library/LaunchAgents/com.bijicli.sync.plist

launchctl load ~/Library/LaunchAgents/com.bijicli.sync.plist
```

注意：launchd LaunchAgent 只在用户处于登录会话时运行，闲置 Mac 需要开启自动登录，
否则定时任务不会触发。
````

- [ ] **Step 3: Commit**

```bash
git add docs/biji-sync.md
git commit -m "$(cat <<'EOF'
docs: document launchd proxy detection, correct git timeout to 300s

§5 said git ops use a 30s timeout; the actual default is now 300s
(BIJI_GIT_TIMEOUT_MS-overridable) plus an HTTPS gitconfig bypass. §8
gains a new 8.1 explaining run-sync.sh's Clash proxy detection and why
launchd's non-interactive shell needs it (the ~/.zshrc _auto_proxy hook
only runs in interactive zsh).
EOF
)"
```

---

### Task 4: Deploy and verify end-to-end

**Files:** none (deployment/verification only — touches `~/.biji-cli/` and
`~/Library/LaunchAgents/`, outside the repo)

- [ ] **Step 1: Re-deploy the updated `run-sync.sh`**

```bash
cp scripts/launchd/run-sync.sh ~/.biji-cli/run-sync.sh
chmod +x ~/.biji-cli/run-sync.sh
```

Expected: no output. Verify with `head -1 ~/.biji-cli/run-sync.sh` → `#!/bin/bash`.

- [ ] **Step 2: Load the 5-minute test job and wait for it to produce a new log line**

```bash
LINES_BEFORE=$(wc -l < ~/.biji-cli/sync.log)
launchctl load ~/Library/LaunchAgents/com.bijicli.sync.test.plist
until [ "$(wc -l < ~/.biji-cli/sync.log)" -gt "$LINES_BEFORE" ]; do sleep 10; done
tail -1 ~/.biji-cli/sync.log
```

Expected: within ~5-6 minutes (StartInterval=300s, then a fast proxied git
pull), a new line appears:

```
[<timestamp>] 同步完成: status=ok 新笔记=N
```

This must NOT be another `git pull --rebase 失败: ... ETIMEDOUT` line. If it
is, STOP — do not retry blindly. Re-open the systematic-debugging skill:
check `~/.biji-cli/sync-test.log` for stderr from the proxy-detection block
itself (e.g. `nc: command not found`), and confirm Clash is actually
running (`nc -z -G 1 127.0.0.1 7890; echo $?` should print `0`).

- [ ] **Step 3: Unload the test job**

```bash
launchctl unload ~/Library/LaunchAgents/com.bijicli.sync.test.plist
launchctl list | grep bijicli
```

Expected: the second command's output does NOT include
`com.bijicli.sync.test` (it may print nothing, or print only
`com.bijicli.sync` if the hourly production job happens to be loaded on
this Mac).

---

## Out of Scope (per spec §5)

- Whether `getNewNotes` (Puppeteer → biji.com) has its own connectivity
  issue under launchd — untested by this plan since the previous failure
  occurred earlier (at `git pull --rebase`). If Step 2 of Task 4 instead
  fails at a *different* point (e.g. Puppeteer/login error), that is a new
  issue outside this plan's scope — report it, don't fix it here.
- The unrelated uncommitted `README.md` change.
