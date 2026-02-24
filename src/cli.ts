#!/usr/bin/env node
// biji-cli 命令行工具

import { loginBiji } from './core/login.js';
import { checkLoginState } from './core/check_login.js';
import { saveNoteAsMarkdown } from './core/get_note_detail.js';
import { getLatestNoteAsMarkdown, getLatestOriginalNoteAsMarkdown } from './core/get_latest_note.js';
import { parseNoteIdFromUrl, isOriginalNoteUrl } from './utils/url.js';

const DEFAULT_OUTPUT_DIR = '/Users/ghh/Documents/A第二大脑';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'login':
      await loginBiji();
      break;

    case 'check-login':
      const state = await checkLoginState();
      console.log(JSON.stringify(state, null, 2));
      break;

    case 'get-note': {
      // 支持直接传 URL 或 noteId
      const urlOrId = args[1];
      if (!urlOrId) {
        console.error('请提供笔记 URL 或 ID');
        console.log('用法: biji get-note <noteId|URL> [outputDir]');
        console.log('');
        console.log('示例:');
        console.log('  biji get-note 1900215167371849544');
        console.log('  biji get-note https://www.biji.com/note/1900215167371849544');
        console.log('  biji get-note https://www.biji.com/note/1900215167371849544/web');
        process.exit(1);
      }

      const outputDir = args[2] || DEFAULT_OUTPUT_DIR;
      const noteId = parseNoteIdFromUrl(urlOrId);
      const isOriginal = isOriginalNoteUrl(urlOrId);

      console.log(`正在获取笔记 ${noteId}${isOriginal ? ' (原文)' : ''}...`);

      const result = await saveNoteAsMarkdown({
        noteId,
        outputDir,
        isOriginal,
      });

      console.log('\n✓ 保存成功！');
      console.log(`  - Markdown: ${result.mdPath}`);
      console.log(`  - 图片: ${result.downloadedCount}/${result.imageCount} 张`);
      break;
    }

    case 'get-latest': {
      // 获取最新笔记
      const outputDir = args[1] || DEFAULT_OUTPUT_DIR;

      console.log('正在获取最新笔记...');

      const result = await getLatestNoteAsMarkdown({ outputDir });

      console.log('\n✓ 保存成功！');
      console.log(`  - Markdown: ${result.mdPath}`);
      console.log(`  - 图片: ${result.downloadedCount}/${result.imageCount} 张`);
      break;
    }

    case 'get-latest-original': {
      // 获取最新原文笔记
      const outputDir = args[1] || DEFAULT_OUTPUT_DIR;

      console.log('正在获取最新原文笔记...');

      const result = await getLatestOriginalNoteAsMarkdown({ outputDir });

      console.log('\n✓ 保存成功！');
      console.log(`  - Markdown: ${result.mdPath}`);
      console.log(`  - 图片: ${result.downloadedCount}/${result.imageCount} 张`);
      break;
    }

    case '--help':
    case '-h':
    case 'help':
    default:
      console.log(`
biji-cli - Get笔记 CLI 工具

命令:
  biji login                         登录 biji.com 账号
  biji check-login                   检查登录状态

  biji get-note <URL|ID> [outputDir] 获取笔记并保存为 Markdown
                                      支持完整 URL 或笔记 ID
                                      普通笔记: https://www.biji.com/note/1900215167371849544
                                      原文笔记: https://www.biji.com/note/1900215167371849544/web

  biji get-latest [outputDir]         获取最新一篇笔记并保存
  biji get-latest-original [outputDir] 获取最新一篇原文笔记并保存

参数:
  outputDir  可选，默认为 ~/Documents/A第二大脑

示例:
  # 使用 URL 获取笔记
  biji get-note https://www.biji.com/note/1900215167371849544

  # 使用笔记 ID 获取
  biji get-note 1900215167371849544

  # 获取原文笔记
  biji get-note https://www.biji.com/note/1900215167371849544/web

  # 获取最新笔记
  biji get-latest

  # 获取最新原文笔记
  biji get-latest-original

  # 指定输出目录
  biji get-note 1900215167371849544 ~/Documents/MyNotes
      `);
      break;
  }
}

main().catch(console.error);
