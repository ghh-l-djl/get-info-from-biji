#!/bin/bash
# Wrapper script for `biji sync`, run hourly via launchd on the idle Mac.
# launchd runs this via `/bin/bash -l`, which sources ~/.bash_profile (not
# ~/.zshrc) — that's where node/biji's directory must be added to PATH.

if ! command -v biji >/dev/null 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: 'biji' not found on PATH ($PATH). Add its directory to ~/.bash_profile's PATH." >&2
  exit 1
fi

biji sync
