// 配置文件
import { join } from 'path';
import { homedir } from 'os';

// 缓存目录配置
export const CACHE_DIR = join(homedir(), '.biji-cli');
export const NOTES_CACHE_DIR = join(CACHE_DIR, 'notes');
export const USER_CACHE_FILE = join(CACHE_DIR, 'user.json');

// 缓存时间配置（秒）
export const CACHE_TTL_NOTE_DETAIL = 7 * 24 * 60 * 60; // 7天
export const CACHE_TTL_USER_INFO = 24 * 60 * 60; // 1天

// API 配置
export const BIJI_BASE_URL = 'https://get-notes.luojilab.com/voicenotes/web';
export const BIJI_WEB_URL = 'https://www.biji.com';
