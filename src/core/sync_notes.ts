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
import { getGitTimeoutMs, gitPullRebase, gitCommitAll, gitPushWithRetry, isGitRepo } from './git_ops.js';
import { sendStatusEmail } from './notify_email.js';
import { formatTimestamp } from '../utils/time.js';
import type { SyncState, SyncRunResult, SmtpConfig } from '../types/sync.js';

export interface SyncOptions {
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
  const { syncRepoPath } = options;

  if (!isGitRepo(syncRepoPath)) {
    const cloneCmd = `git clone <你的 Obsidian vault 仓库地址> ${syncRepoPath}`;
    const message =
      `同步仓库 ${syncRepoPath} 不存在，biji sync 不会自动 clone。\n\n` +
      `${syncRepoPath} 是 biji sync 读写的本地仓库路径（来自 syncRepoPath 配置，` +
      `默认 ~/.biji-cli/vault-sync）。请手动执行：\n\n` +
      `  ${cloneCmd}\n\n` +
      `如果想把仓库 clone 到别的目录，clone 完成后需要用绝对路径配置 syncRepoPath，` +
      `指向实际的 clone 目录，例如：\n\n` +
      `  biji config set --sync-repo-path /绝对/路径/到/你的vault\n\n` +
      `首次 clone 的体量和耗时不受 biji sync 的 git 超时限制（当前 ${getGitTimeoutMs()}ms）；\n` +
      `大型 vault（尤其包含 Git LFS 资源）在较慢的网络下手动 clone 也可能需要数十分钟，\n` +
      `请耐心等待其完成。\n\n` +
      `如果连接 github.com 超时或速度很慢，建议在 ~/.ssh/config 中为 github.com 配置\n` +
      `Hostname ssh.github.com / Port 443，改用 GitHub 的 443 端口入口（详见\n` +
      `docs/biji-sync.md 第 8 节）。\n\n` +
      `clone 完成后重新运行 biji sync 即可完成首次初始化（不会拉取历史笔记，` +
      `只有此后新建的笔记才会被同步）。`;
    log(`同步仓库不存在，需要手动 clone 到: ${syncRepoPath}`);
    await notify(options, 'biji sync: 需要手动 clone 同步仓库', message);
    process.exitCode = 1;
    return;
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
