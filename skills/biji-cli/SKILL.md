---
name: biji-cli
description: Get笔记 CLI 工具 - 从 biji.com 获取笔记并保存为 Markdown。触发词：保存笔记、获取 biji、biji 笔记、get-note。
---

# biji-cli Skill

## 用途

从 biji.com（Get笔记）获取笔记内容并自动保存为 Markdown 格式到本地，包括：
- 获取指定笔记（通过 URL 或 ID）
- 获取最新笔记
- 获取最新原文笔记
- 自动下载图片并转换为 Markdown 格式

## 触发条件

当用户提到以下关键词时，应使用此 skill：
- "保存笔记"
- "获取 biji"
- "biji 笔记"
- "get-note"
- "从 biji 获取"
- "保存到 biji"

## 前置要求

**必须先安装 biji-cli**：

```bash
npm install -g biji-cli
```

首次使用前需要登录：
```bash
biji login
```

## 配置输出目录

biji-cli 支持三种配置方式，优先级从高到低：

### 方式 1: 命令行参数（一次性）
```bash
biji get-note <ID> ~/custom/path
```

### 方式 2: 配置文件（推荐，永久生效）
```bash
# 查看当前配置
biji config show

# 使用配置向导（推荐）
biji config wizard

# 或直接设置
biji config set --output-dir ~/Documents/MyNotes
biji config set --assets-dir ~/Documents/MyNotes/Assets
```

配置文件保存在 `~/.bijirc.json`：
```json
{
  "outputDir": "~/Documents/MyNotes",
  "assetsDir": "~/Documents/MyNotes/Assets"
}
```

### 方式 3: 环境变量
```bash
export BIJI_OUTPUT_DIR="~/Documents/MyNotes"
export BIJI_ASSETS_DIR="~/Documents/MyNotes/Assets"
```

**默认配置**（无需配置即可使用）：
- 输出目录：`~/Documents/A第二大脑`
- Assets 目录：`{输出目录}/Assets`

## 可用命令

### 1. 获取指定笔记
```bash
biji get-note <URL|ID>
```

**示例**:
- `biji get-note 1900215167371849544`
- `biji get-note https://www.biji.com/note/1900215167371849544`
- `biji get-note https://www.biji.com/note/1900215167371849544/web` (原文笔记)

### 2. 获取最新笔记
```bash
biji get-latest
```

### 3. 获取最新原文笔记
```bash
biji get-latest-original
```

### 4. 配置管理
```bash
# 查看当前配置
biji config show

# 使用配置向导（推荐）
biji config wizard

# 直接设置配置
biji config set --output-dir <path>
biji config set --assets-dir <path>
```

### 5. 检查登录状态
```bash
biji check-login
```

## 使用流程

1. **首次使用**：
   ```bash
   # 安装
   npm install -g biji-cli

   # 登录（会打开浏览器）
   biji login
   ```

2. **获取笔记**：
   ```bash
   # 获取最新笔记
   biji get-latest

   # 获取指定笔记
   biji get-note <笔记ID或URL>
   ```

## 输出说明

**默认配置**：
- 笔记保存到：`~/Documents/A第二大脑/`
- 图片保存到：`~/Documents/A第二大脑/Assets/`

**自定义配置**：
使用 `biji config wizard` 或 `biji config set --output-dir <path>` 修改输出目录。

## 注意事项

- 首次使用需要运行 `biji login` 登录账号
- 使用 `biji config wizard` 可轻松配置输出目录
- 原文笔记 URL 必须包含 `/web` 后缀
- 图片会自动下载并转换为 Markdown 链接
- 配置文件保存在 `~/.bijirc.json`，修改后立即生效
