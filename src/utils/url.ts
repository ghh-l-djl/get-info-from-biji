// URL 解析工具
/**
 * 从 biji.com URL 中解析笔记 ID
 * 支持两种格式：
 * - https://www.biji.com/note/1901959219372972664
 * - https://www.biji.com/note/1901959219372972664/web
 */
export function parseNoteIdFromUrl(urlOrId: string): string {
  // 如果直接是 noteId（纯数字），直接返回
  if (/^\d{16,}$/.test(urlOrId.trim())) {
    return urlOrId.trim();
  }

  // 从 URL 中解析
  const match = urlOrId.match(/note\/(\d+)/);
  if (match) {
    return match[1];
  }

  throw new Error(`无法从 URL 中解析笔记 ID: ${urlOrId}`);
}

/**
 * 判断是否为原文笔记 URL
 */
export function isOriginalNoteUrl(url: string): boolean {
  return url.includes('/note/') && url.includes('/web');
}

/**
 * 构建 biji.com 笔记 URL
 */
export function buildNoteUrl(noteId: string, isOriginal: boolean = false): string {
  const baseUrl = `https://www.biji.com/note/${noteId}`;
  return isOriginal ? `${baseUrl}/web` : baseUrl;
}
