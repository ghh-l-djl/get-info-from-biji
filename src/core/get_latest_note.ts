// 获取最新笔记
import type { Page } from 'puppeteer-core';
import { withLoggedInPage } from '@asd345gh/mcpkit/browser';
import { saveNoteAsMarkdown } from './get_note_detail.js';

/**
 * 获取最新一篇笔记的 ID
 * 通过拦截笔记列表 API 实现
 */
export async function getLatestNoteId(): Promise<string> {
  return await withLoggedInPage(
    {
      appName: 'biji-cli',
      headless: true,
      homeUrl: 'https://www.biji.com/note',
      loginUrlPatterns: ['/login', '/signin'],
    },
    async (page: Page) => {
      let latestNoteId: string | null = null;

      // 拦截笔记列表 API
      const responseHandler = async (response: any) => {
        const url = response.url();

        // 拦截笔记列表 API: /voicenotes/web/notes?sort=create_desc
        if (url.includes('/voicenotes/web/notes') && url.includes('sort=create_desc')) {
          try {
            const contentType = response.headers()['content-type'] || '';
            if (!contentType.includes('application/json')) {
              return;
            }

            const data = await response.json();

            // 从响应中提取第一篇笔记 ID
            if (data && data.c && data.c.list && Array.isArray(data.c.list) && data.c.list.length > 0) {
              const firstNote = data.c.list[0];
              latestNoteId = firstNote.note_id || firstNote.id;
              console.log(`✅ 找到最新笔记 ID: ${latestNoteId}`);
              console.log(`   标题: ${firstNote.title}`);
            }
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
        // 访问笔记列表页面
        await page.goto('https://www.biji.com/note', {
          waitUntil: 'networkidle0',
          timeout: 30000,
        });

        // 等待 API 请求完成
        const maxWait = 15000;
        const startTime = Date.now();
        while (!latestNoteId && Date.now() - startTime < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (!latestNoteId) {
          throw new Error('未能获取到最新笔记，请确保笔记列表已加载');
        }

        return latestNoteId;
      } finally {
        page.off('response', responseHandler);
      }
    }
  );
}

/**
 * 获取最新笔记并保存为 Markdown
 */
export async function getLatestNoteAsMarkdown(options: {
  outputDir: string;
  assetsDir?: string;
  imageFormat?: 'obsidian' | 'standard';
}) {
  const noteId = await getLatestNoteId();
  return await saveNoteAsMarkdown({
    noteId,
    outputDir: options.outputDir,
    assetsDir: options.assetsDir,
    imageFormat: options.imageFormat,
  });
}

/**
 * 获取最新原文笔记并保存为 Markdown
 */
export async function getLatestOriginalNoteAsMarkdown(options: {
  outputDir: string;
  assetsDir?: string;
  imageFormat?: 'obsidian' | 'standard';
}) {
  const noteId = await getLatestNoteId();
  return await saveNoteAsMarkdown({
    noteId,
    outputDir: options.outputDir,
    assetsDir: options.assetsDir,
    imageFormat: options.imageFormat,
    isOriginal: true,
  });
}
