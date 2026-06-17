// Git CLI wrappers for biji sync. Each function shells out to `git` and
// returns a result object instead of throwing (except gitHasChanges, which
// throws, and gitRebaseAbort, which returns void), so sync_notes.ts can log
// and email failures without a try/catch around every call.
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export interface GitResult {
  ok: boolean;
  error?: string;
}

// Five minute timeout + GIT_TERMINAL_PROMPT=0 so git has enough time to clone
// larger private vaults while still failing instead of hanging forever.
const DEFAULT_GIT_TIMEOUT_MS = 300_000;

export function getGitTimeoutMs(): number {
  const configured = Number(process.env.BIJI_GIT_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_GIT_TIMEOUT_MS;
}

function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
  };
}

function run(args: string[], cwd?: string): GitResult {
  try {
    execFileSync('git', args, {
      cwd,
      stdio: 'pipe',
      timeout: getGitTimeoutMs(),
      env: gitEnv(),
    });
    return { ok: true };
  } catch (e: any) {
    // Empty Buffers are truthy, and some git failures report on stdout,
    // so check both streams for non-empty output before falling back.
    const stderr = e.stderr ? e.stderr.toString().trim() : '';
    const stdout = e.stdout ? e.stdout.toString().trim() : '';
    const details = [stderr, stdout, e.message ? String(e.message) : ''].filter(Boolean);
    const message = details.join('\n');
    return { ok: false, error: message };
  }
}

/** True if <repoPath>/.git exists (i.e. repoPath is already a git checkout). */
export function isGitRepo(repoPath: string): boolean {
  return existsSync(join(repoPath, '.git'));
}

export function gitPullRebase(repoPath: string): GitResult {
  return run(['pull', '--rebase', '--autostash'], repoPath);
}

/**
 * True if there are staged, unstaged, or untracked changes.
 *
 * @throws if `git status` itself fails (e.g. repoPath is not a git
 * repository) — unlike the other functions here, this does not return a
 * GitResult, so callers must wrap it.
 */
export function gitHasChanges(repoPath: string): boolean {
  const out = execFileSync('git', ['status', '--porcelain'], {
    cwd: repoPath,
    timeout: getGitTimeoutMs(),
    env: gitEnv(),
  }).toString();
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
    return {
      ok: false,
      error: `push failed: ${firstPush.error}; recovery pull --rebase also failed: ${pull.error}`,
    };
  }

  const secondPush = run(['push'], repoPath);
  if (!secondPush.ok) {
    // Defensive only: the pull above succeeded, so no rebase should be in
    // progress here — this abort is a harmless no-op safety net. The primary
    // cleanup path is the !pull.ok branch above.
    gitRebaseAbort(repoPath);
  }
  return secondPush;
}
