import type { Page } from 'puppeteer-core';
import { withLoggedInPage } from '@asd345gh/mcpkit/browser';
import { writeFileSync } from 'fs';

const TARGET_URL = 'https://www.biji.com/mine/notes/pMrXB8YmdVpeZQlJ';
const NOTE_ID = 'pMrXB8YmdVpeZQlJ';

await withLoggedInPage(
  {
    appName: 'biji-cli',
    headless: true,
    homeUrl: 'https://www.biji.com/note',
    loginUrlPatterns: ['/login', '/signin'],
  },
  async (page: Page) => {
    let apiData: any = null;
    page.on('response', async (response) => {
      const url = response.url();
      const req = response.request();
      if (req.method() !== 'GET') return;
      if (url.includes(`/notes/${NOTE_ID}`) && url.includes('/voicenotes/web/notes/')) {
        if (url.includes('/children/') || url.includes('/related')) return;
        try {
          const ct = response.headers()['content-type'] || '';
          if (!ct.includes('application/json')) return;
          apiData = await response.json();
        } catch {}
      }
    });

    await page.goto(TARGET_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));

    writeFileSync('/tmp/mine-note-api.json', JSON.stringify(apiData, null, 2));
    console.log('Saved API response to /tmp/mine-note-api.json');
    console.log('Keys of c:', apiData?.c ? Object.keys(apiData.c) : null);
    console.log('title:', apiData?.c?.title);
    console.log('content length:', apiData?.c?.content?.length);
    console.log('content preview:', apiData?.c?.content?.slice(0, 300));
  }
);
