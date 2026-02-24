#!/usr/bin/env node
// biji-cli MCP 服务器

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getTools } from './tools.js';
import {
  handleLogin,
  handleCheckLogin,
  handleGetNoteDetail,
  handleSaveNoteAsMarkdown,
  handleGetLatestNote,
  handleGetLatestOriginalNote,
} from './handlers.js';

// 创建 MCP 服务器
const server = new Server(
  {
    name: 'biji-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 注册工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: getTools(),
  };
});

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'biji_login':
        return await handleLogin();
      case 'biji_check_login':
        return await handleCheckLogin();
      case 'biji_get_note_detail':
        return await handleGetNoteDetail(args as { urlOrId?: string });
      case 'biji_save_note_as_markdown':
        return await handleSaveNoteAsMarkdown(args as {
          urlOrId?: string;
          outputDir?: string;
          imageFormat?: 'obsidian' | 'standard';
        });
      case 'biji_get_latest_note':
        return await handleGetLatestNote(args as {
          outputDir?: string;
          imageFormat?: 'obsidian' | 'standard';
        });
      case 'biji_get_latest_original_note':
        return await handleGetLatestOriginalNote(args as {
          outputDir?: string;
          imageFormat?: 'obsidian' | 'standard';
        });
      default:
        return {
          content: [
            {
              type: 'text',
              text: `未知的工具: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `错误: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Get笔记 MCP 服务器已启动');
}

main().catch((error) => {
  console.error('服务器启动失败:', error);
  process.exit(1);
});
