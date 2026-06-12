// State-file read/write and pure state-transition logic for biji sync.
import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs';
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
    lines.push(`- Error: ${state.lastErrorMessage.replace(/\n/g, ' ')}`);
  }
  return lines.join('\n') + '\n';
}

export function loadState(stateFilePath: string): SyncState | null {
  if (!existsSync(stateFilePath)) {
    return null;
  }
  const parsed = JSON.parse(readFileSync(stateFilePath, 'utf-8')) as unknown;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as SyncState).lastSyncedAt !== 'string' ||
    ((parsed as SyncState).lastStatus !== 'ok' && (parsed as SyncState).lastStatus !== 'error') ||
    typeof (parsed as SyncState).lastChangedAt !== 'string'
  ) {
    throw new Error(`状态文件损坏：${stateFilePath}，请删除该文件后重新运行 biji sync 进行初始化`);
  }
  return parsed as SyncState;
}

export function saveState(stateFilePath: string, state: SyncState): void {
  // Write to a temp file then rename — rename is atomic on the same
  // filesystem, so a crash mid-write can never leave a truncated state file.
  const tmpPath = `${stateFilePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  renameSync(tmpPath, stateFilePath);
}
