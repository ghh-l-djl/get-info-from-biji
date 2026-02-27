# biji-cli

Get笔记 CLI 工具和 MCP 服务器 - 一键获取笔记内容并保存为 Markdown 文件

## 功能特点

- 📥 一键获取 Get笔记内容并保存为 Markdown
- 🖼️ 自动下载图片到本地
- 📝 支持普通笔记和原文笔记两种格式
- 🔄 支持获取最新一篇笔记
- 🔗 支持 URL 和笔记 ID 两种输入方式
- 💾 支持 Obsidian 格式 (`![[]]`) 和标准格式 (`![]()`)
- 🤖 提供 MCP 服务器供 AI 直接调用

## 安装

```bash
cd /Users/xx/Documents/编程/项目/get-info-from-biji
npm install
npm run build
```

## CLI 使用

### 登录

```bash
npm run biji login
```

会打开浏览器窗口，请在浏览器中完成登录。

### 检查登录状态

```bash
npm run biji check-login
```

### 获取指定笔记

支持三种输入方式：

```bash
# 使用笔记 ID
npm run biji get-note 1900215167371849544

# 使用普通笔记 URL
npm run biji get-note https://www.biji.com/note/1900215167371849544

# 使用原文笔记 URL（带 /web 后缀）
npm run biji get-note https://www.biji.com/note/1900215167371849544/web

# 指定输出目录
npm run biji get-note 1900215167371849544 ~/Documents/MyNotes
```

### 获取最新笔记

```bash
# 获取最新一篇笔记
npm run biji get-latest

# 获取最新一篇原文笔记
npm run biji get-latest-original

# 指定输出目录
npm run biji get-latest ~/Documents/MyNotes
```

### 命令速查

| 命令 | 说明 |
|------|------|
| `biji login` | 登录 biji.com 账号 |
| `biji check-login` | 检查登录状态 |
| `biji get-note <URL\|ID>` | 获取指定笔记（支持完整 URL 或 ID） |
| `biji get-latest` | 获取最新一篇笔记 |
| `biji get-latest-original` | 获取最新一篇原文笔记 |

## MCP 服务器使用

### 在 Claude Desktop 中使用

在 `~/Library/Application Support/Claude/claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "biji": {
      "command": "node",
      "args": ["/Users/ghh/Documents/编程/项目/get-info-from-biji/dist/mcp/index.js"]
    }
  }
}
```

### 可用工具

| 工具 | 描述 | 参数 |
|------|------|------|
| `biji_login` | 登录 biji.com 账号 | 无 |
| `biji_check_login` | 检查登录状态 | 无 |
| `biji_get_note_detail` | 获取笔记详情 | `urlOrId`（URL 或笔记 ID） |
| `biji_save_note_as_markdown` | 获取笔记并保存为 Markdown | `urlOrId`, `outputDir`（可选）, `imageFormat`（可选） |
| `biji_get_latest_note` | 获取最新笔记并保存为 Markdown | `outputDir`（可选）, `imageFormat`（可选） |
| `biji_get_latest_original_note` | 获取最新原文笔记并保存为 Markdown | `outputDir`（可选）, `imageFormat`（可选） |

### AI 调用示例

```
# 获取指定笔记（支持 URL 或 ID）
帮我获取笔记 https://www.biji.com/note/1900215167371849544

# 获取原文笔记
保存原文笔记 https://www.biji.com/note/1900215167371849544/web

# 获取最新笔记
帮我获取最新的 biji 笔记

# 获取最新原文笔记
获取最新的原文笔记并保存到 ~/Documents/MyNotes
```

## 输出格式

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

## 笔记类型说明

### 普通笔记
- URL: `https://www.biji.com/note/{noteId}`
- AI 生成的摘要笔记

### 原文笔记
- URL: `https://www.biji.com/note/{noteId}/web`
- 用户保存的原文内容

## 工作原理

1. 使用 Puppeteer 拦截 biji.com 的 API 请求
2. 获取笔记的完整 JSON 数据
3. 提取内容和图片链接
4. 下载图片到本地 `Assets/` 目录
5. 替换图片链接为 Obsidian 格式
6. 生成 Markdown 文件

## 项目结构

```
.
├── src/
│   ├── core/
│   │   ├── login.ts              # 登录功能
│   │   ├── check_login.ts        # 检查登录状态
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
```

## 依赖说明

本项目使用 `@asd345gh/mcpkit` npm 包提供浏览器自动化和 MCP 工具支持：
- `@asd345gh/mcpkit/browser` - Puppeteer 浏览器工具（启动浏览器、登录状态管理）
- `@asd345gh/mcpkit/mcp` - MCP 服务器创建工具
- `@asd345gh/mcpkit/utils` - 缓存等实用工具

## 配置

输出目录和图片目录支持三种配置方式，优先级从高到低：

### 方式 1: 环境变量（优先级最高）

```bash
export BIJI_OUTPUT_DIR="/path/to/output"
export BIJI_ASSETS_DIR="/path/to/assets"
```

### 方式 2: 项目目录配置文件

在项目目录下创建 `.bijirc.json`：

```json
{
  "outputDir": "/Users/xx/Documents/A第二大脑",
  "assetsDir": "/Users/xx/Documents/A第二大脑/Assets"
}
```

### 方式 3: 用户主目录配置文件

在用户主目录下创建 `.bijirc.json`：

```json
{
  "outputDir": "/Users/xx/Documents/A第二大脑",
  "assetsDir": "/Users/xx/Documents/A第二大脑/Assets"
}
```

### 默认配置

如果未配置，使用以下默认值：

| 配置项 | 默认值 |
|--------|--------|
| **输出目录** | `~/Documents/A第二大脑` |
| **Assets 目录** | `{输出目录}/Assets` |
| **图片格式** | Obsidian (`![[]]`) |

注意修改配置文件后，需要重启 Claude。
