// 获取笔记详情并保存为 Markdown
import type { Page } from 'puppeteer-core';
import { withLoggedInPage } from '@joohw/shared-mcp-browser/browser';
import { saveToCache, loadFromCacheWithTtl } from '@joohw/shared-mcp-browser/utils';
import { convertToMarkdown } from './convert_to_md.js';
import type { BijiNoteDetail, BijiApiResponse } from '../types/note.js';
import { CACHE_TTL_NOTE_DETAIL } from '../config/index.js';

const CACHE_OPTIONS = { appName: 'biji-cli' };

/**
 * 通过 API 获取笔记详情（完整 JSON 数据）
 */
async function getNoteDetailByApi(page: Page, noteId: string): Promise<BijiApiResponse> {
  let apiData: any = null;
  let dataResolved = false;

  // 拦截 API 响应
  const responseHandler = async (response: any) => {
    const url = response.url();
    const request = response.request();

    // 只处理 GET 请求
    if (request.method() !== 'GET') {
      return;
    }

    // 拦截 /voicenotes/web/notes/{noteId}
    if (url.includes(`/notes/${noteId}`) && url.includes('/voicenotes/web/notes/')) {
      // 确保不是子路径请求
      if (url.includes('/children/') || url.includes('/related')) {
        return;
      }

      // 检查响应状态
      const status = response.status();
      if (status !== 200) {
        console.log(`请求返回状态: ${status}`);
        return;
      }

      try {
        const contentType = response.headers()['content-type'] || '';
        // 只处理 JSON 响应
        if (!contentType.includes('application/json')) {
          return;
        }

        const data = await response.json();
        apiData = data as BijiApiResponse;
        dataResolved = true;
        console.log('✅ 成功拦截到笔记数据');
        console.log('数据结构:', JSON.stringify(Object.keys(data), null, 2));
      } catch (e: any) {
        // 忽略 preflight 请求和其他无法解析的响应
        if (!e.message.includes('Could not load response body')) {
          console.error('解析 API 响应失败:', e.message);
        }
      }
    }
  };

  page.on('response', responseHandler);

  try {
    // 访问笔记页面
    await page.goto(`https://www.biji.com/note/${noteId}`, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // 等待 API 数据（最多 15 秒）
    const maxWait = 15000;
    const startTime = Date.now();
    while (!dataResolved && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!apiData) {
      throw new Error('未能获取到笔记数据，请确保已登录');
    }

    // 验证数据结构
    if (!apiData || !apiData.c || !apiData.c.content) {
      console.error('API 返回的数据结构:', JSON.stringify(apiData, null, 2));
      throw new Error('笔记数据格式不正确，缺少 content 字段');
    }

    return apiData as BijiApiResponse;
  } finally {
    page.off('response', responseHandler);
  }
}

/**
 * 获取笔记详情并保存为 Markdown
 */
export interface SaveMarkdownOptions {
  noteId: string;
  outputDir: string;
  imageFormat?: 'obsidian' | 'standard';
}

export async function saveNoteAsMarkdown(options: SaveMarkdownOptions): Promise<{
  mdPath: string;
  assetsDir: string;
  imageCount: number;
  downloadedCount: number;
}> {
  const { noteId, outputDir, imageFormat = 'obsidian' } = options;

  // 从远程获取数据
  const apiData = await withLoggedInPage(
    {
      appName: 'biji-cli',
      headless: true,
      homeUrl: 'https://www.biji.com/note',
      loginUrlPatterns: ['/login', '/signin'],
    },
    async (page: Page) => {
      return await getNoteDetailByApi(page, noteId);
    }
  );

  // 缓存原始数据
  saveToCache(CACHE_OPTIONS, `notes/${noteId}.json`, apiData);

  // 转换为 Markdown
  const result = await convertToMarkdown(apiData, {
    outputDir,
    imageFormat,
  });

  return result;
}

/**
 * 获取笔记详情（返回简化的数据结构）
 */
export async function getNoteDetail(noteId: string): Promise<BijiNoteDetail> {
  // 检查缓存
  const cached = loadFromCacheWithTtl<BijiApiResponse>(CACHE_OPTIONS, `notes/${noteId}.json`, CACHE_TTL_NOTE_DETAIL);
  if (cached) {
    return {
      noteId,
      title: cached.c.title,
      content: cached.c.content,
      images: [],
      url: `https://www.biji.com/note/${noteId}`,
      publishTime: cached.c.createTime ? new Date(cached.c.createTime).toISOString() : undefined,
      wordCount: cached.c.content.length,
    };
  }

  // 从远程获取
  const apiData = await withLoggedInPage(
    {
      appName: 'biji-cli',
      headless: true,
      homeUrl: 'https://www.biji.com/note',
      loginUrlPatterns: ['/login', '/signin'],
    },
    async (page: Page) => {
      return await getNoteDetailByApi(page, noteId);
    }
  );

  // 保存到缓存
  saveToCache(CACHE_OPTIONS, `notes/${noteId}.json`, apiData);

  return {
    noteId,
    title: apiData.c.title,
    content: apiData.c.content,
    images: [],
    url: `https://www.biji.com/note/${noteId}`,
    publishTime: apiData.c.createTime ? new Date(apiData.c.createTime).toISOString() : undefined,
    wordCount: apiData.c.content.length,
  };
}

// 获取笔记详情（使用现有页面）
export async function getNoteDetailRemote(page: Page, noteId: string): Promise<BijiNoteDetail> {
  const apiData = await getNoteDetailByApi(page, noteId);
  return {
    noteId,
    title: apiData.c.title,
    content: apiData.c.content,
    images: [],
    url: `https://www.biji.com/note/${noteId}`,
    publishTime: apiData.c.createTime ? new Date(apiData.c.createTime).toISOString() : undefined,
    wordCount: apiData.c.content.length,
  };
}
