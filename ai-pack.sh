#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
AI_DIR="$ROOT/.ai"
OUT_DIR="$AI_DIR/out"
TASK_FILE="$AI_DIR/task.md"
CONTEXT_FILE="$OUT_DIR/context.md"
ARCHIVE_FILE="$OUT_DIR/context.zip"
MAX_FILES="${MAX_FILES:-160}"
MAX_LINES="${MAX_LINES:-260}"

mkdir -p "$OUT_DIR"

if [ ! -f "$TASK_FILE" ]; then
  mkdir -p "$AI_DIR"
  cat > "$TASK_FILE" <<'TASK'
# Task

Describe what you want changed, fixed, or reviewed.

Rules for AI:
- Do not rewrite the whole project unless required.
- Prefer minimal patches.
- Explain which files are changed and why.
- Return a unified diff patch when possible.
TASK
  echo "Created $TASK_FILE. Edit it, then run ./ai-pack.sh again."
  exit 0
fi

cat > "$CONTEXT_FILE" <<EOFCTX
# AI Work Package

Generated at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Project root: $ROOT

## Task

$(cat "$TASK_FILE")

## Git status

\`\`\`
$(git status --short 2>/dev/null || true)
\`\`\`

## Project tree

\`\`\`
$(find . \
  -path './node_modules' -prune -o \
  -path './.git' -prune -o \
  -path './dist' -prune -o \
  -path './build' -prune -o \
  -path './.next' -prune -o \
  -path './coverage' -prune -o \
  -path './.turbo' -prune -o \
  -path './.cache' -prune -o \
  -path './vendor' -prune -o \
  -path './.venv' -prune -o \
  -path './venv' -prune -o \
  -path './__pycache__' -prune -o \
  -type f \
  | sed 's#^\./##' \
  | sort \
  | head -800)
\`\`\`

## Selected files
EOFCTX

FILES=$(find . \
  -path './node_modules' -prune -o \
  -path './.git' -prune -o \
  -path './dist' -prune -o \
  -path './build' -prune -o \
  -path './.next' -prune -o \
  -path './coverage' -prune -o \
  -path './.turbo' -prune -o \
  -path './.cache' -prune -o \
  -path './vendor' -prune -o \
  -path './.venv' -prune -o \
  -path './venv' -prune -o \
  -path './__pycache__' -prune -o \
  -path './.ai/out' -prune -o \
  -type f \( \
    -name 'package.json' -o \
    -name 'pnpm-lock.yaml' -o \
    -name 'yarn.lock' -o \
    -name 'package-lock.json' -o \
    -name 'README.md' -o \
    -name '.env.example' -o \
    -name 'next.config.*' -o \
    -name 'vite.config.*' -o \
    -name 'tsconfig.json' -o \
    -name 'tailwind.config.*' -o \
    -name 'postcss.config.*' -o \
    -name 'eslint.config.*' -o \
    -name '.eslintrc*' -o \
    -name 'Dockerfile' -o \
    -name 'docker-compose.yml' -o \
    -name '*.ts' -o \
    -name '*.tsx' -o \
    -name '*.js' -o \
    -name '*.jsx' -o \
    -name '*.mjs' -o \
    -name '*.cjs' -o \
    -name '*.py' -o \
    -name '*.rs' -o \
    -name '*.go' -o \
    -name '*.sol' \
  \) | sort | head -"$MAX_FILES")

for f in $FILES; do
  printf '\n### %s\n\n```\n' "${f#./}" >> "$CONTEXT_FILE"
  sed -n "1,${MAX_LINES}p" "$f" >> "$CONTEXT_FILE" || true
  printf '\n```\n' >> "$CONTEXT_FILE"
done

cd "$AI_DIR"
zip -q -r "$ARCHIVE_FILE" task.md out/context.md >/dev/null
cd "$ROOT"

echo "Created: $CONTEXT_FILE"
echo "Created: $ARCHIVE_FILE"
echo "Upload this file to ChatGPT: $ARCHIVE_FILE"
