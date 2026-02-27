// 配置文件
import { join, dirname } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// ==================== 配置文件读取 ====================

/** 配置文件接口 */
interface BijiConfig {
  outputDir?: string;
  assetsDir?: string;
}

/**
 * 获取项目根目录（脚本所在目录）
 * 在 ESM 环境下使用 import.meta.url 获取当前文件路径
 *
 * 编译后文件结构: dist/config/index.js
 * 需要向上三级到项目根目录
 */
function getProjectDir(): string {
  try {
    // ESM 环境：使用 import.meta.url
    const currentFilePath = fileURLToPath(import.meta.url);
    // 从 dist/config/index.js 到项目根目录，需要向上三级
    return dirname(dirname(dirname(currentFilePath)));
  } catch {
    // CommonJS 环境或降级方案
    return process.cwd();
  }
}

/**
 * 读取用户配置文件
 * 优先级: 项目目录配置 > 当前工作目录配置 > 用户主目录配置
 */
function loadConfig(): BijiConfig {
  const configs: BijiConfig = {};

  // 1. 尝试读取项目目录下的配置文件（从脚本位置推导）
  const projectDir = getProjectDir();
  const projectConfigPath = join(projectDir, '.bijirc.json');
  if (existsSync(projectConfigPath)) {
    try {
      const projectConfig = JSON.parse(readFileSync(projectConfigPath, 'utf-8'));
      Object.assign(configs, projectConfig);
    } catch (error) {
      console.warn(`读取项目配置文件失败: ${projectConfigPath}`);
    }
  }

  // 2. 尝试读取当前工作目录下的配置文件（用于 CLI）
  const cwdConfigPath = join(process.cwd(), '.bijirc.json');
  if (existsSync(cwdConfigPath) && cwdConfigPath !== projectConfigPath) {
    try {
      const cwdConfig = JSON.parse(readFileSync(cwdConfigPath, 'utf-8'));
      Object.assign(configs, cwdConfig);
    } catch (error) {
      console.warn(`读取工作目录配置文件失败: ${cwdConfigPath}`);
    }
  }

  // 3. 尝试读取用户主目录下的配置文件
  const userConfigPath = join(homedir(), '.bijirc.json');
  if (existsSync(userConfigPath)) {
    try {
      const userConfig = JSON.parse(readFileSync(userConfigPath, 'utf-8'));
      Object.assign(configs, userConfig);
    } catch (error) {
      console.warn(`读取用户配置文件失败: ${userConfigPath}`);
    }
  }

  return configs;
}

// 加载配置
const userConfig = loadConfig();

// ==================== 输出目录配置 ====================

/** 默认输出目录 */
const DEFAULT_OUTPUT_DIR = join(homedir(), 'Documents/A第二大脑');

/** 输出目录（可通过环境变量或配置文件覆盖） */
export const OUTPUT_DIR =
  process.env.BIJI_OUTPUT_DIR ||
  userConfig.outputDir ||
  DEFAULT_OUTPUT_DIR;

/** 图片目录名称 */
export const ASSETS_DIR_NAME = 'Assets';

/** 图片目录（可通过环境变量或配置文件覆盖） */
export const ASSETS_DIR =
  process.env.BIJI_ASSETS_DIR ||
  userConfig.assetsDir ||
  join(OUTPUT_DIR, ASSETS_DIR_NAME);

// ==================== 缓存目录配置 ====================

export const CACHE_DIR = join(homedir(), '.biji-cli');
export const NOTES_CACHE_DIR = join(CACHE_DIR, 'notes');
export const USER_CACHE_FILE = join(CACHE_DIR, 'user.json');

// 缓存时间配置（秒）
export const CACHE_TTL_NOTE_DETAIL = 7 * 24 * 60 * 60; // 7天
export const CACHE_TTL_USER_INFO = 24 * 60 * 60; // 1天

// API 配置
export const BIJI_BASE_URL = 'https://get-notes.luojilab.com/voicenotes/web';
export const BIJI_WEB_URL = 'https://www.biji.com';
