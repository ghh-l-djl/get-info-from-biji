// MCP 工具定义
export function getTools() {
  return [
    {
      name: 'biji_login',
      description: '登录 biji.com 账号（会打开浏览器窗口进行登录）',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'biji_check_login',
      description: '检查 biji.com 登录状态',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'biji_get_note_detail',
      description: '根据笔记 ID 或 URL 获取笔记详情（包括标题、内容、图片等）',
      inputSchema: {
        type: 'object',
        properties: {
          urlOrId: {
            type: 'string',
            description: '笔记 URL 或 ID，例如: https://www.biji.com/note/1900215167371849544 或 1900215167371849544',
          },
        },
        required: ['urlOrId'],
      },
    },
    {
      name: 'biji_save_note_as_markdown',
      description: '获取笔记内容并保存为 Markdown 文件到本地（自动下载图片）',
      inputSchema: {
        type: 'object',
        properties: {
          urlOrId: {
            type: 'string',
            description: '笔记 URL 或 ID，例如: https://www.biji.com/note/1900215167371849544/web 或 1900215167371849544',
          },
          outputDir: {
            type: 'string',
            description: '输出目录路径，默认为 ~/Documents/A第二大脑',
          },
          imageFormat: {
            type: 'string',
            description: '图片链接格式: obsidian (使用 ![[]]) 或 standard (使用 ![]())',
            enum: ['obsidian', 'standard'],
          },
        },
        required: ['urlOrId'],
      },
    },
    {
      name: 'biji_get_latest_note',
      description: '获取最新一篇笔记并保存为 Markdown 文件',
      inputSchema: {
        type: 'object',
        properties: {
          outputDir: {
            type: 'string',
            description: '输出目录路径，默认为 ~/Documents/A第二大脑',
          },
          imageFormat: {
            type: 'string',
            description: '图片链接格式: obsidian (使用 ![[]]) 或 standard (使用 ![]())',
            enum: ['obsidian', 'standard'],
          },
        },
      },
    },
    {
      name: 'biji_get_latest_original_note',
      description: '获取最新一篇原文笔记并保存为 Markdown 文件',
      inputSchema: {
        type: 'object',
        properties: {
          outputDir: {
            type: 'string',
            description: '输出目录路径，默认为 ~/Documents/A第二大脑',
          },
          imageFormat: {
            type: 'string',
            description: '图片链接格式: obsidian (使用 ![[]]) 或 standard (使用 ![]())',
            enum: ['obsidian', 'standard'],
          },
        },
      },
    },
  ];
}
