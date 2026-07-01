import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { convertToMarkdown } from './convert_to_md.js';
import type { BijiApiResponse } from '../types/note.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'biji-convert-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('convertToMarkdown frontmatter', () => {
  it('writes a frontmatter block with lifecycle fields, empty tags, and extracted sourceTags', async () => {
    const data: BijiApiResponse = {
      c: {
        content: '好吃到哭 #美食 #探店推荐',
        title: '测试笔记',
        noteId: 'note-123',
        createTime: 1750000000000,
      },
    };

    const result = await convertToMarkdown(data, {
      outputDir: dir,
      noteUrl: 'https://www.biji.com/note/note-123',
    });

    const written = readFileSync(result.mdPath, 'utf-8');

    expect(written).toContain('---\n');
    expect(written).toContain('url: "https://www.biji.com/note/note-123"');
    expect(written).toContain('publishTime: "2025-06-15T15:06:40.000Z"');
    expect(written).toContain('source: ai');
    expect(written).toContain('ai_skill: biji-sync');
    expect(written).toContain('status: inbox');
    expect(written).toContain('publish_status: none');
    expect(written).toContain('tags: []');
    expect(written).not.toContain('publish: []');
    expect(written).not.toContain('tags: [inbox]');
    expect(written).toContain('sourceTags:\n  - "美食"\n  - "探店推荐"');
    expect(written).toContain('好吃到哭 ＃美食 ＃探店推荐');
    expect(written).not.toMatch(/(?<!＃)#美食/);
  });

  it('falls back to a biji.com URL built from noteId when noteUrl is not provided', async () => {
    const data: BijiApiResponse = {
      c: { content: '没有标签的正文', title: '无标签笔记', noteId: 'note-456' },
    };

    const result = await convertToMarkdown(data, { outputDir: dir });
    const written = readFileSync(result.mdPath, 'utf-8');

    expect(written).toContain('url: "https://www.biji.com/note/note-456"');
    expect(written).toContain('sourceTags: []');
  });
});
