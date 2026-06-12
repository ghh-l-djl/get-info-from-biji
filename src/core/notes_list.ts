// Pure logic for filtering, sorting, and paginating the biji notes list.
import type { NoteListItem } from '../types/sync.js';

/** Resolve a note's id, matching the existing getLatestNoteId() convention. */
export function getItemId(item: NoteListItem): string {
  const id = item.note_id || item.id;
  if (!id) {
    throw new Error('笔记缺少 note_id/id 字段');
  }
  return id;
}

/**
 * Decide whether to fetch another page of the notes list.
 *
 * `accumulated` is all items seen so far across pages, in the API's
 * create_desc order (oldest item is last). The stop condition is a
 * timestamp threshold rather than matching a specific note, so it stays
 * correct even if the note that originally had `sinceTimestamp` was deleted.
 */
export function needsMorePages(accumulated: NoteListItem[], sinceTimestamp: string, hasMore: boolean): boolean {
  if (!hasMore || accumulated.length === 0) {
    return false;
  }
  const oldest = accumulated[accumulated.length - 1];
  return oldest.created_at > sinceTimestamp;
}

/** Filter to items newer than sinceTimestamp, sorted oldest-first. */
export function selectNewNotes(accumulated: NoteListItem[], sinceTimestamp: string): NoteListItem[] {
  return accumulated
    .filter((item) => item.created_at > sinceTimestamp)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
}

/** New high-water mark after a successful sync: the max created_at among synced notes. */
export function computeLastSyncedAt(currentLastSyncedAt: string, syncedNotes: NoteListItem[]): string {
  if (syncedNotes.length === 0) {
    return currentLastSyncedAt;
  }
  return syncedNotes.reduce((max, n) => (n.created_at > max ? n.created_at : max), syncedNotes[0].created_at);
}
