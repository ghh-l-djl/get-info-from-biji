# Biji Notes Sync (`biji sync`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `biji sync` CLI command that fetches new biji.com notes (created since the last run), saves them as Markdown into a local clone of the user's Obsidian vault repo, commits/pushes the changes (plus a state file and status note) to GitHub, and emails the user on failure/recovery — runnable hourly via launchd on an idle Mac.

**Architecture:** New pure-logic modules (`notes_list.ts`, `sync_state.ts`, `time.ts`) handle filtering/pagination-stop decisions and state transitions and are unit-tested with Vitest. New I/O modules (`git_ops.ts`, `notify_email.ts`, `get_new_notes.ts`) wrap git CLI calls, SMTP sending, and the existing Puppeteer notes-list interception (extended with pagination via the page's own "load more"). `sync_notes.ts` orchestrates all of these into the 7-step run described in the approved spec. `src/cli.ts` gains a `sync` subcommand; `src/config/index.ts` / `src/core/config.ts` gain the new config keys.

**Tech Stack:** TypeScript (existing project conventions), Node.js `child_process`/`fs` for git and file I/O, `puppeteer-core` via `@asd345gh/mcpkit/browser` (existing pattern), `nodemailer` (new dependency) for SMTP email, `vitest` (new dev dependency, scoped to the three pure-logic modules — orchestration/browser/git/email remain manual per spec §7, consistent with this project having no existing test framework).

**Spec:** `docs/superpowers/specs/2026-06-11-biji-notes-sync-design.md` (approved).

---

## File Structure

**New files:**
- `src/utils/time.ts` — `formatTimestamp(date)`, pure, unit-tested
- `src/utils/time.test.ts`
- `src/types/sync.ts` — `NoteListItem`, `SyncState`, `SyncRunResult`, `SmtpConfig` types
- `src/core/notes_list.ts` — pure pagination/filtering logic, unit-tested
- `src/core/notes_list.test.ts`
- `src/core/sync_state.ts` — state transitions + state file I/O, unit-tested
- `src/core/sync_state.test.ts`
- `src/core/git_ops.ts` — git CLI wrappers (pull/commit/push/clone), manual-tested
- `src/core/notify_email.ts` — `sendStatusEmail` via nodemailer, manual-tested
- `src/core/get_new_notes.ts` — `getNewNotes(sinceTimestamp)`, Puppeteer + pagination, manual-tested
- `src/core/sync_notes.ts` — `runSync(options)`, top-level orchestration
- `scripts/launchd/run-sync.sh` — wrapper script template for the idle Mac
- `scripts/launchd/com.bijicli.sync.plist` — LaunchAgent template

**Modified files:**
- `package.json` — add `nodemailer`, `@types/nodemailer`, `vitest`; add `test` script
- `tsconfig.json` — exclude `*.test.ts` from the build
- `src/config/index.ts` — add `SYNC_REPO_URL`, `SYNC_REPO_PATH`, `NOTIFY_EMAIL`, `SMTP_CONFIG`
- `src/core/config.ts` — extend `BijiConfig`, `setConfig`, `showConfig` for new keys
- `src/cli.ts` — add `sync` subcommand, `config set` flags, help text
- `README.md` — document `biji sync`, new config keys, idle-Mac launchd setup

---

## Task 1: Project setup — dependencies and test tooling

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Add new dependencies to `package.json`**

In `package.json`, replace the `"dependencies"` and `"devDependencies"` blocks:

```json
  "dependencies": {
    "@asd345gh/mcpkit": "^1.0.0",
    "@modelcontextprotocol/sdk": "^1.0.4",
    "nodemailer": "^8.0.11",
    "puppeteer-core": "^24.29.1"
  },
  "devDependencies": {
    "@types/node": "^24.10.0",
    "@types/nodemailer": "^8.0.1",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^3.2.6"
  }
```

Also add a `test` script next to `"biji": "tsx src/cli.ts"`:

```json
    "biji": "tsx src/cli.ts",
    "test": "vitest run"
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: installs `nodemailer`, `@types/nodemailer`, `vitest` with no errors.

**Note on the `nodemailer` version**: `^6.9.0` (an earlier draft) resolves to a version with a known high-severity advisory (GHSA-rcmh-qjqh-p98v, recursive-call DoS in `addressparser`, fixed only in nodemailer >=8.0.x — a major-version bump, not just a patch within 6.x). `^8.0.11` is pinned instead, which is clean per `npm audit`. The `createTransport`/`sendMail` API used in Task 7 (`src/core/notify_email.ts`) is unchanged between nodemailer 6.x and 8.x.

**Note on the `vitest` version**: `^2.1.0` (an earlier draft) resolves to a version with a known **critical** advisory (GHSA-5xrq-8626-4rwp, arbitrary file read/execute when the Vitest UI server is listening, fixed in `3.2.6`). `^3.2.6` is pinned instead — the latest 3.x release and the exact version the advisory's fix range (`<3.2.6`) requires, so this is the smallest possible jump that resolves it (rather than the major `4.x` that `npm audit fix` defaults to). This also clears the transitive `vite`/`esbuild`/`@vitest/mocker` advisories that came bundled with `vitest@2.1.x`. Picked before any test files exist (Task 1, before Task 2's TDD work begins) specifically to avoid writing 13 tasks' worth of tests against a vitest version that would need a breaking-change migration later. The core `describe`/`it`/`expect`/`vi.fn`/`vi.mock` APIs used by this plan's tests are stable across vitest 2.x→3.x.

- [ ] **Step 3: Exclude test files from the TypeScript build**

In `tsconfig.json`, change:

```json
  "exclude": ["node_modules", "dist"]
```

to:

```json
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tsconfig.json
git commit -m "chore: add nodemailer and vitest for biji sync"
```

---

## Task 2: Timestamp formatting utility (TDD)

**Files:**
- Create: `src/utils/time.test.ts`
- Create: `src/utils/time.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/time.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/time.test.ts`
Expected: FAIL — `Failed to resolve import "./time.js"` (the implementation file doesn't exist yet).

- [ ] **Step 3: Implement `formatTimestamp`**

Create `src/utils/time.ts`:

```typescript
// Format a Date as "YYYY-MM-DD HH:MM:SS" (local time), matching the
// created_at format used by biji's notes-list API so timestamps compare
// correctly as plain strings.
export function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/time.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/utils/time.ts src/utils/time.test.ts
git commit -m "feat: add formatTimestamp utility for biji sync"
```

---

## Task 3: Sync type definitions

**Files:**
- Create: `src/types/sync.ts`

- [ ] **Step 1: Define the shared types**

Create `src/types/sync.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/types/sync.ts
git commit -m "feat: add type definitions for biji sync"
```

---

## Task 4: Pure notes-list logic (TDD)

**Files:**
- Create: `src/core/notes_list.test.ts`
- Create: `src/core/notes_list.ts`

This implements spec §4.1's filtering, the deletion-safe pagination-stop check, and the high-water-mark calculation, as pure functions over arrays.

- [ ] **Step 1: Write the failing tests**

Create `src/core/notes_list.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/notes_list.test.ts`
Expected: FAIL — `Failed to resolve import "./notes_list.js"`.

- [ ] **Step 3: Implement the pure logic**

Create `src/core/notes_list.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/notes_list.test.ts`
Expected: PASS — 9 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/core/notes_list.ts src/core/notes_list.test.ts
git commit -m "feat: add pure notes-list filtering and pagination logic"
```

---

## Task 5: Sync state transitions and state file I/O (TDD)

**Files:**
- Create: `src/core/sync_state.test.ts`
- Create: `src/core/sync_state.ts`

Implements spec §4.2 step 4 (`stateChanged` computation), §4.4 (state file), and §4.5 (status note rendering).

- [ ] **Step 1: Write the failing tests**

Create `src/core/sync_state.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/sync_state.test.ts`
Expected: FAIL — `Failed to resolve import "./sync_state.js"`.

- [ ] **Step 3: Implement state transitions, rendering, and file I/O**

Create `src/core/sync_state.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/sync_state.test.ts`
Expected: PASS — 7 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/core/sync_state.ts src/core/sync_state.test.ts
git commit -m "feat: add sync state transitions, status rendering, and state file I/O"
```

---

## Task 6: Git operation wrappers

**Files:**
- Create: `src/core/git_ops.ts`

Implements the git steps from spec §4.2 (pull --rebase, commit, push with one rebase-retry, rebase --abort on repeated failure) and §4.3 (clone on first run if `<syncRepoPath>` doesn't exist yet). Per spec §7, this is manual-tested (shelling out to git is awkward to unit test and the spec doesn't ask for it).

- [ ] **Step 1: Implement the git wrappers**

Create `src/core/git_ops.ts`:

```typescript
// Git CLI wrappers for biji sync. Each function shells out to `git` and
// returns a result object instead of throwing, so sync_notes.ts can log and
// email failures without a try/catch around every call.
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export interface GitResult {
  ok: boolean;
  error?: string;
}

function run(args: string[], cwd: string): GitResult {
  try {
    execFileSync('git', args, { cwd, stdio: 'pipe' });
    return { ok: true };
  } catch (e: any) {
    const message = e.stderr ? e.stderr.toString().trim() : String(e.message);
    return { ok: false, error: message };
  }
}

/** True if <repoPath>/.git exists (i.e. repoPath is already a git checkout). */
export function isGitRepo(repoPath: string): boolean {
  return existsSync(join(repoPath, '.git'));
}

export function gitClone(url: string, targetPath: string): GitResult {
  try {
    execFileSync('git', ['clone', url, targetPath], { stdio: 'pipe' });
    return { ok: true };
  } catch (e: any) {
    const message = e.stderr ? e.stderr.toString().trim() : String(e.message);
    return { ok: false, error: message };
  }
}

export function gitPullRebase(repoPath: string): GitResult {
  return run(['pull', '--rebase'], repoPath);
}

/** True if there are staged, unstaged, or untracked changes. */
export function gitHasChanges(repoPath: string): boolean {
  const out = execFileSync('git', ['status', '--porcelain'], { cwd: repoPath }).toString();
  return out.trim().length > 0;
}

export function gitCommitAll(repoPath: string, message: string): GitResult {
  const add = run(['add', '-A'], repoPath);
  if (!add.ok) {
    return add;
  }
  return run(['commit', '-m', message], repoPath);
}

export function gitRebaseAbort(repoPath: string): void {
  run(['rebase', '--abort'], repoPath);
}

/**
 * Push, and on rejection do exactly one pull --rebase + retry (spec §4.2
 * step 5). On repeated failure, abort the rebase so the working tree is left
 * clean and the local commit is retried on the next scheduled run.
 */
export function gitPushWithRetry(repoPath: string): GitResult {
  const firstPush = run(['push'], repoPath);
  if (firstPush.ok) {
    return firstPush;
  }

  const pull = gitPullRebase(repoPath);
  if (!pull.ok) {
    gitRebaseAbort(repoPath);
    return pull;
  }

  const secondPush = run(['push'], repoPath);
  if (!secondPush.ok) {
    gitRebaseAbort(repoPath);
  }
  return secondPush;
}
```

- [ ] **Step 2: Manual verification against a scratch repo**

Run these commands from the project root. They create a throwaway "remote"
plus two clones in `/tmp`, then a temporary script exercises every function.

```bash
mkdir -p /tmp/biji-git-ops-check && cd /tmp/biji-git-ops-check
git init --bare remote.git
cd -
```

Create `tmp_test_git_ops.ts` at the project root:

```typescript
// tmp_test_git_ops.ts — run with `npx tsx tmp_test_git_ops.ts`, then delete.
import { execFileSync } from 'child_process';
import { writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { gitClone, gitPullRebase, gitCommitAll, gitPushWithRetry, isGitRepo, gitHasChanges } from './src/core/git_ops.js';

const base = '/tmp/biji-git-ops-check';
const remote = join(base, 'remote.git');
const cloneA = join(base, 'clone-a');
const cloneB = join(base, 'clone-b');

console.log('isGitRepo(cloneA) before clone:', isGitRepo(cloneA)); // expect false
console.log('gitClone -> cloneA:', gitClone(remote, cloneA)); // expect { ok: true }
console.log('isGitRepo(cloneA) after clone:', isGitRepo(cloneA)); // expect true

writeFileSync(join(cloneA, 'README.md'), 'hello\n');
console.log('gitHasChanges (untracked file):', gitHasChanges(cloneA)); // expect true
console.log('gitCommitAll:', gitCommitAll(cloneA, 'init')); // expect { ok: true }
console.log('gitHasChanges after commit:', gitHasChanges(cloneA)); // expect false
console.log('gitPushWithRetry (first push, empty remote):', gitPushWithRetry(cloneA)); // expect { ok: true }

console.log('gitClone -> cloneB:', gitClone(remote, cloneB)); // expect { ok: true }

// cloneB pushes a change first...
appendFileSync(join(cloneB, 'README.md'), 'from b\n');
console.log('cloneB commit:', gitCommitAll(cloneB, 'b change')); // expect { ok: true }
console.log('cloneB push:', gitPushWithRetry(cloneB)); // expect { ok: true }

// ...then cloneA pushes a non-conflicting change and must rebase-retry.
writeFileSync(join(cloneA, 'NOTES.md'), 'from a\n');
console.log('cloneA commit:', gitCommitAll(cloneA, 'a change')); // expect { ok: true }
console.log('cloneA push (rejected, then rebase-retry succeeds):', gitPushWithRetry(cloneA)); // expect { ok: true }

console.log('gitPullRebase(cloneB) sees both changes:', gitPullRebase(cloneB)); // expect { ok: true }
```

Run:

```bash
npx tsx tmp_test_git_ops.ts
```

Expected: every line prints `{ ok: true }` (or `true`/`false` as commented), with no thrown exceptions. The final `gitPullRebase(cloneB)` succeeding confirms the rebase-retry in `gitPushWithRetry(cloneA)` correctly merged both clones' changes.

Clean up:

```bash
rm tmp_test_git_ops.ts
rm -rf /tmp/biji-git-ops-check
```

- [ ] **Step 3: Commit**

```bash
git add src/core/git_ops.ts
git commit -m "feat: add git CLI wrappers for biji sync"
```

---

## Task 7: Email failure/recovery notifications

**Files:**
- Create: `src/core/notify_email.ts`

Implements spec §4.6. Manual-tested per spec §7, using nodemailer's built-in
Ethereal test-account support so no real SMTP credentials are needed.

- [ ] **Step 1: Implement `sendStatusEmail`**

Create `src/core/notify_email.ts`:

```typescript
// Sends biji sync failure/recovery emails via SMTP (spec §4.6).
import nodemailer from 'nodemailer';
import type { SmtpConfig } from '../types/sync.js';

export async function sendStatusEmail(smtp: SmtpConfig, to: string, subject: string, text: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  await transporter.sendMail({ from: smtp.from, to, subject, text });
}
```

- [ ] **Step 2: Manual verification with a throwaway Ethereal test account**

Create `tmp_test_email.ts` at the project root:

```typescript
// tmp_test_email.ts — run with `npx tsx tmp_test_email.ts`, then delete.
import nodemailer from 'nodemailer';
import { sendStatusEmail } from './src/core/notify_email.js';

const testAccount = await nodemailer.createTestAccount();

await sendStatusEmail(
  {
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    user: testAccount.user,
    pass: testAccount.pass,
    from: testAccount.user,
  },
  testAccount.user,
  'biji sync: 测试邮件',
  '这是一封测试邮件，用于验证 sendStatusEmail 是否正常工作。'
);

console.log('✓ sendStatusEmail resolved without throwing — SMTP send path works.');
```

Run:

```bash
npx tsx tmp_test_email.ts
```

Expected: prints `✓ sendStatusEmail resolved without throwing — SMTP send path works.` with no errors. (The Ethereal account is throwaway and the email is never actually delivered anywhere — this only verifies the nodemailer call path.)

Clean up:

```bash
rm tmp_test_email.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/core/notify_email.ts
git commit -m "feat: add SMTP failure/recovery email notifications"
```

---

## Task 8: Config additions

**Files:**
- Modify: `src/config/index.ts`
- Modify: `src/core/config.ts`

Implements spec §4.3 (`syncRepoUrl`, `syncRepoPath`) and §4.6 (`notifyEmail`, `smtp`).

- [ ] **Step 1: Add the new exports to `src/config/index.ts`**

In `src/config/index.ts`, update the `BijiConfig` interface (around line 10):

```typescript
/** 配置文件接口 */
interface BijiConfig {
  outputDir?: string;
  assetsDir?: string;
  syncRepoUrl?: string;
  syncRepoPath?: string;
  notifyEmail?: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
  };
}
```

Then, after the existing `CACHE_DIR`/`NOTES_CACHE_DIR`/`USER_CACHE_FILE` exports (around line 105), add a new section:

```typescript
// ==================== 同步配置 (biji sync) ====================

/** 同步仓库的 git 远程地址，例如 git@github.com:yourname/obsidian-vault.git */
export const SYNC_REPO_URL: string | undefined = process.env.BIJI_SYNC_REPO_URL || userConfig.syncRepoUrl;

/** 同步仓库的本地克隆路径，默认 ~/.biji-cli/vault-sync */
export const SYNC_REPO_PATH: string =
  process.env.BIJI_SYNC_REPO_PATH || userConfig.syncRepoPath || join(CACHE_DIR, 'vault-sync');

/** 失败/恢复通知邮件的收件地址 */
export const NOTIFY_EMAIL: string | undefined = process.env.BIJI_NOTIFY_EMAIL || userConfig.notifyEmail;

/** SMTP 发信配置，仅在 idle Mac 本地的 ~/.bijirc.json 中设置（不进入同步仓库） */
export const SMTP_CONFIG: BijiConfig['smtp'] | undefined = userConfig.smtp;
```

- [ ] **Step 2: Extend `src/core/config.ts`**

In `src/core/config.ts`, update the `BijiConfig` interface (lines 7-10):

```typescript
/** 配置文件接口 */
interface BijiConfig {
  outputDir?: string;
  assetsDir?: string;
  syncRepoUrl?: string;
  syncRepoPath?: string;
  notifyEmail?: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
  };
}
```

Update `showConfig()` (lines 18-36) to also print the new keys:

```typescript
export function showConfig() {
  console.log('\n📝 当前配置:');
  console.log(`\n配置文件位置: ${USER_CONFIG_PATH}`);

  if (existsSync(USER_CONFIG_PATH)) {
    try {
      const config = JSON.parse(readFileSync(USER_CONFIG_PATH, 'utf-8'));
      console.log('\n自定义配置:');
      console.log(`  - 输出目录: ${config.outputDir || '未设置'}`);
      console.log(`  - Assets 目录: ${config.assetsDir || '未设置'}`);
      console.log(`  - 同步仓库 URL: ${config.syncRepoUrl || '未设置'}`);
      console.log(`  - 同步仓库路径: ${config.syncRepoPath || join(homedir(), '.biji-cli', 'vault-sync') + ' (默认)'}`);
      console.log(`  - 失败通知邮箱: ${config.notifyEmail || '未设置'}`);
      console.log(`  - SMTP 配置: ${config.smtp ? '已设置' : '未设置'}`);
    } catch (error) {
      console.log('\n⚠️  配置文件格式错误');
    }
  } else {
    console.log('\n未找到自定义配置文件，将使用默认配置:');
    console.log(`  - 输出目录: ${join(homedir(), 'Documents/A第二大脑')}`);
    console.log(`  - Assets 目录: {输出目录}/Assets`);
    console.log(`  - 同步仓库路径: ${join(homedir(), '.biji-cli', 'vault-sync')}`);
    console.log(`  - 同步仓库 URL / 失败通知邮箱 / SMTP: 未设置`);
  }
}
```

Update `setConfig()` (lines 41-77) to accept and persist the new keys:

```typescript
export async function setConfig(options: {
  outputDir?: string;
  assetsDir?: string;
  syncRepoUrl?: string;
  syncRepoPath?: string;
  notifyEmail?: string;
}) {
  // 读取现有配置
  let config: BijiConfig = {};
  if (existsSync(USER_CONFIG_PATH)) {
    try {
      config = JSON.parse(readFileSync(USER_CONFIG_PATH, 'utf-8'));
    } catch (error) {
      console.log('⚠️  现有配置文件格式错误，将创建新配置');
      config = {};
    }
  }

  // 更新配置
  if (options.outputDir) {
    config.outputDir = options.outputDir;
  }
  if (options.assetsDir) {
    config.assetsDir = options.assetsDir;
  }
  if (options.syncRepoUrl) {
    config.syncRepoUrl = options.syncRepoUrl;
  }
  if (options.syncRepoPath) {
    config.syncRepoPath = options.syncRepoPath;
  }
  if (options.notifyEmail) {
    config.notifyEmail = options.notifyEmail;
  }

  // 写入配置文件
  try {
    writeFileSync(USER_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    console.log('\n✓ 配置已保存！');
    console.log(`\n配置文件位置: ${USER_CONFIG_PATH}`);
    console.log('\n当前配置:');
    console.log(`  - 输出目录: ${config.outputDir || '未设置'}`);
    console.log(`  - Assets 目录: ${config.assetsDir || '未设置'}`);
    console.log(`  - 同步仓库 URL: ${config.syncRepoUrl || '未设置'}`);
    console.log(`  - 同步仓库路径: ${config.syncRepoPath || '未设置（默认 ~/.biji-cli/vault-sync）'}`);
    console.log(`  - 失败通知邮箱: ${config.notifyEmail || '未设置'}`);
    console.log('\n提示: 修改配置后无需重启，立即生效');
    console.log('提示: smtp 配置（SMTP 发信凭据）需要直接编辑 ~/.bijirc.json，添加 "smtp": { "host", "port", "secure", "user", "pass", "from" } 字段');
  } catch (error) {
    console.error('\n❌ 保存配置失败:', error);
    process.exit(1);
  }
}
```

- [ ] **Step 3: Build to verify type-correctness**

Run: `npm run build`
Expected: compiles with no errors (no `dist/**/*.test.js` should be emitted, since Task 1 excluded `*.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/config/index.ts src/core/config.ts
git commit -m "feat: add syncRepoUrl/syncRepoPath/notifyEmail/smtp config options"
```

---

## Task 9: `getNewNotes` — paginated notes-list fetch

**Files:**
- Create: `src/core/get_new_notes.ts`

Implements spec §4.1. Reuses the `/voicenotes/web/notes?sort=create_desc`
interception pattern from `src/core/get_latest_note.ts`, extended to loop
via `needsMorePages`/`selectNewNotes` from Task 4, triggering the page's own
"load more" by scrolling.

- [ ] **Step 1: Implement `getNewNotes`**

Create `src/core/get_new_notes.ts`:

```typescript
// Fetch all biji notes created after sinceTimestamp, paginating via the
// page's own "load more" infinite-scroll requests (spec §4.1).
import type { Page } from 'puppeteer-core';
import { withLoggedInPage } from '@asd345gh/mcpkit/browser';
import { needsMorePages, selectNewNotes } from './notes_list.js';
import type { NoteListItem } from '../types/sync.js';

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!predicate() && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Scroll the page's main scrollable container to its bottom to trigger the
 * next "load more" request. Picks the element with the most remaining
 * scroll distance (scrollHeight - clientHeight), falling back to the
 * document itself if nothing else is scrollable.
 */
async function triggerLoadMore(page: Page): Promise<void> {
  await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('*'));
    let target: HTMLElement = (document.scrollingElement as HTMLElement) || document.documentElement;
    let maxScrollable = target.scrollHeight - target.clientHeight;

    for (const el of elements) {
      const overflowY = getComputedStyle(el).overflowY;
      const scrollable = el.scrollHeight - el.clientHeight;
      if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && scrollable > maxScrollable) {
        target = el;
        maxScrollable = scrollable;
      }
    }

    target.scrollTo(0, target.scrollHeight);
    target.dispatchEvent(new Event('scroll', { bubbles: true }));
    window.dispatchEvent(new Event('scroll'));
  });
}

