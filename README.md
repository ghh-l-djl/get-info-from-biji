# biji-cli

Get笔记 CLI 工具和 MCP 服务器 - 一键获取笔记内容并保存为 Markdown 文件

## 功能特点

- 一键获取 Get笔记内容并保存为 Markdown
- 自动下载图片到本地
- 支持 Obsidian 格式 (`![[]]`) 和标准格式 (`![]()`)
- 提供 MCP 服务器供 AI 直接调用

## 安装

```bash
cd /Users/ghh/Documents/编程/项目/get-info-from-biji
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

### 获取笔记并保存为 Markdown

```bash
# 使用默认输出目录 (~/Documents/GetNotes)
npm run biji get-note 1900215167371849544

# 指定输出目录
npm run biji get-note 1900215167371849544 ~/Documents/MyNotes
```

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
| `biji_get_note_detail` | 获取笔记详情 | `noteId` |
| `biji_save_note_as_markdown` | 获取笔记并保存为 Markdown | `noteId`, `outputDir` (可选), `imageFormat` (可选) |

### AI 调用示例

```
帮我获取笔记 1900215167371849544 并保存到 ~/Documents/GetNotes
```

## 输出格式

保存的 Markdown 文件格式：

```markdown
# 笔记标题

笔记内容...

![[图片1.jpg]]
![[图片2.jpg]]
```

图片保存在 `Assets/` 子目录中。

## 工作原理

1. 使用 Puppeteer 拦截 biji.com 的 API 请求
2. 获取笔记的完整 JSON 数据
3. 提取内容和图片链接
4. 下载图片到本地
5. 替换图片链接为本地路径
6. 生成 Markdown 文件

## 项目结构

```
.
├── src/
│   ├── core/
│   │   ├── login.ts           # 登录功能
│   │   ├── check_login.ts     # 检查登录状态
│   │   ├── get_note_detail.ts # 获取笔记详情
│   │   └── convert_to_md.ts   # 转换为 Markdown
│   ├── mcp/
│   │   ├── index.ts           # MCP 服务器
│   │   ├── tools.ts           # 工具定义
│   │   └── handlers.ts        # 工具处理器
│   └── types/note.ts          # 类型定义
└── shared-mcp-browser/         # 共享库
    ├── src/browser/           # 浏览器工具
    ├── src/mcp/               # MCP 工具
    └── src/utils/             # 缓存等工具
```
