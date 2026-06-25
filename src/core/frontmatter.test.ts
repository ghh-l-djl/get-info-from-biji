import { describe, it, expect } from 'vitest';
import { extractSourceTags, buildFrontmatter } from './frontmatter.js';

describe('extractSourceTags', () => {
  it('extracts space-separated tags and escapes them in the body', () => {
    const { tags, body } = extractSourceTags('好吃到哭 #美食 #探店推荐');

    expect(tags).toEqual(['美食', '探店推荐']);
    expect(body).toBe('好吃到哭 ＃美食 ＃探店推荐');
  });

  it('does not treat markdown headers as tags', () => {
    const { tags, body } = extractSourceTags('# 标题\n\n正文');

    expect(tags).toEqual([]);
    expect(body).toBe('# 标题\n\n正文');
  });

  it('ignores hash fragments inside lines that contain a URL', () => {
    const input = '[往期推荐](https://mp.weixin.qq.com/s?scene=21#wechat_redirect)';
    const { tags, body } = extractSourceTags(input);

    expect(tags).toEqual([]);
    expect(body).toBe(input);
  });

  it('dedupes repeated tags, keeping first-seen order', () => {
    const { tags } = extractSourceTags('#美食 今天又去吃了 #美食');

    expect(tags).toEqual(['美食']);
  });

  it('splits concatenated tags with no separating space', () => {
    const { tags, body } = extractSourceTags('#美食#探店');

    expect(tags).toEqual(['美食', '探店']);
    expect(body).toBe('＃美食＃探店');
  });

  it('returns an empty tag list and unchanged body when there are no tags', () => {
    const { tags, body } = extractSourceTags('没有标签的正文');

    expect(tags).toEqual([]);
    expect(body).toBe('没有标签的正文');
  });
});

describe('buildFrontmatter', () => {
  it('always includes an empty tags field for manual classification', () => {
    const fm = buildFrontmatter({ web_title: '标题', url: 'https://biji.com/note/1' });

    expect(fm).toContain('tags: []');
  });

  it('renders sourceTags as a block list when present', () => {
    const fm = buildFrontmatter({
      web_title: '标题',
      url: 'https://biji.com/note/1',
      sourceTags: ['美食', '探店'],
    });

    expect(fm).toContain('sourceTags:\n  - "美食"\n  - "探店"');
  });

  it('omits sourceTags entirely when empty', () => {
    const fm = buildFrontmatter({
      web_title: '标题',
      url: 'https://biji.com/note/1',
      sourceTags: [],
    });

    expect(fm).not.toContain('sourceTags');
  });

  it('quotes the title safely and wraps the block in --- delimiters', () => {
    const fm = buildFrontmatter({ web_title: '标题: 带"引号"的标题', url: 'https://biji.com/note/1' });

    expect(fm.startsWith('---\n')).toBe(true);
    expect(fm).toContain('web_title: "标题: 带\\"引号\\"的标题"');
    expect(fm.endsWith('---\n\n')).toBe(true);
  });

  it('includes publishTime when provided', () => {
    const fm = buildFrontmatter({
      web_title: '标题',
      url: 'https://biji.com/note/1',
      publishTime: '2026-06-25T10:00:00.000Z',
    });

    expect(fm).toContain('publishTime: "2026-06-25T10:00:00.000Z"');
  });
});
