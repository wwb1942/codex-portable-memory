# Portable Memory Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cross-platform bootstrap flow that installs the reusable skill, creates local config safely, prepares MCP package dependencies, and prints exact next steps for first-time users.

**Architecture:** Keep the bootstrap logic in a Node entrypoint so the same installer works on Windows, macOS, and Linux. Put testable path and copy rules in a small helper module, keep shell wrappers thin, and treat `pwsh` as an optional enhancement instead of a required first-run dependency.

**Tech Stack:** Node.js ESM, `node:test`, PowerShell wrapper, POSIX shell wrapper, Markdown docs.

**Status:** Completed on 2026-03-27 and merged to `main` in `5fec6e7`.

---

## File Map

### Create

- `D:\projects\codex-portable-memory\scripts\bootstrap-lib.mjs`
  Pure bootstrap helpers for path selection, copy policy, prerequisite detection, and next-step rendering.
- `D:\projects\codex-portable-memory\scripts\bootstrap.mjs`
  Main bootstrap CLI that orchestrates install/copy/check actions.
- `D:\projects\codex-portable-memory\scripts\bootstrap.test.mjs`
  Focused unit tests for helper behaviors without touching the real home directory.
- `D:\projects\codex-portable-memory\bootstrap.ps1`
  Windows-friendly wrapper that delegates to `node scripts/bootstrap.mjs`.
- `D:\projects\codex-portable-memory\bootstrap.sh`
  Unix-friendly wrapper that delegates to `node scripts/bootstrap.mjs`.
- `D:\projects\codex-portable-memory\docs\install.md`
  Full installation and troubleshooting guide.

### Modify

- `D:\projects\codex-portable-memory\README.md`
  Replace long manual first-run setup with a bootstrap-first quick start.

## Task 1: Add Testable Bootstrap Helpers

**Files:**
- Create: `D:\projects\codex-portable-memory\scripts\bootstrap-lib.mjs`
- Create: `D:\projects\codex-portable-memory\scripts\bootstrap.test.mjs`
- Test: `D:\projects\codex-portable-memory\scripts\bootstrap.test.mjs`

- [x] **Step 1: Write the failing helper tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import {
  getCodexHome,
  getSkillInstallPath,
  getWorkspaceConfigPath,
  planCopyAction,
  renderNextSteps,
} from './bootstrap-lib.mjs';

test('planCopyAction marks missing destination as create', () => {
  const action = planCopyAction({
    sourceExists: true,
    destinationExists: false,
    label: 'workspace config',
  });

  assert.equal(action.kind, 'create');
});

test('planCopyAction preserves existing destination', () => {
  const action = planCopyAction({
    sourceExists: true,
    destinationExists: true,
    label: 'workspace config',
  });

  assert.equal(action.kind, 'keep');
});

test('renderNextSteps includes pwsh guidance only when available', () => {
  const withPwsh = renderNextSteps({ repoRoot: '/repo', hasPwsh: true });
  const withoutPwsh = renderNextSteps({ repoRoot: '/repo', hasPwsh: false });

  assert.match(withPwsh, /write-daily-memory/);
  assert.doesNotMatch(withoutPwsh, /write-daily-memory/);
});
```

- [x] **Step 2: Run the helper tests to verify they fail**

Run: `node --test scripts/bootstrap.test.mjs`

Expected: FAIL with `Cannot find module './bootstrap-lib.mjs'` or missing export errors.

- [x] **Step 3: Implement the pure helper module**

```js
import os from 'node:os';
import path from 'node:path';

export function getCodexHome(env = process.env) {
  return env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

export function getSkillInstallPath({ env = process.env, homeDir = os.homedir() } = {}) {
  const codexHome = env.CODEX_HOME || path.join(homeDir, '.codex');
  return path.join(codexHome, 'skills', 'portable-memory');
}

export function planCopyAction({ sourceExists, destinationExists, label }) {
  if (!sourceExists) {
    return { kind: 'error', label, reason: 'source-missing' };
  }

  if (destinationExists) {
    return { kind: 'keep', label };
  }

  return { kind: 'create', label };
}
```

Implementation notes:
- keep file-system side effects out of this module
- export platform-aware command rendering separately from command execution
- expose helper functions for repo-local tracked sources and user-home destinations

- [x] **Step 4: Run the helper tests again**

Run: `node --test scripts/bootstrap.test.mjs`

Expected: PASS.

- [x] **Step 5: Create a checkpoint**

```bash
git add scripts/bootstrap-lib.mjs scripts/bootstrap.test.mjs
git commit -m "test: add bootstrap helper coverage"
```

## Task 2: Implement the Bootstrap CLI

**Files:**
- Create: `D:\projects\codex-portable-memory\scripts\bootstrap.mjs`
- Modify: `D:\projects\codex-portable-memory\scripts\bootstrap-lib.mjs`
- Test: `D:\projects\codex-portable-memory\scripts\bootstrap.test.mjs`

- [x] **Step 1: Add one failing CLI-oriented helper test for next-step rendering**

```js
test('renderNextSteps prints codex mcp registration command from repo root', () => {
  const output = renderNextSteps({
    repoRoot: 'D:/projects/codex-portable-memory',
    hasPwsh: true,
  });

  assert.match(output, /codex mcp add codex-memory/);
  assert.match(output, /packages\/codex-memory-mcp\/src\/server\.ts/);
});
```

- [x] **Step 2: Run the helper suite to confirm the new assertion fails if needed**

Run: `node --test scripts/bootstrap.test.mjs`

Expected: FAIL until `renderNextSteps()` and path normalization match the bootstrap output contract.

- [x] **Step 3: Implement the CLI entrypoint**

```js
#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import {
  getSkillInstallPath,
  getWorkspaceConfigPath,
  planCopyAction,
  renderNextSteps,
} from './bootstrap-lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

