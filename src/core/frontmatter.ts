// 笔记 frontmatter 生成：把小红书自带的话题标签与 Obsidian 分类标签分开管理

export interface ExtractedTags {
  body: string;
  tags: string[];
}

const HASHTAG_PATTERN = /#([^\s#]+)/g;

/**
 * 从正文里提取 #话题标签，并把它们转义成全角＃，避免被 Obsidian 当作真实标签收录。
 * 跳过含 URL 的行，因为链接里的 # 通常是锚点（如 #wechat_redirect），不是话题标签。
 */
export function extractSourceTags(content: string): ExtractedTags {
  const tags: string[] = [];
  const seen = new Set<string>();

  const lines = content.split('\n').map((line) => {
    if (/https?:\/\//.test(line)) {
      return line;
    }

    return line.replace(HASHTAG_PATTERN, (match, tag) => {
      if (!seen.has(tag)) {
        seen.add(tag);
        tags.push(tag);
      }
      return `＃${tag}`;
    });
  });

  return { body: lines.join('\n'), tags };
}

export interface FrontmatterFields {
  web_title: string;
  url: string;
  publishTime?: string;
  sourceTags?: string[];
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

export function buildFrontmatter(fields: FrontmatterFields): string {
  const lines = [
    '---',
    `web_title: ${yamlString(fields.web_title)}`,
    `url: ${yamlString(fields.url)}`,
  ];

  if (fields.publishTime) {
    lines.push(`publishTime: ${yamlString(fields.publishTime)}`);
  }

  lines.push('source: ai');
  lines.push('ai_skill: biji-sync');
  lines.push('status: inbox');
  lines.push('publish_status: none');
  lines.push('tags: []');

  if (fields.sourceTags && fields.sourceTags.length > 0) {
    lines.push('sourceTags:');
    for (const tag of fields.sourceTags) {
      lines.push(`  - ${yamlString(tag)}`);
    }
  } else {
    lines.push('sourceTags: []');
  }

  lines.push('---', '');
  return lines.join('\n') + '\n';
}
