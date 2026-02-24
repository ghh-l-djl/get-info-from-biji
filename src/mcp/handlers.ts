// MCP 工具处理器
import { loginBiji } from '../core/login.js';
import { checkLoginState } from '../core/check_login.js';
import { getNoteDetail, saveNoteAsMarkdown } from '../core/get_note_detail.js';
import { getLatestNoteAsMarkdown, getLatestOriginalNoteAsMarkdown } from '../core/get_latest_note.js';
import { parseNoteIdFromUrl, isOriginalNoteUrl } from '../utils/url.js';

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

export async function handleGetNoteDetail(args: { urlOrId?: string }) {
  const { urlOrId } = args || {};
  if (!urlOrId) {
    return {
      content: [
        {
          type: 'text',
          text: '错误: 请提供笔记 URL 或 ID',
        },
      ],
      isError: true,
    };
  }

  try {
    const noteId = parseNoteIdFromUrl(urlOrId);
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
  urlOrId?: string;
  outputDir?: string;
  imageFormat?: 'obsidian' | 'standard';
}) {
  const { urlOrId, outputDir = DEFAULT_OUTPUT_DIR, imageFormat = 'obsidian' } = args || {};

  if (!urlOrId) {
    return {
      content: [
        {
          type: 'text',
          text: '错误: 请提供笔记 URL 或 ID',
        },
      ],
      isError: true,
    };
  }

  try {
    const noteId = parseNoteIdFromUrl(urlOrId);
    const isOriginal = isOriginalNoteUrl(urlOrId);

    console.log(`正在获取笔记 ${noteId}${isOriginal ? ' (原文)' : ''}...`);

    const result = await saveNoteAsMarkdown({
      noteId,
      outputDir,
      imageFormat,
      isOriginal,
    });

    return {
      content: [
        {
          type: 'text',
          text: `✓ 保存成功！

笔记 ID: ${noteId}
类型: ${isOriginal ? '原文笔记' : '普通笔记'}
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

export async function handleGetLatestNote(args: {
  outputDir?: string;
  imageFormat?: 'obsidian' | 'standard';
}) {
  const { outputDir = DEFAULT_OUTPUT_DIR, imageFormat = 'obsidian' } = args || {};

  try {
    console.log('正在获取最新笔记...');
    const result = await getLatestNoteAsMarkdown({ outputDir, imageFormat });

    return {
      content: [
        {
          type: 'text',
          text: `✓ 保存成功！

类型: 最新笔记
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
          text: `获取最新笔记失败: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function handleGetLatestOriginalNote(args: {
  outputDir?: string;
  imageFormat?: 'obsidian' | 'standard';
}) {
  const { outputDir = DEFAULT_OUTPUT_DIR, imageFormat = 'obsidian' } = args || {};

  try {
    console.log('正在获取最新原文笔记...');
    const result = await getLatestOriginalNoteAsMarkdown({ outputDir, imageFormat });

    return {
      content: [
        {
          type: 'text',
          text: `✓ 保存成功！

类型: 最新原文笔记
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
          text: `获取最新原文笔记失败: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
