# Biji Sync：同步新笔记到 Obsidian Vault

`biji sync` 是 `biji-cli` 的一个子命令，用于在一台常驻、闲置的 Mac 上定期（默认每小时，通过
launchd）把新增的 biji.com 笔记同步到一个独立的 Obsidian vault git 仓库，再通过该仓库 +
主 Mac 上的 Obsidian Git 插件自动拉取，最终出现在用户的 Obsidian vault 中。

本文档描述的是当前实现的行为；安装、登录与命令速查请参考 [README](../README.md)。

## 1. 整体流程

每次运行 `biji sync`（`runSync()`，`src/core/sync_notes.ts`）按以下步骤执行：

1. **检查本地仓库是否存在**：若 `syncRepoPath`（本地仓库的绝对路径，见第 2 节）不是
   git 仓库（`isGitRepo`），**不会自动 clone**——记录日志、发邮件提示用户手动 `git
   clone` 到该路径（或 clone 到别处后用绝对路径重新配置 `syncRepoPath`），
   `exitCode=1` 退出。原因和手动 clone 后的网络配置建议见第 8 节。
2. **`git pull --rebase`**：拉取远端最新内容。失败 → 记录日志、发邮件、`exitCode=1` 退出。
3. **读取状态文件** `<syncRepoPath>/.biji-sync-state.json`：
   - **不存在** → 首次运行：写入初始状态（`lastSyncedAt = lastChangedAt = 当前时间`，
     `lastStatus = "ok"`），生成 `_biji-sync-status.md`，
     `git commit -m "biji sync: initialize"` 并推送，**不拉取任何笔记**，直接返回。
   - **存在** → 进入第 4 步。
4. **获取新笔记**：调用 `getNewNotes(lastSyncedAt)`（见第 3 节），对返回的每条笔记
   （按 `created_at` 从旧到新）依次调用：
   ```ts
   saveNoteAsMarkdown({
     noteId: getItemId(note),
     outputDir: join(syncRepoPath, 'inbox'),
     assetsDir: join(syncRepoPath, 'Assets'),
     imageFormat: 'obsidian',
     isOriginal: true,
   })
   ```
   - 全部成功 → `status: "ok"`, `errorMessage: null`
   - 任意一步抛出异常（最常见：未登录）→ `status: "error"`, `errorMessage: <异常信息>`，
     本轮不写入任何笔记
5. **计算新状态**（`computeNextState`，见第 4 节），判断是否 `changed`：
   - `lastSyncedAt` 变化，或 `lastStatus` / `lastErrorMessage` 变化 → `changed = true`
   - 否则 `changed = false`（本轮无任何变化，工作区保持 clean，不产生提交）
6. **若 `changed`**：
   - 覆盖写入 `.biji-sync-state.json`（原子写：先写 `.tmp` 再 `rename`）和
     `_biji-sync-status.md`
   - `git add -A && git commit -m "biji sync: <n> new note(s)"`
     （`n === 0` 时提交信息为 `"biji sync: status update"`）
   - `git push`（失败 → 一次 `pull --rebase` + 重试，见第 5 节）；
     仍失败 → 记录日志、发邮件、`exitCode=1` 退出，本地提交保留，下次运行重试
7. **若 `lastStatus` 发生 `ok ↔ error` 翻转**：发送状态变化邮件（见第 6 节）
8. **无论以上结果如何**：向 `~/.biji-cli/sync.log` 追加一行
   `[时间戳] 同步完成: status=... 新笔记=N ...`

## 2. 配置项

写入 `~/.bijirc.json`（通过 `biji config set` 或手动编辑），均可被同名环境变量覆盖：

| 配置项（`~/.bijirc.json`） | 环境变量 | 默认值 | 说明 |
|---|---|---|---|
| `syncRepoPath` | `BIJI_SYNC_REPO_PATH` | `~/.biji-cli/vault-sync` | 本地仓库的绝对路径——必须是手动 `git clone` 同步仓库后的实际目录（见第 1 节、第 8 节） |
| `notifyEmail` | `BIJI_NOTIFY_EMAIL` | 无（可选） | 失败/恢复通知收件地址 |
| `smtp` | 无（仅配置文件） | 无（可选） | `{ host, port, secure, user, pass, from }`，发信凭据 |

