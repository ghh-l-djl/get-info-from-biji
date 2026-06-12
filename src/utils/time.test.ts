import { describe, it, expect } from 'vitest';
import { formatTimestamp } from './time.js';

describe('formatTimestamp', () => {
  it('formats a date as "YYYY-MM-DD HH:MM:SS"', () => {
    const date = new Date(2026, 5, 11, 9, 0, 3); // 2026-06-11 09:00:03 (month is 0-indexed)
    expect(formatTimestamp(date)).toBe('2026-06-11 09:00:03');
  });

  it('zero-pads single-digit month, day, hour, minute, and second', () => {
    const date = new Date(2026, 0, 5, 1, 2, 3); // 2026-01-05 01:02:03
    expect(formatTimestamp(date)).toBe('2026-01-05 01:02:03');
  });
});
