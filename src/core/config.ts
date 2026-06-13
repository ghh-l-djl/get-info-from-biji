// 配置管理
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, writeFileSync, readFileSync } from 'fs';

/** 配置文件接口 */
interface BijiConfig {
  outputDir?: string;
  assetsDir?: string;
  syncRepoUrl?: string;
  syncRepoPath?: string;
  notifyEmail?: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
  };
}

/** 用户配置文件路径 */
const USER_CONFIG_PATH = join(homedir(), '.bijirc.json');

/**
 * 显示当前配置
 */
export function showConfig() {
  console.log('\n📝 当前配置:');
  console.log(`\n配置文件位置: ${USER_CONFIG_PATH}`);

  if (existsSync(USER_CONFIG_PATH)) {
    try {
      const config = JSON.parse(readFileSync(USER_CONFIG_PATH, 'utf-8'));
      console.log('\n自定义配置:');
      console.log(`  - 输出目录: ${config.outputDir || '未设置'}`);
      console.log(`  - Assets 目录: ${config.assetsDir || '未设置'}`);
      console.log(`  - 同步仓库 URL: ${config.syncRepoUrl || '未设置'}`);
      console.log(`  - 同步仓库路径: ${config.syncRepoPath || join(homedir(), '.biji-cli', 'vault-sync') + ' (默认)'}`);
      console.log(`  - 失败通知邮箱: ${config.notifyEmail || '未设置'}`);
      console.log(`  - SMTP 配置: ${config.smtp ? '已设置' : '未设置'}`);
    } catch (error) {
      console.log('\n⚠️  配置文件格式错误');
    }
  } else {
    console.log('\n未找到自定义配置文件，将使用默认配置:');
    console.log(`  - 输出目录: ${join(homedir(), 'Documents/A第二大脑')}`);
    console.log(`  - Assets 目录: {输出目录}/Assets`);
    console.log(`  - 同步仓库路径: ${join(homedir(), '.biji-cli', 'vault-sync')}`);
    console.log(`  - 同步仓库 URL / 失败通知邮箱 / SMTP: 未设置`);
  }
}

/**
 * 设置配置
 */
export async function setConfig(options: {
  outputDir?: string;
  assetsDir?: string;
  syncRepoUrl?: string;
  syncRepoPath?: string;
  notifyEmail?: string;
}) {
  // 读取现有配置
  let config: BijiConfig = {};
  if (existsSync(USER_CONFIG_PATH)) {
    try {
      config = JSON.parse(readFileSync(USER_CONFIG_PATH, 'utf-8'));
    } catch (error) {
      console.log('⚠️  现有配置文件格式错误，将创建新配置');
      config = {};
    }
  }

  // 更新配置
  if (options.outputDir) {
    config.outputDir = options.outputDir;
  }
  if (options.assetsDir) {
    config.assetsDir = options.assetsDir;
  }
  if (options.syncRepoUrl) {
    config.syncRepoUrl = options.syncRepoUrl;
  }
  if (options.syncRepoPath) {
    config.syncRepoPath = options.syncRepoPath;
  }
  if (options.notifyEmail) {
    config.notifyEmail = options.notifyEmail;
  }

  // 写入配置文件
  try {
    writeFileSync(USER_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    console.log('\n✓ 配置已保存！');
    console.log(`\n配置文件位置: ${USER_CONFIG_PATH}`);
    console.log('\n当前配置:');
    console.log(`  - 输出目录: ${config.outputDir || '未设置'}`);
    console.log(`  - Assets 目录: ${config.assetsDir || '未设置'}`);
    console.log(`  - 同步仓库 URL: ${config.syncRepoUrl || '未设置'}`);
    console.log(`  - 同步仓库路径: ${config.syncRepoPath || '未设置（默认 ~/.biji-cli/vault-sync）'}`);
    console.log(`  - 失败通知邮箱: ${config.notifyEmail || '未设置'}`);
    console.log('\n提示: 修改配置后无需重启，立即生效');
    if (!config.smtp) {
      console.log('提示: smtp 配置（SMTP 发信凭据）需要直接编辑 ~/.bijirc.json，添加 "smtp": { "host", "port", "secure", "user", "pass", "from" } 字段');
    }
  } catch (error) {
    console.error('\n❌ 保存配置失败:', error);
    process.exit(1);
  }
}

/**
 * 交互式配置向导
 */
export async function configWizard() {
  console.log('\n📝 biji-cli 配置向导');
  console.log('====================\n');
  console.log('本向导将帮助您设置输出目录和图片目录配置。\n');

  const readline = await import('readline');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  try {
    // 显示当前配置
    showConfig();

    console.log('\n请输入新的配置（直接回车保持当前值）:\n');

    // 输出目录
    const currentOutputDir = existsSync(USER_CONFIG_PATH)
      ? JSON.parse(readFileSync(USER_CONFIG_PATH, 'utf-8')).outputDir || ''
      : '';
    const outputDirAnswer = await question(
      `输出目录 [${currentOutputDir || join(homedir(), 'Documents/A第二大脑')}]: `
    );
    const outputDir = outputDirAnswer.trim() || currentOutputDir || undefined;

    // Assets 目录
    const currentAssetsDir = existsSync(USER_CONFIG_PATH)
      ? JSON.parse(readFileSync(USER_CONFIG_PATH, 'utf-8')).assetsDir || ''
      : '';
    const assetsDirAnswer = await question(
      `Assets 目录 [${currentAssetsDir || '{输出目录}/Assets'}]: `
    );
    const assetsDir = assetsDirAnswer.trim() || currentAssetsDir || undefined;

    rl.close();

    // 保存配置
    await setConfig({ outputDir, assetsDir });
  } catch (error) {
    rl.close();
    console.error('\n❌ 配置取消:', error);
  }
}
