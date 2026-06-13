#!/bin/bash
# Wrapper script for `biji sync`, run hourly via launchd on the idle Mac.
# Sets PATH so git/node/biji resolve under launchd's minimal environment
# (spec §6).

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

if ! command -v biji >/dev/null 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: 'biji' not found on PATH ($PATH). Check your Node/npm install location and update the PATH line above." >&2
  exit 1
fi

# Auto Clash proxy (one-shot version of ~/.zshrc's _auto_proxy precmd hook).
# launchd runs this as a non-interactive shell, which never sources
# ~/.zshrc, so without this git's HTTPS connections to github.com have no
# proxy and hang until git_ops.ts's timeout (ETIMEDOUT).
CLASH_PORT="${BIJI_CLASH_PORT:-7890}"
if nc -z -G 1 127.0.0.1 "$CLASH_PORT" 2>/dev/null; then
  export http_proxy="http://127.0.0.1:${CLASH_PORT}"
  export https_proxy="http://127.0.0.1:${CLASH_PORT}"
  export all_proxy="socks5://127.0.0.1:${CLASH_PORT}"
  export no_proxy="localhost,127.0.0.1,::1"
fi

biji sync