`syncRepoPath` / `notifyEmail` 可通过：

```bash
biji config set --sync-repo-path <本地仓库的绝对路径>
biji config set --notify-email <邮箱>
```

`smtp` 字段需直接编辑 `~/.bijirc.json`（仅留在本机，不进入同步仓库）。

## 3. 新笔记获取与分页（`src/core/get_new_notes.ts` + `src/core/notes_list.ts`）

- 通过 Puppeteer 以 headless 模式打开 `https://www.biji.com/note`，拦截
  `/voicenotes/web/notes?...sort=create_desc` 接口的响应（每页 `data.c.list`，按创建时间倒序）。
- 累积结果；每当列表滚动到底部（`triggerLoadMore` 模拟无限滚动）即触发下一页请求。
- **分页停止条件**（`needsMorePages`）：`!hasMore`，或已累积列表中**最旧一条**的
  `created_at <= sinceTimestamp` 时停止——按时间阈值判断而非匹配某条具体笔记，因此即使
  `sinceTimestamp` 对应的那条笔记后来被删除，逻辑依然正确。
- 防御性上限：`MAX_PAGES = 200`，避免服务端持续返回 `has_more=true` 时占满整个小时窗口。
- **最终结果**（`selectNewNotes`）：`created_at > sinceTimestamp` 的笔记，按 `created_at`
  升序（旧→新）返回，逐条保存。
- **下一次 `lastSyncedAt`**（`computeLastSyncedAt`）：本轮同步笔记中 `created_at` 的最大值；
  若本轮没有新笔记，保持不变。

## 4. 状态文件与状态说明

### `.biji-sync-state.json`（提交进同步仓库）

```json
{
  "lastSyncedAt": "2026-06-11 09:00:00",
  "lastStatus": "ok",
  "lastErrorMessage": null,
  "lastChangedAt": "2026-06-11 09:00:03"
}
```

- `lastSyncedAt`：已同步笔记的高水位时间戳（下次拉取的 `since`）
- `lastStatus` / `lastErrorMessage`：上一次运行的结果
- `lastChangedAt`：状态文件最后一次实际变化的时间（用于 `_biji-sync-status.md`）

读取时（`loadState`）会校验字段类型；若文件存在但格式不合法（例如手动改坏），会抛出异常并
**中断本轮运行**（见第 7 节已知限制）。写入（`saveState`）采用临时文件 + `rename`
的原子写入，避免写入中途崩溃导致文件损坏。

### `_biji-sync-status.md`（提交进同步仓库，文件名加下划线前缀以便在 Obsidian 中区分）

正常：
```markdown
# Biji Sync Status

- Last change: 2026-06-11 09:00:03
- Result: ✅ ok
```

出错：
```markdown
# Biji Sync Status

- Last change: 2026-06-11 11:00:02
- Result: ❌ error
- Error: 未登录，请到闲置 Mac 上运行 `biji login`
```

只在状态**真正变化**时更新并提交，保持仓库历史可读（不会每小时都产生一条提交）。

## 5. Git 操作与推送重试（`src/core/git_ops.ts`）

- 所有 git 命令使用 `GIT_TERMINAL_PROMPT=0` + 300 秒（5 分钟）超时（可通过环境变量
  `BIJI_GIT_TIMEOUT_MS` 覆盖），避免无人值守时卡在交互式凭据/host key 提示，同时给
  大型私有 vault 的克隆/拉取留出足够时间。
- git 命令在 `syncRepoPath` 目录下直接执行 `git pull` / `git push`，使用该仓库自身的
  `origin` remote（由手动 `git clone` 时决定），不修改 `~/.gitconfig`：该机器全局
  git 配置中的 URL 重写规则（如 `insteadOf`）、credential helper 等都会正常生效。
  如果这台机器访问 GitHub 存在连通性问题（例如某个端口被网络封锁），参见第 8 节
  的 `~/.ssh/config` 配置说明。