export async function getNewNotes(sinceTimestamp: string): Promise<NoteListItem[]> {
  return await withLoggedInPage(
    {
      appName: 'biji-cli',
      headless: true,
      homeUrl: 'https://www.biji.com/note',
      loginUrlPatterns: ['/login', '/signin'],
    },
    async (page: Page) => {
      let accumulated: NoteListItem[] = [];
      let hasMore = false;
      let pageResolved = false;
      let pageCount = 0;

      const responseHandler = async (response: any) => {
        const url = response.url();
        if (!url.includes('/voicenotes/web/notes') || !url.includes('sort=create_desc')) {
          return;
        }
        try {
          const contentType = response.headers()['content-type'] || '';
          if (!contentType.includes('application/json')) {
            return;
          }
          const data = await response.json();
          if (data && data.c && Array.isArray(data.c.list)) {
            accumulated = accumulated.concat(data.c.list);
            hasMore = !!data.c.has_more;
            pageResolved = true;
            pageCount++;
            console.log(`📄 拦截到笔记列表第 ${pageCount} 页，累计 ${accumulated.length} 条，has_more=${hasMore}`);
          }
        } catch (e: any) {
          if (!e.message.includes('Could not load response body')) {
            console.error('解析笔记列表响应失败:', e.message);
          }
        }
      };

      page.on('response', responseHandler);

      try {
        await page.setViewport({ width: 1280, height: 2000 });
        await page.goto('https://www.biji.com/note', { waitUntil: 'networkidle0', timeout: 30000 });
        await waitFor(() => pageResolved, 15000);

        if (!pageResolved) {
          throw new Error('未能获取到笔记列表，请确保已登录');
        }

        while (needsMorePages(accumulated, sinceTimestamp, hasMore)) {
          pageResolved = false;
          await triggerLoadMore(page);
          await waitFor(() => pageResolved, 15000);
          if (!pageResolved) {
            // No further page arrived (e.g. reached the end of the list);
            // stop instead of looping forever.
            break;
          }
        }

        return selectNewNotes(accumulated, sinceTimestamp);
      } finally {
        page.off('response', responseHandler);
      }
    }
  );
}
```

- [ ] **Step 2: Manual verification against the real account**

Create `tmp_test_get_new_notes.ts` at the project root:

```typescript
// tmp_test_get_new_notes.ts — run with `npx tsx tmp_test_get_new_notes.ts`, then delete.
import { getNewNotes } from './src/core/get_new_notes.js';

