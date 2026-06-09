# AI File Bridge

A tiny file-based workflow for using ChatGPT as a coding helper without API keys, IDE automation, or copy-pasting code.

## Files

- `ai-pack.sh` — creates `.ai/out/context.zip` with task + project context.
- `ai-apply.sh` — applies a patch returned by ChatGPT.
- `ai-status.sh` — creates `.ai/out/status.md` with git diff/build/test/lint output.

## Setup

Copy these scripts to the root of your project:

```bash
cp ai-pack.sh ai-apply.sh ai-status.sh /path/to/project/
cd /path/to/project
chmod +x ai-pack.sh ai-apply.sh ai-status.sh
```

## Workflow

1. Run:

```bash
./ai-pack.sh
```

The first run creates `.ai/task.md`. Edit that file and describe the task.

2. Run again:

```bash
./ai-pack.sh
```

Upload `.ai/out/context.zip` to ChatGPT.

3. ChatGPT returns a `.patch` file.

4. Apply it:

```bash
./ai-apply.sh fix.patch
```

5. Generate a status report:

```bash
./ai-status.sh
```

Upload `.ai/out/status.md` for the next cycle if needed.

## Optional command overrides

```bash
BUILD_CMD="pnpm build" TEST_CMD="pnpm test" LINT_CMD="pnpm lint" ./ai-status.sh
```
