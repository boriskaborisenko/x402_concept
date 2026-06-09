#!/usr/bin/env bash
set -euo pipefail

PATCH="${1:-}"
if [ -z "$PATCH" ]; then
  echo "Usage: ./ai-apply.sh path/to/fix.patch"
  exit 1
fi

if [ ! -f "$PATCH" ]; then
  echo "Patch not found: $PATCH"
  exit 1
fi

echo "Checking patch..."
git apply --check "$PATCH"

echo "Applying patch..."
git apply "$PATCH"

echo "Done. Current git diff:"
git diff --stat
