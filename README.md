# biji-cli

Get笔记 CLI 工具 - 一键获取笔记内容并保存为 Markdown 文件

## 🌟 功能特点

- 📥 一键获取 Get笔记内容并保存为 Markdown
- 🖼️ 自动下载图片到本地
- 📝 支持普通笔记和原文笔记两种格式
- 🔄 支持获取最新一篇笔记
- 🔗 支持 URL 和笔记 ID 两种输入方式
- 💾 支持 Obsidian 格式 (`![[]]`) 和标准格式 (`![]()`)
- 🤖 **提供 Claude Code Skill，支持自然语言调用**（推荐）
- ⚙️ 灵活的配置系统，支持命令行、配置文件、环境变量

## 📦 安装

### NPM 全局安装（推荐）

```bash
npm install -g biji-cli
```

### 从源代码安装

```bash
cd /path/to/get-info-from-biji
npm install
npm run build
```

**使用方式**：
- **推荐**：使用 `npm run biji -- <命令>`（注意 `--` 分隔符）
- 或者：`node dist/cli.js <命令>`

**示例**：
```bash
# 注意：使用 -- 分隔符，否则带 -- 的参数会被 npm 吃掉
npm run biji -- config set --output-dir ~/Documents/MyNotes
npm run biji -- get-latest

# 或者使用 node 直接运行
node dist/cli.js config set --output-dir ~/Documents/MyNotes
```

## 🚀 快速开始

### 方式 1: 使用 Claude Code Skill（最推荐）⭐

**一键安装，使用自然语言获取笔记！**

```bash
# 1. 安装 biji-cli
npm install -g biji-cli

# 2. 登录 biji.com
biji login

# 3. 安装 Claude Code Skill
biji install-skill
```

**安装后，您可以直接在 Claude Code 中使用自然语言：**
- "保存最新的 biji 笔记"
- "获取笔记 1900215167371849544"
- "从 biji 获取这个笔记 https://www.biji.com/note/xxx"
- "获取最新的原文笔记"

Skill 会自动调用 biji-cli 命令，无需记忆复杂的命令行参数！

---

### 方式 2: 使用 CLI 命令

**登录**
```bash
biji login
```

**获取笔记**
```bash
# 使用笔记 ID
biji get-note 1900215167371849544

# 使用完整 URL
biji get-note https://www.biji.com/note/1900215167371849544

# 获取原文笔记（带 /web 后缀）
biji get-note https://www.biji.com/note/1900215167371849544/web

# 获取最新笔记
biji get-latest

# 获取最新原文笔记
biji get-latest-original
```

---

## ⚙️ 配置输出目录

biji-cli 支持三种配置方式，优先级从高到低：

### 方式 1: 配置命令（推荐）

```bash
# 查看当前配置
biji config show

# 使用配置向导（最简单）
biji config wizard

# 直接设置输出目录
biji config set --output-dir ~/Documents/MyNotes

# 设置 Assets 目录
biji config set --assets-dir ~/Documents/MyNotes/Assets
```

配置文件保存在 `~/.bijirc.json`，修改后立即生效。

### 方式 2: 命令行参数（一次性）

```bash
biji get-note <ID> ~/custom/path
```

### 方式 3: 环境变量

```bash
export BIJI_OUTPUT_DIR="~/Documents/MyNotes"
export BIJI_ASSETS_DIR="~/Documents/MyNotes/Assets"
```

### 默认配置

如果未配置，使用以下默认值：

| 配置项 | 默认值 |
|--------|--------|
| **输出目录** | `~/Documents/A第二大脑` |
| **Assets 目录** | `{输出目录}/Assets` |
| **图片格式** | Obsidian (`![[]]`) |

---

## 📋 命令速查

| 命令 | 说明 |
|------|------|
| `biji login` | 登录 biji.com 账号 |
| `biji check-login` | 检查登录状态 |
| `biji install-skill [--force]` | **安装 Claude Code Skill**（推荐） |
| `biji config show` | 查看当前配置 |
| `biji config wizard` | 交互式配置向导 |
| `biji config set --output-dir <path>` | 设置输出目录 |
| `biji get-note <URL\|ID>` | 获取指定笔记（支持完整 URL 或 ID） |
| `biji get-latest` | 获取最新一篇笔记 |
| `biji get-latest-original` | 获取最新一篇原文笔记 |

---

## 📖 Claude Code Skill 使用指南

### 安装 Skill

```bash
biji install-skill
```

### 使用示例

安装后，在 Claude Code 中直接使用自然语言：

```
✓ "保存最新的 biji 笔记"
✓ "获取笔记 1900215167371849544"
✓ "从 biji 获取笔记 https://www.biji.com/note/xxx"
✓ "获取最新的原文笔记"
✓ "保存这个 biji 笔记到 ~/Documents/MyNotes"
```

### Skill 工作原理

- Skill 监听关键词：保存笔记、获取 biji、biji 笔记、get-note
- 自动调用 biji-cli 命令
- 零 token 开销（相比 MCP 服务器）
- 支持所有 CLI 功能

### 更新 Skill

如果更新了 biji-cli，重新安装 Skill：

