#!/bin/bash
# Wrapper script for `biji sync`, run hourly via launchd on the idle Mac.
# Sets PATH so git/node/biji resolve under launchd's minimal environment
# (spec §6).

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

if ! command -v biji >/dev/null 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: 'biji' not found on PATH ($PATH). Check your Node/npm install location and update the PATH line above." >&2
  exit 1
fi

biji sync
