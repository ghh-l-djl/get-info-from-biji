// MCP 工具处理器
import { loginBiji } from '../core/login.js';
import { checkLoginState } from '../core/check_login.js';
import { getNoteDetail, saveNoteAsMarkdown } from '../core/get_note_detail.js';

const DEFAULT_OUTPUT_DIR = '/Users/ghh/Documents/A第二大脑';

export async function handleLogin() {
  try {
    await loginBiji();
    return {
      content: [
        {
          type: 'text',
          text: '登录流程已启动，请在浏览器中完成登录。登录完成后，按 Ctrl+C 关闭浏览器。',
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `登录失败: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function handleCheckLogin() {
  try {
    const state = await checkLoginState();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(state, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `检查登录状态失败: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function handleGetNoteDetail(args: { noteId?: string }) {
  const { noteId } = args || {};
  if (!noteId) {
    return {
      content: [
        {
          type: 'text',
          text: '错误: 请提供笔记 ID',
        },
      ],
      isError: true,
    };
  }

  try {
    const detail = await getNoteDetail(noteId);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(detail, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `获取笔记详情失败: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function handleSaveNoteAsMarkdown(args: {
  noteId?: string;
  outputDir?: string;
  imageFormat?: 'obsidian' | 'standard';
}) {
  const { noteId, outputDir = DEFAULT_OUTPUT_DIR, imageFormat = 'obsidian' } = args || {};

  if (!noteId) {
    return {
      content: [
        {
          type: 'text',
          text: '错误: 请提供笔记 ID',
        },
      ],
      isError: true,
    };
  }

  try {
    console.log(`正在获取笔记 ${noteId} 并保存为 Markdown...`);
    const result = await saveNoteAsMarkdown({
      noteId,
      outputDir,
      imageFormat,
    });

    return {
      content: [
        {
          type: 'text',
          text: `✓ 保存成功！

笔记 ID: ${noteId}
Markdown 文件: ${result.mdPath}
图片目录: ${result.assetsDir}
图片: ${result.downloadedCount}/${result.imageCount} 张已下载`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `保存笔记失败: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
