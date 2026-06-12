// Fetch all biji notes created after sinceTimestamp, paginating via the
// page's own "load more" infinite-scroll requests (spec §4.1).
import type { Page } from 'puppeteer-core';
import { withLoggedInPage } from '@asd345gh/mcpkit/browser';
import { needsMorePages, selectNewNotes } from './notes_list.js';
import type { NoteListItem } from '../types/sync.js';

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!predicate() && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Scroll the page's main scrollable container to its bottom to trigger the
 * next "load more" request. Picks the element with the most remaining
 * scroll distance (scrollHeight - clientHeight), falling back to the
 * document itself if nothing else is scrollable.
 */
async function triggerLoadMore(page: Page): Promise<void> {
  await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('*'));
    let target: HTMLElement = (document.scrollingElement as HTMLElement) || document.documentElement;
    let maxScrollable = target.scrollHeight - target.clientHeight;

    for (const el of elements) {
      const overflowY = getComputedStyle(el).overflowY;
      const scrollable = el.scrollHeight - el.clientHeight;
      if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && scrollable > maxScrollable) {
        target = el;
        maxScrollable = scrollable;
      }
    }

    target.scrollTo(0, target.scrollHeight);
    target.dispatchEvent(new Event('scroll', { bubbles: true }));
    window.dispatchEvent(new Event('scroll'));
  });
}

export async function getNewNotes(sinceTimestamp: string): Promise<NoteListItem[]> {
  return await withLoggedInPage(
    {
      appName: 'biji-cli',
      headless: true,
      homeUrl: 'https://www.biji.com/note',
      loginUrlPatterns: ['/login', '/signin'],
    },
    async (page: Page) => {
      let accumulated: NoteListItem[] = [];
      let hasMore = false;
      let pageResolved = false;
      let pageCount = 0;

      const responseHandler = async (response: any) => {
        const url = response.url();
        if (!url.includes('/voicenotes/web/notes') || !url.includes('sort=create_desc')) {
          return;
        }
        try {
          const contentType = response.headers()['content-type'] || '';
          if (!contentType.includes('application/json')) {
            return;
          }
          const data = await response.json();
          if (data && data.c && Array.isArray(data.c.list)) {
            accumulated = accumulated.concat(data.c.list);
            hasMore = !!data.c.has_more;
            pageResolved = true;
            pageCount++;
            console.log(`📄 拦截到笔记列表第 ${pageCount} 页，累计 ${accumulated.length} 条，has_more=${hasMore}`);
          }
        } catch (e: any) {
          if (!e.message.includes('Could not load response body')) {
            console.error('解析笔记列表响应失败:', e.message);
          }
        }
      };

      page.on('response', responseHandler);

      try {
        await page.setViewport({ width: 1280, height: 2000 });
        await page.goto('https://www.biji.com/note', { waitUntil: 'networkidle0', timeout: 30000 });
        await waitFor(() => pageResolved, 15000);

        if (!pageResolved) {
          throw new Error('未能获取到笔记列表，请确保已登录');
        }

        while (needsMorePages(accumulated, sinceTimestamp, hasMore)) {
          pageResolved = false;
          await triggerLoadMore(page);
          await waitFor(() => pageResolved, 15000);
          if (!pageResolved) {
            // No further page arrived (e.g. reached the end of the list);
            // stop instead of looping forever.
            break;
          }
        }

        return selectNewNotes(accumulated, sinceTimestamp);
      } finally {
        page.off('response', responseHandler);
      }
    }
  );
}
