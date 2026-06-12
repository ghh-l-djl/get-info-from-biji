// State-file read/write and pure state-transition logic for biji sync.
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { computeLastSyncedAt } from './notes_list.js';
import type { SyncState, SyncRunResult } from '../types/sync.js';

/**
 * Compute the next persisted state from the current state and this run's
 * result. `changed` mirrors spec §4.2 step 4's stateChanged flag — when
 * false, the caller should skip writing the state/status files and the git
 * commit entirely.
 */
export function computeNextState(
  current: SyncState,
  result: SyncRunResult,
  now: string
): { state: SyncState; changed: boolean } {
  const newLastSyncedAt =
    result.status === 'ok' ? computeLastSyncedAt(current.lastSyncedAt, result.syncedNotes) : current.lastSyncedAt;

  const changed =
    newLastSyncedAt !== current.lastSyncedAt ||
    result.status !== current.lastStatus ||
    result.errorMessage !== current.lastErrorMessage;

  if (!changed) {
    return { state: current, changed: false };
  }

  return {
    state: {
      lastSyncedAt: newLastSyncedAt,
      lastStatus: result.status,
      lastErrorMessage: result.errorMessage,
      lastChangedAt: now,
    },
    changed: true,
  };
}

/** Render <syncRepoPath>/_biji-sync-status.md from the current state (spec §4.5). */
export function renderStatusMarkdown(state: SyncState): string {
  const lines = [
    '# Biji Sync Status',
    '',
    `- Last change: ${state.lastChangedAt}`,
    `- Result: ${state.lastStatus === 'ok' ? '✅ ok' : '❌ error'}`,
  ];
  if (state.lastStatus === 'error' && state.lastErrorMessage) {
    lines.push(`- Error: ${state.lastErrorMessage}`);
  }
  return lines.join('\n') + '\n';
}

export function loadState(stateFilePath: string): SyncState | null {
  if (!existsSync(stateFilePath)) {
    return null;
  }
  return JSON.parse(readFileSync(stateFilePath, 'utf-8')) as SyncState;
}

export function saveState(stateFilePath: string, state: SyncState): void {
  writeFileSync(stateFilePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}
