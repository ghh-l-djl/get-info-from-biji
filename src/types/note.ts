// 笔记类型定义

export interface BijiNote {
  noteId: string;
  title: string;
  content: string;
  images: string[];
  publishTime?: string;
  updateTime?: string;
  url: string;
}

export interface BijiNoteDetail extends BijiNote {
  author?: {
    userId: string;
    nickname: string;
    avatar?: string;
  };
  wordCount?: number;
  tags?: string[];
}

export interface BijiUser {
  userId: string;
  nickname: string;
  avatar?: string;
  email?: string;
}

// Get笔记 API 返回的数据类型
export interface BijiApiResponse {
  c: {
    content: string;
    title: string;
    noteId: string;
    userId?: string;
    createTime?: number;
    updateTime?: number;
  };
  [key: string]: any;
}

export interface MarkdownOutputOptions {
  outputDir: string;
  assetsDir?: string;
  imageFormat?: 'obsidian' | 'standard';
}

export interface ConversionResult {
  mdPath: string;
  assetsDir: string;
  imageCount: number;
  downloadedCount: number;
}