- `gitPushWithRetry`：
  1. `git push`
  2. 若失败 → `git pull --rebase`
     - 仍失败 → `git rebase --abort`，返回失败（错误信息包含两次失败的原因）
     - 成功 → 再 `git push` 一次，作为最终结果

## 6. 邮件通知（`src/core/notify_email.ts`）

### 6.1 原理

`biji sync` 内部用 [`nodemailer`](https://nodemailer.com/) 通过标准 **SMTP 协议**发邮件——
本质上是"借用一个邮箱账号的登录凭据，登进它的发信服务器，代它发一封纯文本邮件给收件人"。

```
biji sync 进程
   └─ smtp.user + smtp.pass 登录 smtp.host:port
        └─ 以 smtp.from 为发件人，给 notifyEmail 发一封纯文本邮件
```

### 6.2 需要配置的两类内容

| 字段 | 含义 |
|---|---|
| `notifyEmail` | **收件人**——想用哪个邮箱接收通知（可以是日常邮箱） |
| `smtp.*` | **发件账号**——用谁的邮箱、什么凭据来发信 |

`notifyEmail` 和 `smtp.user` **不必是同一个邮箱**——常见做法是专门注册一个"机器人邮箱"
作为 `smtp.user` 发信，发到自己的主邮箱 `notifyEmail`。

### 6.3 选择发件邮箱服务商（不限于 Gmail）

`smtp.*` 是标准 SMTP 配置，**任何提供 SMTP 服务的邮箱都行**，不是必须用 Gmail。

#### 以 Gmail 作为发件账号

1. **准备一个 Gmail 账号**——建议专门注册一个，不要用主账号。原因：`smtp.pass` 以明文
   存在 `~/.bijirc.json` 里，万一这台闲置 Mac 被入侵，泄露的只是这个小号的发信权限，
   而不是主邮箱。
2. **给这个 Gmail 开启两步验证（2FA）**——Gmail 的"应用专用密码"功能要求账号已开启
   2FA，否则生成不了。
3. **生成应用专用密码**：Google 账号 → 安全性 → 两步验证 → 应用专用密码，生成一个
   16 位密码（去掉中间的空格）。这个密码只能用于这一个用途，随时可单独撤销，不影响该
   Gmail 账号的正常登录密码。
4. 填入 `~/.bijirc.json`：

   ```json
   "smtp": {
     "host": "smtp.gmail.com",
     "port": 465,
     "secure": true,
     "user": "你的机器人账号@gmail.com",
     "pass": "刚生成的16位应用专用密码",
     "from": "你的机器人账号@gmail.com"
   }
   ```

   注意 `from` 必须和 `user` 是同一个地址（或该账号已验证的别名）——Gmail 的 SMTP
   服务器会拒绝/改写不一致的 `From`。

#### 以 QQ 邮箱作为发件账号

1. 登录 QQ 邮箱网页版 → 设置 → 账号 → 开启"POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV
   服务"中的 **IMAP/SMTP 服务**
2. 按提示发短信验证，获得一个**授权码**（16 位字符串）——这个授权码就是 `smtp.pass`，
   **不是** QQ 密码
3. 填入 `~/.bijirc.json`：

   ```json
   "smtp": {
     "host": "smtp.qq.com",
     "port": 465,
     "secure": true,
     "user": "你的账号@qq.com",
     "pass": "刚生成的授权码",
     "from": "你的账号@qq.com"
   }
   ```

163 邮箱（`smtp.163.com`）、企业邮箱（腾讯企业邮 `smtp.exmail.qq.com`）等同理，都需要
单独开启 SMTP 服务并生成"授权码"。

无论选哪家，`notifyEmail` 用 `biji config set --notify-email you@example.com` 单独
设置即可，这一步不涉及 SMTP，可以是另一个邮箱。

### 6.4 网络要求

**`smtp.host`（发信服务器）需要从这台闲置 Mac 网络可达，但 `notifyEmail`
（收件地址）的邮箱服务商不需要。**

流程是：

```
闲置 Mac --SMTP--> smtp.host（发件账号的发信服务器）
                       └──（由 smtp.host 自己处理后续投递）──> notifyEmail 所在的邮箱服务器
```

闲置 Mac 只需要连得上 `smtp.host:port` 这一步；从 `smtp.host` 投递到 `notifyEmail` 是邮件
服务器之间的标准 SMTP 中转，跟闲置 Mac 的网络环境无关。

**如果用 Gmail 作 `smtp.host`**：`smtp.gmail.com` 在 GFW 屏蔽范围内，不只是网页版，SMTP
端口在国内通常也连不通。闲置 Mac 在国内、又没有可靠代理时，用 Gmail 作发信账号大概率会
**发信失败**。但**收件地址 `notifyEmail` 可以照样是 Gmail**——闲置 Mac 不需要访问
Gmail，投递是 `smtp.host` 和 Gmail 服务器之间的事。

**结论**：闲置 Mac 在国内网络环境下，`smtp.host` 建议选 QQ/163/企业邮箱等国内可达的
服务商；`notifyEmail`（收件人）用什么邮箱不受限制，包括 Gmail。

即使发信失败，也**不影响 `biji sync` 本身**：`notify()` 把 `sendStatusEmail` 包在
`try/catch` 里，失败只写一行日志 `发送通知邮件失败: ...`，不影响克隆/拉取/同步笔记/
提交/推送这些主流程。邮件通知是 best-effort 的次要通知层，还有 `_biji-sync-status.md`
+ `~/.biji-cli/sync.log` 这两层兜底。

### 6.5 触发条件

仅在 `notifyEmail` 与 `smtp` 均已配置时发送（10 秒连接/握手/socket 超时）。触发条件：

- **同步仓库不存在**：`syncRepoPath` 不是 git 仓库（见第 1 节第 1 步）——标题
  "biji sync: 需要手动 clone 同步仓库"
- **git 失败**：pull --rebase / commit / push（含重试后仍失败）
- **状态翻转**：`lastStatus` 由 `ok → error`（标题"biji sync: 出错"）或
  `error → ok`（标题"biji sync: 已恢复"）

**不会**因为以下情况发邮件：常规成功同步（即使有新笔记）、连续多次相同的 error 状态
（避免问题未解决时每小时收到一封重复邮件）。配置好之后第一次运行 `biji sync`
大概率不会触发任何邮件，这是正常现象。
[邮件配置](../screenshot/confirm-notify.png)

发信失败本身只记录日志，不影响 `runSync` 的整体结果（best-effort，邮件是次要通知层）。

### 6.6 测试邮件功能

配置好 `notifyEmail` + `smtp` 后，可用以下方式快速触发一封邮件，验证 SMTP 凭据和收件
地址是否工作正常：

- **最简单**（无需额外操作）：如果 `syncRepoPath` 还不是 git 仓库（例如刚安装好、
  还没手动 clone 同步仓库, 已clone情况可以暂时改名），直接运行 `biji sync` 即可触发"biji sync: 需要手动
  clone 同步仓库"邮件。
- **测试 git 失败邮件**：在 `syncRepoPath` 目录下执行
  `git remote set-url origin <一个不存在的地址>`，再运行 `biji sync`，此时
  `git pull --rebase` 会失败，触发"biji sync: git pull 失败"邮件。测试完成后用
  `git remote set-url origin <正确地址>` 改回来。
- **测试状态翻转邮件**：需要连续两次运行之间 `lastStatus` 发生变化。例如先在未
  登录状态下运行一次 `biji sync`（`getNewNotes` 抛出未登录异常，`lastStatus`
  变为 `error`，触发"biji sync: 出错"），再 `biji login` 后运行一次（`lastStatus`
  变回 `ok`，触发"biji sync: 已恢复"）。

## 7. 已知限制

- `getNewNotes` 内部启动 Puppeteer；若浏览器启动或页面加载卡死，`runSync` 会无限期挂起，
  没有超时兜底（不会写日志、不会发邮件）。
- 第 1/2/6 步的 git 层面失败（clone / pull --rebase / commit / push）不会把
  `.biji-sync-state.json` 的 `lastStatus` 改为 `"error"`——这类失败只通过日志 + 邮件提示；
  `_biji-sync-status.md` 在仓库里可能仍显示 `✅ ok`（因为推送失败导致它本就没能更新到
  远程）。
- 若 `.biji-sync-state.json` 被手动改坏（字段类型不对），`loadState` 会抛出未捕获异常，
  本轮直接中断，不写日志、不发邮件。

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

### SSH 远程的网络配置与首次 clone

如果这台机器直连 `github.com:22` 不通或很慢，在 `~/.ssh/config`（权限建议 `600`）中
为 `github.com` 配置 GitHub 的 443 端口入口：

```sshconfig
Host github.com
  HostName ssh.github.com
  Port 443
  User git
```

- `HostName ssh.github.com` + `Port 443`：使用 GitHub 官方提供的备用 SSH 入口，
  规避 22 端口在部分网络下被封锁的问题，**不需要本地代理**。
- 这个配置同时覆盖 HTTPS 格式的仓库 remote：如果该机器 `~/.gitconfig` 中有
  `url "git@github.com:" insteadOf = https://github.com/` 之类的规则，HTTPS
  地址会被静默改写为 SSH 后命中上面的 `Host github.com` 配置；没有这条规则时，
  HTTPS 仍按 HTTPS 直连，需另行确保该机器到 `github.com:443` 的连通性。

验证：`ssh -T git@github.com`，预期输出
`Hi <用户名>! You've successfully authenticated, but GitHub does not provide
shell access.`。若报 `Permission denied (publickey)`，说明这台机器还没有把
SSH key 添加到 GitHub 账号（GitHub Settings → SSH and GPG keys）。

**不要**通过 `ProxyCommand` 把这个连接再转给本机的 SOCKS5 代理（例如 Clash 的
`127.0.0.1:7890`）：实测 `ssh.github.com:443` 经由本机代理可以完成认证甚至开始
传输数据，但会在传输中途被代理悄悄断开（`Connection closed by UNKNOWN port
65535` / `fatal: Could not read from remote repository`），对 `ssh -T` 这类
一次性小请求看不出问题，但 `git clone` 这种持续传输会在传完一小部分后失败。直连
`ssh.github.com:443`（不经代理）虽然可能较慢，但连接是稳定的。

#### 首次 clone 需要手动执行

`biji sync` 检测到 `syncRepoPath` 不是 git 仓库时，**不会自动 `git clone`**，
只会记录日志并（若已配置邮件通知）发送一封包含具体命令的提示邮件，然后
`exitCode=1` 退出。需要手动执行：

```bash
git clone <你的 Obsidian vault 仓库地址> <syncRepoPath>
```

`<syncRepoPath>` 默认是 `~/.biji-cli/vault-sync`；如果想 clone 到别的目录，clone
完成后需要用绝对路径配置 `syncRepoPath`（见第 2 节），让它指向实际的 clone 目录：

```bash
biji config set --sync-repo-path /绝对/路径/到/你的vault
```

原因：首次 clone 要拉取完整的仓库历史，如果 vault 体积较大（尤其包含 Git LFS
资源）且网络较慢（例如走上面的 `ssh.github.com:443` 直连），可能需要数十分钟，
远超第 5 节中 `BIJI_GIT_TIMEOUT_MS` 的默认 300 秒——这正是之前看到的
`spawnSync git ETIMEDOUT`（已建立连接、正在传输，只是 300 秒内传不完）的根因。
手动执行不受这个超时限制，可以耐心等它跑完。

clone 完成后正常运行 `biji sync` 即可完成首次初始化（写入状态文件并提交推送，
不会拉取任何历史笔记）；此后每次同步只是增量的 `pull --rebase` + `push`，数据量
很小，300 秒的默认超时完全够用。
