#!/usr/bin/env bash
# Register the always-take-ours merge driver referenced by .gitattributes.
#
# .gitattributes can declare `merge=ours` for diverged files, but the driver
# itself lives in local git config (not the repo) for security reasons —
# git will never auto-execute a custom driver from a freshly cloned repo.
#
# Run this once after cloning, and after any `git config --unset` mishap.
# Re-running is idempotent.

set -euo pipefail

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Not in a git repo; aborting." >&2
  exit 1
fi

git config merge.ours.driver true
git config merge.ours.name "always take ours"

echo "✓ Registered merge.ours driver in $(git rev-parse --git-dir)/config"
echo "  Files marked 'merge=ours' in .gitattributes will keep our version on conflict."
