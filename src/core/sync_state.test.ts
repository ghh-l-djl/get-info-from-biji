import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { computeNextState, renderStatusMarkdown, loadState, saveState } from './sync_state.js';
import type { SyncState, SyncRunResult } from '../types/sync.js';

const baseState: SyncState = {
  lastSyncedAt: '2026-06-11 09:00:00',
  lastStatus: 'ok',
  lastErrorMessage: null,
  lastChangedAt: '2026-06-11 09:00:03',
};

describe('computeNextState', () => {
  it('advances lastSyncedAt and marks changed when new notes were synced', () => {
    const result: SyncRunResult = {
      status: 'ok',
      errorMessage: null,
      syncedNotes: [{ note_id: '1', title: 'a', created_at: '2026-06-11 09:30:00' }],
    };
    const { state, changed } = computeNextState(baseState, result, '2026-06-11 10:00:00');
    expect(changed).toBe(true);
    expect(state.lastSyncedAt).toBe('2026-06-11 09:30:00');
    expect(state.lastStatus).toBe('ok');
    expect(state.lastChangedAt).toBe('2026-06-11 10:00:00');
  });

  it('does not change state when status stays ok and no new notes', () => {
    const result: SyncRunResult = { status: 'ok', errorMessage: null, syncedNotes: [] };
    const { state, changed } = computeNextState(baseState, result, '2026-06-11 10:00:00');
    expect(changed).toBe(false);
    expect(state).toBe(baseState);
  });

  it('marks changed on ok -> error transition without advancing lastSyncedAt', () => {
    const result: SyncRunResult = {
      status: 'error',
      errorMessage: '未登录，请到闲置 Mac 上运行 biji login',
      syncedNotes: [],
    };
    const { state, changed } = computeNextState(baseState, result, '2026-06-11 11:00:00');
    expect(changed).toBe(true);
    expect(state.lastStatus).toBe('error');
    expect(state.lastSyncedAt).toBe('2026-06-11 09:00:00');
    expect(state.lastErrorMessage).toBe('未登录，请到闲置 Mac 上运行 biji login');
  });

  it('does not change state on a repeated identical error', () => {
    const errorState: SyncState = {
      lastSyncedAt: '2026-06-11 09:00:00',
      lastStatus: 'error',
      lastErrorMessage: 'boom',
      lastChangedAt: '2026-06-11 11:00:00',
    };
    const result: SyncRunResult = { status: 'error', errorMessage: 'boom', syncedNotes: [] };
    const { changed } = computeNextState(errorState, result, '2026-06-11 12:00:00');
    expect(changed).toBe(false);
  });

  it('marks changed on error -> ok recovery even with no new notes', () => {
    const errorState: SyncState = {
      lastSyncedAt: '2026-06-11 09:00:00',
      lastStatus: 'error',
      lastErrorMessage: 'boom',
      lastChangedAt: '2026-06-11 11:00:00',
    };
    const result: SyncRunResult = { status: 'ok', errorMessage: null, syncedNotes: [] };
    const { state, changed } = computeNextState(errorState, result, '2026-06-11 12:00:00');
    expect(changed).toBe(true);
    expect(state.lastStatus).toBe('ok');
    expect(state.lastErrorMessage).toBeNull();
  });
});

describe('renderStatusMarkdown', () => {
  it('renders an ok status without an Error line', () => {
    const md = renderStatusMarkdown(baseState);
    expect(md).toContain('✅ ok');
    expect(md).not.toContain('- Error:');
  });

  it('renders an error status with the error message', () => {
    const errorState: SyncState = {
      lastSyncedAt: '2026-06-11 09:00:00',
      lastStatus: 'error',
      lastErrorMessage: '未登录，请到闲置 Mac 上运行 biji login',
      lastChangedAt: '2026-06-11 11:00:02',
    };
    const md = renderStatusMarkdown(errorState);
    expect(md).toContain('❌ error');
    expect(md).toContain('- Error: 未登录，请到闲置 Mac 上运行 biji login');
  });
});

describe('loadState / saveState', () => {
  it('round-trips state through a JSON file, returning null when missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'biji-sync-state-'));
    const stateFile = join(dir, '.biji-sync-state.json');
    try {
      expect(loadState(stateFile)).toBeNull();
      saveState(stateFile, baseState);
      expect(loadState(stateFile)).toEqual(baseState);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
