// 登录 biji.com
import type { Page } from 'puppeteer-core';
import { withBrowser } from '@asd345gh/mcpkit/browser';
import { BIJI_WEB_URL } from '../config/index.js';

export async function loginBiji(): Promise<void> {
  await withBrowser(
    {
      appName: 'biji-cli',
      headless: false, // 显示浏览器窗口
    },
    async (page: Page) => {
      console.log('正在打开浏览器...');
      console.log('请在浏览器中完成登录操作。');

      // 访问首页
      await page.goto(BIJI_WEB_URL, {
        waitUntil: 'networkidle0',
        timeout: 60000,
      });

      console.log('\n========================================');
      console.log('请在打开的浏览器窗口中完成登录：');
      console.log('1. 点击登录按钮');
      console.log('2. 使用手机号验证码登录');
      console.log('3. 登录成功后，按 Ctrl+C 关闭浏览器');
      console.log('========================================\n');

      // 等待用户登录
      await new Promise<void>((resolve) => {
        process.on('SIGINT', () => {
          console.log('\n浏览器已关闭，登录信息已保存。');
          resolve();
        });
      });
    }
  );
}
