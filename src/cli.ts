#!/usr/bin/env node
// biji-cli 命令行工具

import { loginBiji } from './core/login.js';
import { checkLoginState } from './core/check_login.js';
import { saveNoteAsMarkdown } from './core/get_note_detail.js';
import { getLatestNoteAsMarkdown, getLatestOriginalNoteAsMarkdown } from './core/get_latest_note.js';
import { showConfig, setConfig, configWizard } from './core/config.js';
import { installSkill, checkSkillInstalled } from './core/install_skill.js';
import { parseNoteIdFromUrl, isOriginalNoteUrl } from './utils/url.js';
import { OUTPUT_DIR, ASSETS_DIR } from './config/index.js';

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

    case 'config': {
      const subCommand = args[1];

      if (subCommand === 'show' || !subCommand) {
        showConfig();
      } else if (subCommand === 'set') {
        // biji config set --output-dir xxx --assets-dir yyy
        let outputDir: string | undefined;
        let assetsDir: string | undefined;

        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--output-dir' && args[i + 1]) {
            outputDir = args[i + 1];
            i++;
          } else if (args[i] === '--assets-dir' && args[i + 1]) {
            assetsDir = args[i + 1];
            i++;
          }
        }

        if (!outputDir && !assetsDir) {
          console.error('请提供要设置的配置项');
          console.log('用法: biji config set --output-dir <path> --assets-dir <path>');
          process.exit(1);
        }

        await setConfig({ outputDir, assetsDir });
      } else if (subCommand === 'wizard' || subCommand === 'init') {
        await configWizard();
      } else {
        console.error('未知命令:', subCommand);
        console.log('用法: biji config [show|set|wizard]');
        process.exit(1);
      }
      break;
    }

    case 'install-skill': {
      if (checkSkillInstalled()) {
        console.log('✅ Skill 已经安装！');

        if (args[1] === '--force') {
          console.log('强制重新安装...\n');
          await installSkill();
        } else {
          console.log('\n如需重新安装，请使用:');
          console.log('  biji install-skill --force');
        }
      } else {
        await installSkill();
      }
      break;
    }

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

      const outputDir = args[2] || OUTPUT_DIR;
      const noteId = parseNoteIdFromUrl(urlOrId);
      const isOriginal = isOriginalNoteUrl(urlOrId);

      console.log(`正在获取笔记 ${noteId}${isOriginal ? ' (原文)' : ''}...`);

      const result = await saveNoteAsMarkdown({
        noteId,
        outputDir,
        assetsDir: ASSETS_DIR,
        isOriginal,
      });

      console.log('\n✓ 保存成功！');
      console.log(`  - Markdown: ${result.mdPath}`);
      console.log(`  - 图片: ${result.downloadedCount}/${result.imageCount} 张`);
      break;
    }

    case 'get-latest': {
      // 获取最新笔记
      const outputDir = args[1] || OUTPUT_DIR;

      console.log('正在获取最新笔记...');

      const result = await getLatestNoteAsMarkdown({ outputDir, assetsDir: ASSETS_DIR });

      console.log('\n✓ 保存成功！');
      console.log(`  - Markdown: ${result.mdPath}`);
      console.log(`  - 图片: ${result.downloadedCount}/${result.imageCount} 张`);
      break;
    }

    case 'get-latest-original': {
      // 获取最新原文笔记
      const outputDir = args[1] || OUTPUT_DIR;

      console.log('正在获取最新原文笔记...');

      const result = await getLatestOriginalNoteAsMarkdown({ outputDir, assetsDir: ASSETS_DIR });

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

  biji install-skill [--force]       安装 Claude Code Skill（推荐）
                                      --force - 强制重新安装

  biji get-note <URL|ID> [outputDir] 获取笔记并保存为 Markdown
                                      支持完整 URL 或笔记 ID
                                      普通笔记: https://www.biji.com/note/1900215167371849544
                                      原文笔记: https://www.biji.com/note/1900215167371849544/web

  biji get-latest [outputDir]         获取最新一篇笔记并保存
  biji get-latest-original [outputDir] 获取最新一篇原文笔记并保存

  biji config [show|set|wizard]      配置输出目录和图片目录
                                      show  - 显示当前配置
                                      set   - 设置配置项
                                      wizard- 交互式配置向导

参数:
  outputDir  可选，默认从配置文件读取（优先级: 命令行参数 > 配置文件 > 环境变量 > 默认值）

示例:
  # 首次使用（推荐）
  biji login
  biji install-skill

  # 之后可以直接使用关键词（在 Claude Code 中）
  # "保存最新的 biji 笔记"
  # "获取笔记 123456"

  # 查看当前配置
  biji config show

  # 使用向导配置
  biji config wizard

  # 设置输出目录
  biji config set --output-dir ~/Documents/MyNotes

  # 使用 URL 获取笔记
  biji get-note https://www.biji.com/note/1900215167371849544

  # 使用笔记 ID 获取
  biji get-note 1900215167371849544

  # 获取最新笔记
  biji get-latest

  # 指定输出目录（一次性）
  biji get-note 1900215167371849544 ~/Documents/MyNotes
      `);
      break;
  }
}

main().catch(console.error);
