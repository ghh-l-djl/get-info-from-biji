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
