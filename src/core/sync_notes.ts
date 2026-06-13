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