// A recent cutoff: should resolve quickly with zero or one "page" logged
// and a small result count (no pagination needed for normal hourly usage).
const recent = await getNewNotes('2026-06-10 00:00:00');
console.log(`最近一天内的新笔记数: ${recent.length}`);
console.log(recent.map((n) => ({ id: n.note_id || n.id, created_at: n.created_at, title: n.title })));
```

Run:

```bash
npx tsx tmp_test_get_new_notes.ts
```

Expected: console shows `📄 拦截到笔记列表第 1 页，累计 10 条，has_more=true` (or similar), then prints the recent-notes count and list — items should all have `created_at > '2026-06-10 00:00:00'`.

**If you want to confirm pagination specifically**, edit the script to use an
older `sinceTimestamp` (e.g. one month ago) and re-run. Watch for additional
`📄 拦截到笔记列表第 2 页...` lines — once you see the page count increase
past 1, pagination/scrolling is confirmed working and you can Ctrl+C; you
don't need to wait for the full result. If the page count never goes past 1
even though `accumulated[accumulated.length - 1].created_at` is still newer
than `sinceTimestamp`, temporarily change `headless: true` to `headless:
false` in `getNewNotes`, re-run, and use the opened browser's DevTools to
identify the actual scroll container, then adjust `triggerLoadMore`'s
selection logic accordingly.

Clean up:

```bash
rm tmp_test_get_new_notes.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/core/get_new_notes.ts
git commit -m "feat: add getNewNotes with deletion-safe pagination"
```

---

## Task 10: `runSync` orchestration

**Files:**
- Create: `src/core/sync_notes.ts`

Implements spec §4.2 end-to-end: first-run initialization, fetching new
notes, saving them into `<syncRepoPath>/inbox/` with images in
`<syncRepoPath>/Assets/`, updating state/status files, git commit/push, the
local log, and email notifications on status transitions or git failures.

- [ ] **Step 1: Implement `runSync`**

Create `src/core/sync_notes.ts`:

```typescript
// Orchestrates `biji sync` (spec §4.2): pulls the vault repo, fetches new
// notes, updates state/status files, commits/pushes, and sends email
// notifications on status transitions or git failures.
import { mkdirSync, appendFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { saveNoteAsMarkdown } from './get_note_detail.js';
import { getNewNotes } from './get_new_notes.js';
import { getItemId } from './notes_list.js';
import { computeNextState, renderStatusMarkdown, loadState, saveState } from './sync_state.js';
import { gitClone, gitPullRebase, gitCommitAll, gitPushWithRetry, isGitRepo } from './git_ops.js';
import { sendStatusEmail } from './notify_email.js';
import { formatTimestamp } from '../utils/time.js';
import type { SyncState, SyncRunResult, SmtpConfig } from '../types/sync.js';

export interface SyncOptions {
  syncRepoUrl: string;
  syncRepoPath: string;
  notifyEmail?: string;
  smtp?: SmtpConfig;
}

const STATE_FILE_NAME = '.biji-sync-state.json';
const STATUS_FILE_NAME = '_biji-sync-status.md';
const SYNC_LOG_PATH = join(homedir(), '.biji-cli', 'sync.log');

function log(message: string): void {
  const line = `[${formatTimestamp(new Date())}] ${message}`;
  mkdirSync(join(homedir(), '.biji-cli'), { recursive: true });
  appendFileSync(SYNC_LOG_PATH, line + '\n', 'utf-8');
  console.log(line);
}

async function notify(options: SyncOptions, subject: string, body: string): Promise<void> {
  if (!options.notifyEmail || !options.smtp) {
    log(`(未配置邮件通知，跳过通知) ${subject}: ${body}`);
    return;
  }
  try {
    await sendStatusEmail(options.smtp, options.notifyEmail, subject, body);
  } catch (e: any) {
    log(`发送通知邮件失败: ${e.message}`);
  }
}

export async function runSync(options: SyncOptions): Promise<void> {
  const { syncRepoPath, syncRepoUrl } = options;

  if (!isGitRepo(syncRepoPath)) {
    log(`同步仓库不存在，正在克隆 ${syncRepoUrl} -> ${syncRepoPath}`);
    const clone = gitClone(syncRepoUrl, syncRepoPath);
    if (!clone.ok) {
      log(`克隆失败: ${clone.error}`);
      await notify(options, 'biji sync: 初始化失败', `克隆同步仓库失败:\n${clone.error}`);
      process.exitCode = 1;
      return;
    }
  }

  const pull = gitPullRebase(syncRepoPath);
  if (!pull.ok) {
    log(`git pull --rebase 失败: ${pull.error}`);
    await notify(options, 'biji sync: git pull 失败', `git pull --rebase 失败:\n${pull.error}`);
    process.exitCode = 1;
    return;
  }

  const stateFile = join(syncRepoPath, STATE_FILE_NAME);
  const statusFile = join(syncRepoPath, STATUS_FILE_NAME);
  const now = formatTimestamp(new Date());

  const current = loadState(stateFile);

  if (!current) {
    const initialState: SyncState = {
      lastSyncedAt: now,
      lastStatus: 'ok',
      lastErrorMessage: null,
      lastChangedAt: now,
    };
    saveState(stateFile, initialState);
    writeFileSync(statusFile, renderStatusMarkdown(initialState), 'utf-8');

    const commit = gitCommitAll(syncRepoPath, 'biji sync: initialize');
    if (!commit.ok) {
      log(`初始化提交失败: ${commit.error}`);
      await notify(options, 'biji sync: 初始化失败', `初始化提交失败:\n${commit.error}`);
      process.exitCode = 1;
      return;
    }

    const push = gitPushWithRetry(syncRepoPath);
    if (!push.ok) {
      log(`初始化推送失败: ${push.error}`);
      await notify(options, 'biji sync: git push 失败', `初始化推送失败:\n${push.error}`);
      process.exitCode = 1;
      return;
    }

    log(`首次运行：已初始化同步状态 (lastSyncedAt=${now})，本次不拉取笔记`);
    return;
  }

  let result: SyncRunResult;
  try {
    const notes = await getNewNotes(current.lastSyncedAt);
    for (const note of notes) {
      await saveNoteAsMarkdown({
        noteId: getItemId(note),
        outputDir: join(syncRepoPath, 'inbox'),
        assetsDir: join(syncRepoPath, 'Assets'),
        imageFormat: 'obsidian',
        isOriginal: true,
      });
    }
    result = { status: 'ok', errorMessage: null, syncedNotes: notes };
  } catch (e: any) {
    result = { status: 'error', errorMessage: e.message, syncedNotes: [] };
  }

  const { state: newState, changed } = computeNextState(current, result, now);

  log(
    `同步完成: status=${result.status} 新笔记=${result.syncedNotes.length}` +
      (result.errorMessage ? ` error=${result.errorMessage}` : '')
  );

  if (changed) {
    saveState(stateFile, newState);
    writeFileSync(statusFile, renderStatusMarkdown(newState), 'utf-8');

    const n = result.syncedNotes.length;
    const commitMessage = n > 0 ? `biji sync: ${n} new note(s)` : 'biji sync: status update';
    const commit = gitCommitAll(syncRepoPath, commitMessage);
    if (!commit.ok) {
      log(`提交失败: ${commit.error}`);
      await notify(options, 'biji sync: 提交失败', `git commit 失败:\n${commit.error}`);
      process.exitCode = 1;
      return;
    }

    const push = gitPushWithRetry(syncRepoPath);
    if (!push.ok) {
      log(`推送失败: ${push.error}`);
      await notify(options, 'biji sync: git push 失败', `git push 失败（已尝试 rebase 重试）:\n${push.error}`);
      process.exitCode = 1;
      return;
    }
  }

  if (newState.lastStatus !== current.lastStatus) {
    if (newState.lastStatus === 'error') {
      await notify(options, 'biji sync: 出错', `biji sync 状态变为 error:\n${newState.lastErrorMessage}`);
    } else {
      await notify(options, 'biji sync: 已恢复', 'biji sync 已从 error 状态恢复为 ok。');
    }
  }
}
```

- [ ] **Step 2: Build to verify type-correctness**

Run: `npm run build`
Expected: compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/sync_notes.ts
git commit -m "feat: add runSync orchestration for biji sync"
```

---

## Task 11: CLI wiring — `biji sync` command

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Add imports**

In `src/cli.ts`, update the imports at the top:

```typescript
import { loginBiji } from './core/login.js';
import { checkLoginState } from './core/check_login.js';
import { saveNoteAsMarkdown } from './core/get_note_detail.js';
import { getLatestNoteAsMarkdown, getLatestOriginalNoteAsMarkdown } from './core/get_latest_note.js';
import { showConfig, setConfig, configWizard } from './core/config.js';
import { installSkill, checkSkillInstalled } from './core/install_skill.js';
import { runSync } from './core/sync_notes.js';
import { parseNoteIdFromUrl, isOriginalNoteUrl } from './utils/url.js';
import { OUTPUT_DIR, ASSETS_DIR, SYNC_REPO_URL, SYNC_REPO_PATH, NOTIFY_EMAIL, SMTP_CONFIG } from './config/index.js';
```

- [ ] **Step 2: Add the `sync` case**

In the `switch (command)` block, add a new case right before `case '--help':`:

```typescript
    case 'sync': {
      if (!SYNC_REPO_URL) {
        console.error('请先配置同步仓库地址 (syncRepoUrl)');
        console.log('用法: biji config set --sync-repo-url <git 仓库地址>');
        console.log('示例: biji config set --sync-repo-url git@github.com:yourname/obsidian-vault.git');
        process.exit(1);
      }

      await runSync({
        syncRepoUrl: SYNC_REPO_URL,
        syncRepoPath: SYNC_REPO_PATH,
        notifyEmail: NOTIFY_EMAIL,
        smtp: SMTP_CONFIG,
      });
      break;
    }

```

- [ ] **Step 3: Add `config set` flags for the new keys**

In the `subCommand === 'set'` branch, replace:

```typescript
      } else if (subCommand === 'set') {
        // biji config set --output-dir xxx --assets-dir yyy
        let outputDir: string | undefined;
        let assetsDir: string | undefined;

        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--output-dir' && args[i + 1]) {
            outputDir = args[i + 1];
            i++;
          } else if (args[i] === '--assets-dir' && args[i + 1]) {
            assetsDir = args[i + 1];
            i++;
          }
        }

        if (!outputDir && !assetsDir) {
          console.error('请提供要设置的配置项');
          console.log('用法: biji config set --output-dir <path> --assets-dir <path>');
          process.exit(1);
        }

        await setConfig({ outputDir, assetsDir });
```

with:

```typescript
      } else if (subCommand === 'set') {
        // biji config set --output-dir xxx --assets-dir yyy --sync-repo-url zzz
        let outputDir: string | undefined;
        let assetsDir: string | undefined;
        let syncRepoUrl: string | undefined;
        let syncRepoPath: string | undefined;
        let notifyEmail: string | undefined;

        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--output-dir' && args[i + 1]) {
            outputDir = args[i + 1];
            i++;
          } else if (args[i] === '--assets-dir' && args[i + 1]) {
            assetsDir = args[i + 1];
            i++;
          } else if (args[i] === '--sync-repo-url' && args[i + 1]) {
            syncRepoUrl = args[i + 1];
            i++;
          } else if (args[i] === '--sync-repo-path' && args[i + 1]) {
            syncRepoPath = args[i + 1];
            i++;
          } else if (args[i] === '--notify-email' && args[i + 1]) {
            notifyEmail = args[i + 1];
            i++;
          }
        }

        if (!outputDir && !assetsDir && !syncRepoUrl && !syncRepoPath && !notifyEmail) {
          console.error('请提供要设置的配置项');
          console.log('用法: biji config set --output-dir <path> --assets-dir <path> --sync-repo-url <url> --sync-repo-path <path> --notify-email <email>');
          process.exit(1);
        }

        await setConfig({ outputDir, assetsDir, syncRepoUrl, syncRepoPath, notifyEmail });
```

- [ ] **Step 4: Update the help text**

In the `default`/`--help`/`-h`/`help` case, update the `命令:` and `参数:`
sections. Replace:

```typescript
  biji get-latest [outputDir]         获取最新一篇笔记并保存
  biji get-latest-original [outputDir] 获取最新一篇原文笔记并保存

  biji config [show|set|wizard]      配置输出目录和图片目录
                                      show  - 显示当前配置
                                      set   - 设置配置项
                                      wizard- 交互式配置向导
```

with:

```typescript
  biji get-latest [outputDir]         获取最新一篇笔记并保存
  biji get-latest-original [outputDir] 获取最新一篇原文笔记并保存

  biji sync                           同步新笔记到 Obsidian vault 仓库（需先配置 syncRepoUrl）
                                      笔记保存到 <syncRepoPath>/inbox/，图片保存到 <syncRepoPath>/Assets/
                                      详见 README「同步到 Obsidian vault」一节

  biji config [show|set|wizard]      配置输出目录、图片目录和同步设置
                                      show  - 显示当前配置
                                      set   - 设置配置项
                                      wizard- 交互式配置向导
```

And in the `示例:` section, after the `# 设置输出目录` example, add:

```typescript
  # 配置同步仓库（用于 biji sync）
  biji config set --sync-repo-url git@github.com:yourname/obsidian-vault.git

  # 同步新笔记到 vault
  biji sync
```

- [ ] **Step 5: Build and smoke-test**

Run: `npm run build`
Expected: compiles with no errors.

Run: `npm run biji -- sync`
Expected (with no `syncRepoUrl` configured yet): prints the "请先配置同步仓库地址" error and the `biji config set --sync-repo-url ...` usage hint, then exits with status 1.

Run: `npm run biji -- --help`
Expected: help text includes the new `biji sync` line and the `--sync-repo-url` example.

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts
git commit -m "feat: add biji sync CLI command"
```

---

## Task 12: launchd templates for the idle Mac

**Files:**
- Create: `scripts/launchd/run-sync.sh`
- Create: `scripts/launchd/com.bijicli.sync.plist`

Implements spec §6. These are deployment templates for the idle Mac, not
part of the npm package build — `<USERNAME>` must be replaced with the idle
Mac's actual username (`whoami`) during setup.

- [ ] **Step 1: Create the wrapper script**

Create `scripts/launchd/run-sync.sh`:

```bash
#!/bin/bash
# Wrapper script for `biji sync`, run hourly via launchd on the idle Mac.
# Sets PATH so git/node/biji resolve under launchd's minimal environment
# (spec §6).

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

biji sync
```

- [ ] **Step 2: Create the LaunchAgent plist template**

Create `scripts/launchd/com.bijicli.sync.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bijicli.sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-l</string>
        <string>/Users/<USERNAME>/.biji-cli/run-sync.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/<USERNAME>/.biji-cli/sync.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/<USERNAME>/.biji-cli/sync.log</string>
</dict>
</plist>
```

- [ ] **Step 3: Make the wrapper script executable and commit**

```bash
chmod +x scripts/launchd/run-sync.sh
git add scripts/launchd/run-sync.sh scripts/launchd/com.bijicli.sync.plist
git commit -m "chore: add launchd templates for hourly biji sync"
```

---

## Task 13: README documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add `biji sync` to the command table**

In the `## 📋 命令速查` table, add a row after `biji get-latest-original`:

```markdown
| `biji sync` | 同步新笔记到 Obsidian vault 仓库（见下方「同步到 Obsidian vault」） |
```

- [ ] **Step 2: Document the new config keys**

In `## ⚙️ 配置文件详解` → `### 配置文件格式`, replace:

```json
{
  "outputDir": "~/Documents/MyNotes",
  "assetsDir": "~/Documents/MyNotes/Assets"
}
```

with:

```json
{
  "outputDir": "~/Documents/MyNotes",
  "assetsDir": "~/Documents/MyNotes/Assets",
  "syncRepoUrl": "git@github.com:yourname/obsidian-vault.git",
  "syncRepoPath": "~/.biji-cli/vault-sync",
  "notifyEmail": "you@example.com",
  "smtp": {
    "host": "smtp.example.com",
    "port": 465,
    "secure": true,
    "user": "you@example.com",
    "pass": "app-password",
    "from": "you@example.com"
  }
}
```

Directly below that JSON block, add:

```markdown
**注意**：`syncRepoUrl`/`syncRepoPath`/`notifyEmail` 可通过 `biji config set` 设置；`smtp` 字段较复杂（嵌套对象），需要直接编辑 `~/.bijirc.json`。`smtp` 仅用于 `biji sync` 的失败/恢复通知邮件，建议使用专用的低权限凭据（例如单独 Gmail 账号的「应用专用密码」），不要使用主账号密码。
```

- [ ] **Step 3: Add a new "同步到 Obsidian vault" section**

Add a new `##` section before `## ❓ 常见问题`:

```markdown
## 🔁 同步到 Obsidian vault（biji sync）

`biji sync` 在一台常驻、闲置的 Mac 上运行，定期把新的 biji 笔记同步到一个
独立的 Obsidian vault git 仓库（通过 GitHub 中转，主 Mac 上的 Obsidian Git
插件再自动拉取）。详见设计文档：
`docs/superpowers/specs/2026-06-11-biji-notes-sync-design.md`。

### 配置

```bash
biji login
biji config set --sync-repo-url git@github.com:yourname/obsidian-vault.git
# 可选，默认 ~/.biji-cli/vault-sync
biji config set --sync-repo-path ~/.biji-cli/vault-sync
# 可选，配置失败/恢复通知邮箱
biji config set --notify-email you@example.com
```

如需邮件通知，编辑 `~/.bijirc.json`，添加 `smtp` 字段（见上方配置文件格式）。

### 首次运行

```bash
biji sync
```

首次运行会克隆 `syncRepoPath`（如不存在）、初始化
`.biji-sync-state.json` / `_biji-sync-status.md` 并提交推送，但**不会**拉取
任何历史笔记 —— 只有此后新建的笔记才会被同步。

### 同步内容

- 笔记 Markdown 文件 → `<syncRepoPath>/inbox/`（待整理区）
- 图片 → `<syncRepoPath>/Assets/`（与 vault 其余部分共用）
- 状态文件 `.biji-sync-state.json` 和状态说明 `_biji-sync-status.md`

### 定时运行（launchd）

在闲置 Mac 上：

```bash
mkdir -p ~/.biji-cli
cp scripts/launchd/run-sync.sh ~/.biji-cli/run-sync.sh
chmod +x ~/.biji-cli/run-sync.sh

# 将模板中的 <USERNAME> 替换为 `whoami` 的输出
sed "s/<USERNAME>/$(whoami)/g" scripts/launchd/com.bijicli.sync.plist > ~/Library/LaunchAgents/com.bijicli.sync.plist

launchctl load ~/Library/LaunchAgents/com.bijicli.sync.plist
```

每小时整点运行一次。日志和邮件通知详见
`docs/superpowers/specs/2026-06-11-biji-notes-sync-design.md` 第 5、6 节。
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document biji sync command and configuration"
```

---

## Task 14: End-to-end manual dry run

**Files:** none (verification only, per spec §7)

- [ ] **Step 1: Set up a scratch "vault" repo**

```bash
mkdir -p /tmp/biji-sync-e2e
cd /tmp/biji-sync-e2e
git init --bare remote.git
git clone remote.git vault-sync
cd vault-sync
git commit --allow-empty -m "init" 
git push
cd -
```

- [ ] **Step 2: Point biji-cli at the scratch repo and run the first sync**

```bash
cd /Users/ghh/Documents/编程/项目/get-info-from-biji
BIJI_SYNC_REPO_URL=/tmp/biji-sync-e2e/remote.git BIJI_SYNC_REPO_PATH=/tmp/biji-sync-e2e/vault-sync npm run biji -- sync
```

Expected: logs "首次运行：已初始化同步状态..."; `/tmp/biji-sync-e2e/vault-sync` now
contains `.biji-sync-state.json` (with today's date as `lastSyncedAt`,
`lastStatus: "ok"`) and `_biji-sync-status.md` (✅ ok), both committed and
pushed to `remote.git`.

- [ ] **Step 3: Run a second sync and verify the no-op-commit path**

```bash
BIJI_SYNC_REPO_URL=/tmp/biji-sync-e2e/remote.git BIJI_SYNC_REPO_PATH=/tmp/biji-sync-e2e/vault-sync npm run biji -- sync
```

Expected: if no notes were created on biji.com since the first run's
`lastSyncedAt`, `result.syncedNotes` is empty, `lastSyncedAt`/`lastStatus`/
`lastErrorMessage` are unchanged, so `changed === false` — the log shows
"同步完成: status=ok 新笔记=0", and `git -C /tmp/biji-sync-e2e/vault-sync status`
shows a clean working tree (no new commit).

If you want to also verify the "new notes" path without waiting for a real
new note, temporarily edit `/tmp/biji-sync-e2e/vault-sync/.biji-sync-state.json`
to set `lastSyncedAt` to a date far in the past (e.g. `"2020-01-01 00:00:00"`),
then re-run the same command. Expected: `inbox/` and `Assets/` are created
under `/tmp/biji-sync-e2e/vault-sync` with the synced notes/images,
`.biji-sync-state.json`'s `lastSyncedAt` advances to the newest synced note's
`created_at`, `_biji-sync-status.md` still shows ✅ ok, and a commit
`"biji sync: <n> new note(s)"` is pushed.

- [ ] **Step 4: Verify the rebase-retry-on-push-rejection path**

```bash
# Second clone simulating a concurrent writer
git clone /tmp/biji-sync-e2e/remote.git /tmp/biji-sync-e2e/vault-sync-2
cd /tmp/biji-sync-e2e/vault-sync-2
echo "concurrent change" >> README.md 2>/dev/null || echo "concurrent change" > concurrent.md
git add -A && git commit -m "concurrent change" && git push
cd -

# Now run biji sync against vault-sync (which is now behind remote) with a
# past lastSyncedAt so it has something new to commit
cd /Users/ghh/Documents/编程/项目/get-info-from-biji
BIJI_SYNC_REPO_URL=/tmp/biji-sync-e2e/remote.git BIJI_SYNC_REPO_PATH=/tmp/biji-sync-e2e/vault-sync npm run biji -- sync
```

Expected: `gitPushWithRetry` hits a rejection on the first push (remote has
the concurrent commit), performs `git pull --rebase`, and the second push
succeeds — `git -C /tmp/biji-sync-e2e/vault-sync log --oneline -5` shows both
the concurrent commit and biji sync's commit, and `git -C
/tmp/biji-sync-e2e/vault-sync-2 pull` (after `cd
/tmp/biji-sync-e2e/vault-sync-2`) shows biji sync's changes arriving.

- [ ] **Step 5: Clean up**

```bash
rm -rf /tmp/biji-sync-e2e
```

No commit for this task — it's verification only. If any step reveals a bug,
fix it in the relevant earlier task's file and re-run from Step 1.

---

## Self-Review

**1. Spec coverage:**
- §2 decisions table: idle Mac / hourly / `isOriginal: true` / `getNewNotes` pagination / `inbox`+`Assets` layout / git relay / state file / status note + log + email / no encryption / launchd — all covered (Tasks 4, 9, 10, 11, 12).
- §3 architecture/data flow (pull → getNewNotes → saveNoteAsMarkdown → state/status update → commit/push) — Task 10 (`runSync`) implements exactly these 5 steps.
- §4.1 `getNewNotes` (pagination, deletion-safe stop, oldest-first, `note_id || id`) — Task 4 (pure logic) + Task 9 (browser orchestration).
- §4.2 `biji sync` (first-run init, 7-step run, stateChanged, commit messages, rebase-retry, log, transition emails) — Task 10.
- §4.3 config (`syncRepoUrl`, `syncRepoPath`, inbox/Assets split) — Task 8, Task 10 (`saveNoteAsMarkdown` call with explicit `assetsDir`).
- §4.4 state file shape — Task 5 (`SyncState` type + `loadState`/`saveState`).
- §4.5 status note templates — Task 5 (`renderStatusMarkdown`).
- §4.6 email notifications + config — Task 7, Task 8, Task 10.
- §5 failure handling/visibility — Task 10 (`notify` calls at every failure point + transition check).
- §6 scheduling — Task 12 (launchd templates), Task 13 (README setup steps).
- §7 testing approach — Tasks 2/4/5 (Vitest for pure logic), Tasks 6/7/9 (manual scripts), Task 14 (e2e dry run).
- §8 out of scope — correctly not addressed by this plan.

**2. Placeholder scan:** No "TBD"/"TODO"/"implement later" in any task. The only `<USERNAME>`/`<syncRepoPath>` style placeholders are in deployment templates (Task 12's `.plist`) and documentation (Task 13's README), which are inherently machine-specific — Task 13 gives the exact `sed` command to fill them in.

**3. Type consistency:**
- `NoteListItem`, `SyncState`, `SyncRunResult`, `SmtpConfig` (Task 3) are used identically across `notes_list.ts` (Task 4), `sync_state.ts` (Task 5), `get_new_notes.ts` (Task 9), and `sync_notes.ts` (Task 10).
- `getItemId`, `needsMorePages`, `selectNewNotes`, `computeLastSyncedAt` (Task 4) are imported with matching names/signatures in Task 5 (`computeLastSyncedAt`), Task 9 (`needsMorePages`, `selectNewNotes`), and Task 10 (`getItemId`).
- `computeNextState`, `renderStatusMarkdown`, `loadState`, `saveState` (Task 5) are imported with matching signatures in Task 10.
- `GitResult`, `isGitRepo`, `gitClone`, `gitPullRebase`, `gitCommitAll`, `gitPushWithRetry` (Task 6) match their usage in Task 10.
- `sendStatusEmail(smtp, to, subject, text)` (Task 7) matches its usage in Task 10's `notify()`.
- `runSync(options: SyncOptions)` (Task 10) matches its usage in Task 11's CLI wiring, including the `SmtpConfig | undefined` type for `SMTP_CONFIG` from Task 8.
- `saveNoteAsMarkdown({ noteId, outputDir, assetsDir, imageFormat, isOriginal })` in Task 10 matches the existing `SaveMarkdownOptions` interface in `src/core/get_note_detail.ts` — `assetsDir: <syncRepoPath>/Assets` is passed explicitly, satisfying the user's correction that images must NOT default to `<syncRepoPath>/inbox/Assets`.