// 1. validate node/npm/pwsh availability
// 2. run npm install in packages/codex-memory-mcp
// 3. copy skill directory if missing
// 4. copy memory-config.example.json to memory-config.json if missing
// 5. print completed/kept/optional steps plus next commands
```

Implementation notes:
- detect `npm` and `pwsh` with small `spawn()` probes
- run `npm install` in `packages/codex-memory-mcp`
- copy `skills/portable-memory` recursively into the user's Codex skills directory
- create `workspace-memory/config/memory-config.json` only if it does not exist
- keep console output explicit:
  - `done`
  - `kept existing`
  - `warning`
  - `next`

- [x] **Step 4: Run the helper test suite again**

Run: `node --test scripts/bootstrap.test.mjs`

Expected: PASS.

- [x] **Step 5: Smoke-test the CLI in dry local execution**

Run: `node scripts/bootstrap.mjs`

Expected:
- exits `0`
- installs or validates `packages/codex-memory-mcp` dependencies
- reports whether skill/config were created or preserved
- prints MCP registration and verification commands

- [x] **Step 6: Create a checkpoint**

```bash
git add scripts/bootstrap.mjs scripts/bootstrap-lib.mjs scripts/bootstrap.test.mjs
git commit -m "feat: add bootstrap cli"
```

## Task 3: Add Thin Cross-Platform Wrappers

**Files:**
- Create: `D:\projects\codex-portable-memory\bootstrap.ps1`
- Create: `D:\projects\codex-portable-memory\bootstrap.sh`
- Test: `D:\projects\codex-portable-memory\scripts\bootstrap.mjs`

- [x] **Step 1: Write the Windows wrapper**

```powershell
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
node (Join-Path $repoRoot 'scripts/bootstrap.mjs') @args
```

Rules:
- do not duplicate bootstrap logic
- fail if `node` is unavailable
- preserve exit code from the Node entrypoint

- [x] **Step 2: Write the Unix wrapper**

```bash
#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$repo_root/scripts/bootstrap.mjs" "$@"
```

- [x] **Step 3: Mark the shell wrapper executable**

Run: `git update-index --chmod=+x bootstrap.sh`

Expected: executable bit recorded for `bootstrap.sh`.

- [x] **Step 4: Verify both wrappers delegate correctly**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\bootstrap.ps1
```

```bash
bash ./bootstrap.sh
```

Expected: both wrappers produce the same bootstrap summary as `node scripts/bootstrap.mjs`.

- [x] **Step 5: Create a checkpoint**

```bash
git add bootstrap.ps1 bootstrap.sh
git commit -m "feat: add bootstrap wrappers"
```

## Task 4: Rewrite Onboarding Docs Around Bootstrap

**Files:**
- Create: `D:\projects\codex-portable-memory\docs\install.md`
- Modify: `D:\projects\codex-portable-memory\README.md`
- Test: manual read-through of the rendered Markdown

- [x] **Step 1: Draft `docs/install.md`**

Required sections:
- prerequisites
- recommended bootstrap commands by platform
- what the bootstrap script writes or preserves
- required next commands
- optional `pwsh` workflow
- troubleshooting

Use this skeleton:

```md
# Installation

## Prerequisites

## Recommended Commands

## What Bootstrap Does

## Required Next Steps

## Optional PowerShell Workflow

## Troubleshooting
```

- [x] **Step 2: Rewrite README quick start to be bootstrap-first**

Replace the long manual setup sequence with:

```md
## Quick Start

~~~bash
node scripts/bootstrap.mjs
~~~

For Windows:

~~~powershell
./bootstrap.ps1
~~~

For macOS/Linux:

~~~bash
./bootstrap.sh
~~~
```

Documentation rules:
- keep the product explanation near the top
- keep the badge
- link to `docs/install.md` for full setup details
- keep verification commands visible

- [x] **Step 3: Manually review the docs for misleading claims**

Check:
- no claim that scheduled task setup is required
- no claim that bootstrap edits Codex MCP config automatically
- no instruction implies personal memory data is part of the repository

- [x] **Step 4: Create a checkpoint**

```bash
git add README.md docs/install.md
git commit -m "docs: add bootstrap-first install guide"
```

## Task 5: Final Verification

**Files:**
- Test: `D:\projects\codex-portable-memory\scripts\bootstrap.test.mjs`
- Test: `D:\projects\codex-portable-memory\scripts\bootstrap.mjs`
- Test: `D:\projects\codex-portable-memory\README.md`
- Test: `D:\projects\codex-portable-memory\docs\install.md`

- [x] **Step 1: Run bootstrap unit tests**

Run: `node --test scripts/bootstrap.test.mjs`

Expected: PASS.

- [x] **Step 2: Run the bootstrap CLI once in the current repo**

Run: `node scripts/bootstrap.mjs`

Expected:
- exit code `0`
- no overwrite of existing user config
- clear summary of created versus kept paths

- [x] **Step 3: Run the MCP package verification**

Run:

```bash
cd packages/codex-memory-mcp
npm test
npm run typecheck
```

Expected: PASS.

- [x] **Step 4: If `pwsh` is available, run workspace-memory tests**

Run:

```powershell
Invoke-Pester -Path .\workspace-memory\tests
```

Expected: PASS.

- [x] **Step 5: Confirm the working tree is clean**

Run: `git status --short`

Expected: no output.

## Execution Notes

- Do not add a root `package.json` unless the implementation is blocked without it.
- Keep bootstrap idempotent; preserving user state is more important than being aggressive.
- Prefer helper functions plus tests over a large monolithic CLI script.
- Treat `pwsh` guidance as optional output, not a hard failure.
- If a future version wants automatic `codex mcp add`, make that a separate task with its own safety review.