```bash
biji install-skill --force
```

---

## 🔧 高级用法：MCP 服务器（可选）

如果您需要更精细的控制或要在其他应用中使用，可以启用 MCP 服务器。

### 在 Claude Desktop 中配置

在 `~/Library/Application Support/Claude/claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "biji": {
      "command": "node",
      "args": ["/path/to/get-info-from-biji/dist/mcp/index.js"]
    }
  }
}
```

**注意**：将 `/path/to/get-info-from-biji` 替换为实际的项目路径。

### MCP 可用工具

| 工具 | 描述 | 参数 |
|------|------|------|
| `biji_login` | 登录 biji.com 账号 | 无 |
| `biji_check_login` | 检查登录状态 | 无 |
| `biji_get_note_detail` | 获取笔记详情 | `urlOrId`（URL 或笔记 ID） |
| `biji_save_note_as_markdown` | 获取笔记并保存为 Markdown | `urlOrId`, `outputDir`（可选）, `imageFormat`（可选） |
| `biji_get_latest_note` | 获取最新笔记并保存为 Markdown | `outputDir`（可选）, `imageFormat`（可选） |
| `biji_get_latest_original_note` | 获取最新原文笔记并保存为 Markdown | `outputDir`（可选）, `imageFormat`（可选） |

**注意**：使用 MCP 服务器会消耗约 350 tokens（工具描述开销）。推荐使用 Skill 方式，零 token 开销。

---

## 📂 输出格式

### 文件结构

```
~/Documents/A第二大脑/
├── 笔记标题.md
└── Assets/
    ├── xxx.jpg
    └── yyy.jpg
```

### Markdown 格式

```markdown
# 笔记标题

笔记内容...

![[图片1.jpg]]
![[图片2.jpg]]
```

- 图片使用 Obsidian 格式 `![[filename]]`
- 图片保存在 `Assets/` 子目录中

---

## 📝 笔记类型说明

### 普通笔记
- URL: `https://www.biji.com/note/{noteId}`
- AI 生成的摘要笔记

### 原文笔记
- URL: `https://www.biji.com/note/{noteId}/web`
- 用户保存的原文内容

---

## 🔍 工作原理

1. 使用 Puppeteer 拦截 biji.com 的 API 请求
2. 获取笔记的完整 JSON 数据
3. 提取内容和图片链接
4. 下载图片到本地 `Assets/` 目录
5. 替换图片链接为 Obsidian 格式
6. 生成 Markdown 文件

---

## 📁 项目结构

```
.
├── src/
│   ├── core/
│   │   ├── login.ts              # 登录功能
│   │   ├── check_login.ts        # 检查登录状态
│   │   ├── config.ts             # 配置管理
│   │   ├── install_skill.ts      # Skill 安装
│   │   ├── get_note_detail.ts   # 获取笔记详情（支持普通/原文）
│   │   ├── get_latest_note.ts    # 获取最新笔记
│   │   └── convert_to_md.ts     # 转换为 Markdown
│   ├── mcp/
│   │   ├── index.ts              # MCP 服务器
│   │   ├── tools.ts              # 工具定义
│   │   └── handlers.ts           # 工具处理器
│   ├── utils/
│   │   └── url.ts               # URL 解析工具
│   └── types/note.ts            # 类型定义
├── skills/
│   └── biji-cli/
│       └── SKILL.md             # Claude Code Skill 文件
```

---

## 📦 依赖说明

本项目使用以下 npm 包：

- `@asd345gh/mcpkit` - MCP 工具包
  - `@asd345gh/mcpkit/browser` - Puppeteer 浏览器工具
  - `@asd345gh/mcpkit/mcp` - MCP 服务器创建工具
  - `@asd345gh/mcpkit/utils` - 缓存等实用工具
- `@modelcontextprotocol/sdk` - MCP SDK
- `puppeteer-core` - 浏览器自动化

---

## ⚙️ 配置文件详解

### 配置优先级

从高到低：
1. 命令行参数（一次性）
2. 环境变量
3. 配置文件（`~/.bijirc.json`）
4. 默认值

### 配置文件格式

在用户主目录创建 `~/.bijirc.json`：

```json
{
  "outputDir": "~/Documents/MyNotes",
  "assetsDir": "~/Documents/MyNotes/Assets"
}
```

**注意**：
- 配置文件修改后立即生效，无需重启
- 使用 `biji config wizard` 可自动生成配置文件
- 路径支持 `~` 符号表示用户主目录

---

## ❓ 常见问题

### Q: Skill 和 MCP 有什么区别？
**A:**
- **Skill**（推荐）：零 token 开销，使用自然语言，更简单
- **MCP**：更精细的控制，但消耗约 350 tokens

### Q: 修改配置后需要重启吗？
**A:** 不需要。配置文件修改后立即生效。

### Q: 可以同时使用 Skill 和 CLI 命令吗？
**A:** 可以。Skill 内部就是调用 CLI 命令，两者完全兼容。

### Q: 如何更新 Skill？
**A:** 运行 `biji install-skill --force` 强制重新安装。

---

## 📄 License

MIT
