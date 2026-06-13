import { describe, it, expect } from 'vitest';
import { getItemId, needsMorePages, selectNewNotes, computeLastSyncedAt } from './notes_list.js';
import type { NoteListItem } from '../types/sync.js';

describe('getItemId', () => {
  it('prefers note_id over id', () => {
    expect(getItemId({ note_id: 'a', id: 'b', title: 't', created_at: '2026-06-01 00:00:00' })).toBe('a');
  });

  it('falls back to id when note_id is missing', () => {
    expect(getItemId({ id: 'b', title: 't', created_at: '2026-06-01 00:00:00' })).toBe('b');
  });

  it('throws when neither note_id nor id is present', () => {
    expect(() => getItemId({ title: 't', created_at: '2026-06-01 00:00:00' })).toThrow();
  });
});

describe('needsMorePages', () => {
  const items: NoteListItem[] = [
    { note_id: '1', title: 'a', created_at: '2026-06-11 12:00:00' },
    { note_id: '2', title: 'b', created_at: '2026-06-11 11:00:00' },
  ];

  it('returns false when has_more is false', () => {
    expect(needsMorePages(items, '2026-06-10 00:00:00', false)).toBe(false);
  });

  it('returns false when accumulated list is empty', () => {
    expect(needsMorePages([], '2026-06-10 00:00:00', true)).toBe(false);
  });

  it('returns true when the oldest accumulated item is newer than sinceTimestamp and has_more is true', () => {
    expect(needsMorePages(items, '2026-06-10 00:00:00', true)).toBe(true);
  });

  it('returns false once the oldest accumulated item is at or before sinceTimestamp (deletion-safe stop)', () => {
    expect(needsMorePages(items, '2026-06-11 11:00:00', true)).toBe(false);
  });
});

describe('selectNewNotes', () => {
  it('filters out items at or before sinceTimestamp and sorts the rest oldest-first', () => {
    const items: NoteListItem[] = [
      { note_id: '3', title: 'newest', created_at: '2026-06-11 12:00:00' },
      { note_id: '2', title: 'middle', created_at: '2026-06-11 11:00:00' },
      { note_id: '1', title: 'boundary', created_at: '2026-06-11 10:00:00' },
    ];
    const result = selectNewNotes(items, '2026-06-11 10:00:00');
    expect(result.map((n) => n.note_id)).toEqual(['2', '3']);
  });

  it('returns an empty array when nothing is newer than sinceTimestamp', () => {
    const items: NoteListItem[] = [{ note_id: '1', title: 'old', created_at: '2026-06-11 09:00:00' }];
    expect(selectNewNotes(items, '2026-06-11 10:00:00')).toEqual([]);
  });
});

describe('computeLastSyncedAt', () => {
  it('returns the current value when there are no synced notes', () => {
    expect(computeLastSyncedAt('2026-06-11 09:00:00', [])).toBe('2026-06-11 09:00:00');
  });

  it('returns the max created_at among synced notes', () => {
    const notes: NoteListItem[] = [
      { note_id: '1', title: 'a', created_at: '2026-06-11 10:00:00' },
      { note_id: '2', title: 'b', created_at: '2026-06-11 11:30:00' },
    ];
    expect(computeLastSyncedAt('2026-06-11 09:00:00', notes)).toBe('2026-06-11 11:30:00');
  });
});
