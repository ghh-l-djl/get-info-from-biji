// 检查登录状态
import type { Page } from 'puppeteer-core';
import { withLoggedInPage } from '@asd345gh/mcpkit/browser';
import { BIJI_WEB_URL } from '../config/index.js';

export interface LoginState {
  isLoggedIn: boolean;
  userId?: string;
  nickname?: string;
}

export async function checkLoginState(): Promise<LoginState> {
  try {
    const result = await withLoggedInPage(
      {
        appName: 'biji-cli',
        headless: true,
        homeUrl: `${BIJI_WEB_URL}/note`,
        loginUrlPatterns: ['/login', '/signin'],
      },
      async (page: Page) => {
        // 检查是否登录 - 尝试获取用户信息
        const userInfo = await page.evaluate(() => {
          // 检查页面是否有登录后的元素
          const userEl = document.querySelector('[class*="user"], [class*="avatar"], [class*="User"], [class*="Avatar"]');
          if (userEl) {
            return {
              hasUser: true,
              text: userEl.textContent?.trim() || '',
            };
          }
          return { hasUser: false };
        });

        // 尝试从 localStorage 获取用户信息
        const storage = await page.evaluate(() => {
          const token = localStorage.getItem('token') || localStorage.getItem('access_token');
          return { hasToken: !!token };
        });

        return {
          isLoggedIn: userInfo.hasUser || storage.hasToken,
        };
      }
    );
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.includes('未登录')) {
      return { isLoggedIn: false };
    }
    throw error;
  }
}
