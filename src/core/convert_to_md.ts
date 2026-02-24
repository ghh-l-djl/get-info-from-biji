// 将 Get笔记 JSON 数据转换为 Markdown 文件
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import type { BijiApiResponse, MarkdownOutputOptions, ConversionResult } from '../types/note.js';

/**
 * 下载图片到本地
 */
async function downloadImage(url: string, targetPath: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;

    const buffer = Buffer.from(await response.arrayBuffer());
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * 从 URL 中提取文件 hash
 */
function extractHashFromUrl(url: string): string {
  // URL 格式: https://get-notes.umiwi.com/morphling%2Fvoicenotes%2Fprod%2F{hash}?...
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const hash = pathParts[pathParts.length - 1];
    // URL 解码
    return decodeURIComponent(hash);
  } catch {
    return Date.now().toString();
  }
}

/**
 * 获取图片扩展名
 */
async function getImageExtension(url: string): Promise<string> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('png')) return '.png';
    if (contentType?.includes('gif')) return '.gif';
    if (contentType?.includes('webp')) return '.webp';
  } catch {
    // 忽略错误，使用默认
  }
  return '.jpg';
}

/**
 * 将 Get笔记 JSON 转换为 Markdown 文件
 */
export async function convertToMarkdown(
  data: BijiApiResponse,
  options: MarkdownOutputOptions
): Promise<ConversionResult> {
  const { outputDir, assetsDir = join(outputDir, 'Assets'), imageFormat = 'obsidian' } = options;

  // 验证数据结构
  if (!data || !data.c) {
    throw new Error('无效的数据格式：缺少 c 字段');
  }

  const content = data.c.content;
  const title = data.c.title || '无标题';

  if (!content) {
    throw new Error('笔记内容为空');
  }

  // 确保目录存在
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  if (!existsSync(assetsDir)) {
    mkdirSync(assetsDir, { recursive: true });
  }

  // 提取图片链接: ![](https://get-notes.umiwi.com/...)
  const imagePattern = /!\[\]\((https:\/\/get-notes\.umiwi\.com\/[^)]+)\)/g;
  const imageUrls: string[] = [];
  let match;
  while ((match = imagePattern.exec(content)) !== null) {
    imageUrls.push(match[1]);
  }

  console.log(`发现 ${imageUrls.length} 张图片`);

  // 下载图片
  const urlToFilename: Record<string, string> = {};
  let downloadedCount = 0;

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    const hash = extractHashFromUrl(url);
    const ext = await getImageExtension(url);
    const filename = `${hash}${ext}`;
    const targetPath = join(assetsDir, filename);

    if (!existsSync(targetPath)) {
      console.log(`下载图片 ${i + 1}/${imageUrls.length}: ${filename}`);
      const success = await downloadImage(url, targetPath);
      if (success) {
        downloadedCount++;
        urlToFilename[url] = filename;
      } else {
        console.log(`下载失败: ${url}`);
      }
    } else {
      console.log(`图片已存在，跳过: ${filename}`);
      urlToFilename[url] = filename;
      downloadedCount++;
    }
  }

  // 替换图片路径
  let newContent = content.replace(imagePattern, (match, url) => {
    const filename = urlToFilename[url];
    if (!filename) return match; // 下载失败，保留原链接

    if (imageFormat === 'obsidian') {
      return `![[${filename}]]`;
    } else {
      return `![](Assets/${filename})`;
    }
  });

  // 清理标题中的特殊字符
  const safeTitle = title.replace(/[\\/*?:"<>|]/g, '');
  const mdFilename = `${safeTitle}.md`;
  const mdPath = join(outputDir, mdFilename);

  // 写入 markdown 文件
  const mdContent = `# ${title}\n\n${newContent}`;
  writeFileSync(mdPath, mdContent, 'utf-8');

  console.log(`\n✓ 转换完成！`);
  console.log(`  - Markdown 文件: ${mdPath}`);
  console.log(`  - 图片目录: ${assetsDir}`);
  console.log(`  - 成功下载: ${downloadedCount}/${imageUrls.length} 张图片`);

  return {
    mdPath,
    assetsDir,
    imageCount: imageUrls.length,
    downloadedCount,
  };
}
