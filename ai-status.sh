#!/usr/bin/env bash
set -euo pipefail

AI_DIR="$(pwd)/.ai"
OUT_DIR="$AI_DIR/out"
REPORT="$OUT_DIR/status.md"
mkdir -p "$OUT_DIR"

BUILD_CMD="${BUILD_CMD:-}"
TEST_CMD="${TEST_CMD:-}"
LINT_CMD="${LINT_CMD:-}"

# Auto-detect basic commands if package.json exists and env vars are empty.
if [ -f package.json ]; then
  if [ -z "$BUILD_CMD" ] && grep -q '"build"' package.json; then BUILD_CMD="npm run build"; fi
  if [ -z "$TEST_CMD" ] && grep -q '"test"' package.json; then TEST_CMD="npm test"; fi
  if [ -z "$LINT_CMD" ] && grep -q '"lint"' package.json; then LINT_CMD="npm run lint"; fi
fi

{
  echo "# AI Status Report"
  echo
  echo "Generated at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo
  echo "## Git status"
  echo '```'
  git status --short 2>/dev/null || true
  echo '```'
  echo
  echo "## Git diff stat"
  echo '```'
  git diff --stat 2>/dev/null || true
  echo '```'
  echo
  echo "## Git diff"
  echo '```diff'
  git diff 2>/dev/null || true
  echo '```'
  echo

  if [ -n "$LINT_CMD" ]; then
    echo "## Lint: $LINT_CMD"
    echo '```'
    bash -lc "$LINT_CMD" 2>&1 || true
    echo '```'
    echo
  fi

  if [ -n "$BUILD_CMD" ]; then
    echo "## Build: $BUILD_CMD"
    echo '```'
    bash -lc "$BUILD_CMD" 2>&1 || true
    echo '```'
    echo
  fi

  if [ -n "$TEST_CMD" ]; then
    echo "## Test: $TEST_CMD"
    echo '```'
    bash -lc "$TEST_CMD" 2>&1 || true
    echo '```'
    echo
  fi
} > "$REPORT"

echo "Created: $REPORT"
echo "Upload this file to ChatGPT if you want the next fix cycle."
