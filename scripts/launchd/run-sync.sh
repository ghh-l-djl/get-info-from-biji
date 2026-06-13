#!/bin/bash
# Wrapper script for `biji sync`, run hourly via launchd on the idle Mac.
# Sets PATH so git/node/biji resolve under launchd's minimal environment
# (spec §6).

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

biji sync
