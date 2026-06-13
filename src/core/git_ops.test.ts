import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getGitTimeoutMs, gitClone, gitPullRebase } from './git_ops.js';

let dir: string;
let oldPath: string | undefined;
let oldLogPath: string | undefined;
let oldRemoteUrl: string | undefined;
let oldTimeoutMs: string | undefined;

function installFakeGit(): string {
  dir = mkdtempSync(join(tmpdir(), 'biji-git-ops-'));
  const binDir = join(dir, 'bin');
  const logPath = join(dir, 'git.log');
  const gitPath = join(binDir, 'git');
  mkdirSync(binDir);
  writeFileSync(
    gitPath,
    `#!/bin/sh
if [ "$1" = "config" ] && [ "$2" = "--get" ] && [ "$3" = "remote.origin.url" ]; then
  printf "%s\\n" "$TEST_GIT_REMOTE_URL"
  exit 0
fi
printf "args:%s\\n" "$*" >> "$TEST_GIT_LOG"
printf "global:%s\\n" "\${GIT_CONFIG_GLOBAL:-}" >> "$TEST_GIT_LOG"
exit 0
`,
    'utf-8'
  );
  chmodSync(gitPath, 0o755);
  process.env.PATH = `${binDir}:${oldPath || ''}`;
  process.env.TEST_GIT_LOG = logPath;
  return logPath;
}

function readLog(logPath: string): string {
  return readFileSync(logPath, 'utf-8');
}

describe('git sync command environment', () => {
  beforeEach(() => {
    oldPath = process.env.PATH;
    oldLogPath = process.env.TEST_GIT_LOG;
    oldRemoteUrl = process.env.TEST_GIT_REMOTE_URL;
    oldTimeoutMs = process.env.BIJI_GIT_TIMEOUT_MS;
  });

  afterEach(() => {
    process.env.PATH = oldPath;
    if (oldLogPath === undefined) {
      delete process.env.TEST_GIT_LOG;
    } else {
      process.env.TEST_GIT_LOG = oldLogPath;
    }
    if (oldRemoteUrl === undefined) {
      delete process.env.TEST_GIT_REMOTE_URL;
    } else {
      process.env.TEST_GIT_REMOTE_URL = oldRemoteUrl;
    }
    if (oldTimeoutMs === undefined) {
      delete process.env.BIJI_GIT_TIMEOUT_MS;
    } else {
      process.env.BIJI_GIT_TIMEOUT_MS = oldTimeoutMs;
    }
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('bypasses user gitconfig for HTTPS clone so global URL rewrites cannot force SSH', () => {
    const logPath = installFakeGit();

    const result = gitClone('https://github.com/ghh-l-djl/obsidian-vault.git', join(dir, 'vault'));

    expect(result.ok).toBe(true);
    expect(readLog(logPath)).toContain('global:/dev/null');
  });

  it('keeps user gitconfig for explicit SSH clone URLs', () => {
    const logPath = installFakeGit();

    const result = gitClone('git@github.com:ghh-l-djl/obsidian-vault.git', join(dir, 'vault'));

    expect(result.ok).toBe(true);
    expect(readLog(logPath)).toContain('global:');
    expect(readLog(logPath)).not.toContain('global:/dev/null');
  });

  it('bypasses user gitconfig for pull when the stored origin URL is HTTPS', () => {
    const logPath = installFakeGit();
    const repoPath = join(dir, 'vault');
    mkdirSync(repoPath);
    process.env.TEST_GIT_REMOTE_URL = 'https://github.com/ghh-l-djl/obsidian-vault.git';

    const result = gitPullRebase(repoPath);

    expect(result.ok).toBe(true);
    expect(readLog(logPath)).toContain('args:pull --rebase');
    expect(readLog(logPath)).toContain('global:/dev/null');
  });

  it('uses a five minute default timeout for large private vault clones', () => {
    delete process.env.BIJI_GIT_TIMEOUT_MS;

    expect(getGitTimeoutMs()).toBe(300_000);
  });
});
