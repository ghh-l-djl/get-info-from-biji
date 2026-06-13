// Types shared across the biji sync feature (notes-list pagination,
// sync state tracking, and email notification config).

/** A single item from the biji notes-list API response (data.c.list[i]). */
export interface NoteListItem {
  note_id?: string;
  id?: string;
  title: string;
  created_at: string;
  [key: string]: any;
}

export type SyncStatus = 'ok' | 'error';

/** Persisted at <syncRepoPath>/.biji-sync-state.json */
export interface SyncState {
  lastSyncedAt: string;
  lastStatus: SyncStatus;
  lastErrorMessage: string | null;
  lastChangedAt: string;
}

/** Outcome of one sync attempt, before being folded into SyncState. */
export interface SyncRunResult {
  status: SyncStatus;
  errorMessage: string | null;
  /** New notes saved this run, oldest-first. Empty on error. */
  syncedNotes: NoteListItem[];
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}
