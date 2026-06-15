#!/bin/bash
# Wrapper script for `biji sync`, run hourly via launchd on the idle Mac.
# launchd runs this directly (no shell profile is sourced) and supplies PATH
# via the plist's EnvironmentVariables — see com.bijicli.sync.plist.

if ! command -v biji >/dev/null 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: 'biji' not found on PATH ($PATH). Update PATH in com.bijicli.sync.plist's EnvironmentVariables." >&2
  exit 1
fi

biji sync
