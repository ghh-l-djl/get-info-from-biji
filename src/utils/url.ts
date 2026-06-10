// URL 解析工具
/**
 * 从 biji.com URL 中解析笔记 ID
 *
 * 笔记 ID 有两种格式：
 * - 纯数字 ID（如 1901959219372972664）
 * - 字母数字混合的分享 ID（如 YJ0K3AYD9KXEq11P），由 /mine/notes/ 分享链接使用，
 *   但同样可用于 /note/{id} 路径来获取笔记数据
 *
 * 支持的输入格式：
 * - 1901959219372972664 / YJ0K3AYD9KXEq11P（直接传 ID）
 * - https://www.biji.com/note/1901959219372972664
 * - https://www.biji.com/note/1901959219372972664/web
 * - https://www.biji.com/note/YJ0K3AYD9KXEq11P
 * - https://www.biji.com/mine/notes/YJ0K3AYD9KXEq11P
 */
export function parseNoteIdFromUrl(urlOrId: string): string {
  const trimmed = urlOrId.trim();

  // 如果直接是 noteId（数字或字母数字混合），直接返回
  if (/^[A-Za-z0-9]{16,}$/.test(trimmed)) {
    return trimmed;
  }

  // 从 URL 中解析，兼容 /note/{id} 和 /mine/notes/{id}
  const match = trimmed.match(/notes?\/([A-Za-z0-9]+)/);
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
