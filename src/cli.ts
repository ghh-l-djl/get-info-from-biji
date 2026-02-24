#!/usr/bin/env node
// biji-cli 命令行工具

import { loginBiji } from './core/login.js';
import { checkLoginState } from './core/check_login.js';
import { saveNoteAsMarkdown } from './core/get_note_detail.js';

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

    case 'get-note':
      const noteId = args[1];
      if (!noteId) {
        console.error('请提供笔记 ID');
        console.log('用法: biji get-note <noteId> [outputDir]');
        process.exit(1);
      }
      const outputDir = args[2] || DEFAULT_OUTPUT_DIR;

      console.log(`正在获取笔记 ${noteId}...`);
      const result = await saveNoteAsMarkdown({
        noteId,
        outputDir,
        imageFormat: 'obsidian',
      });

      console.log('\n✓ 保存成功！');
      console.log(`  - Markdown: ${result.mdPath}`);
      console.log(`  - 图片: ${result.downloadedCount}/${result.imageCount} 张`);
      break;

    case '--help':
    case '-h':
    case 'help':
    default:
      console.log(`
biji-cli - Get笔记 CLI 工具

命令:
  biji login                    登录 biji.com 账号
  biji check-login              检查登录状态
  biji get-note <noteId>        获取笔记并保存为 Markdown
                                [outputDir] 可选，默认 ~/Documents/GetNotes

示例:
  biji login
  biji get-note 1900215167371849544
  biji get-note 1900215167371849544 ~/Documents/MyNotes
      `);
      break;
  }
}

main().catch(console.error);
