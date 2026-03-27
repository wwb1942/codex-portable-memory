# Portable Memory System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hybrid project/global portable memory to `codex-memory-mcp`, including profile-driven scope resolution, richer metadata and ranking, import/export/compact MCP tools, and a Codex skill that standardizes memory usage.

**Architecture:** Keep the existing LanceDB store and MCP server as the runtime core. Add a thin profile layer for project identity and default scopes, a ranking layer for project-first recall, explicit transfer/compaction modules for portability and governance, and a separate Codex skill that calls the MCP tools instead of embedding storage logic.

**Tech Stack:** TypeScript, Node.js `node:test`, LanceDB, MCP SDK, `tsx`, JSONL, Codex skill scaffolding.

**Status:** Completed in the monorepo at `D:\projects\codex-portable-memory` and validated on 2026-03-27.

**Workspace Note:** This plan was originally written for a standalone `D:\codex-memory-mcp` workspace. The implemented system now lives in the monorepo at `D:\projects\codex-portable-memory\packages\codex-memory-mcp`, so treat the commit steps below as historical checkpoints.

---

## File Map

### Create

- `D:\codex-memory-mcp\src\core\profile.ts`
  Resolve project-level memory profile files and default recall/write scopes.
- `D:\codex-memory-mcp\src\core\memory-kinds.ts`
  Define `episodic` and `semantic` memory kinds and promotion helpers.
- `D:\codex-memory-mcp\src\core\memory-ranking.ts`
  Re-rank recall results using retrieval score, importance, recency, and stability.
- `D:\codex-memory-mcp\src\core\export-import.ts`
  Export and import memory records as `jsonl`.
- `D:\codex-memory-mcp\src\core\compaction.ts`
  Detect duplicates, repair supersede chains, and prune low-value noise conservatively.
- `D:\codex-memory-mcp\test\profile-resolution.test.mjs`
  Verify profile loading and project/global scope fallback behavior.
- `D:\codex-memory-mcp\test\memory-metadata.test.mjs`
  Verify metadata normalization and backward compatibility.
- `D:\codex-memory-mcp\test\memory-recall-ranking.test.mjs`
  Verify project-first ranking and superseded-memory suppression.
- `D:\codex-memory-mcp\test\memory-transfer.test.mjs`
  Verify export/import round-trip behavior.
- `D:\codex-memory-mcp\test\memory-compaction.test.mjs`
  Verify duplicate detection, supersede repair, and pruning thresholds.
- `D:\codex-memory-mcp\docs\examples\memory-profile.json`
  Example project profile for operators and future tests.
- `C:\Users\Administrator\.codex\skills\portable-memory\SKILL.md`
  Codex skill workflow for recall-before-work and high-value persistence.
- `C:\Users\Administrator\.codex\skills\portable-memory\agents\openai.yaml`
  Skill UI metadata.

### Modify

- `D:\codex-memory-mcp\src\memory-service.ts`
  Add profile-aware defaults, richer metadata writes, ranking, list/export/import/compact methods.
- `D:\codex-memory-mcp\src\server.ts`
  Wire profile resolution at startup and register new MCP tools.
- `D:\codex-memory-mcp\src\core\smart-metadata.ts`
  Extend normalized metadata with `kind`, `stability`, `tags`, `project_id`, `session_id`, and recall touch updates.
- `D:\codex-memory-mcp\src\core\store.ts`
  Reuse existing list/import helpers, add any small helpers needed by export/import and compaction.
- `D:\codex-memory-mcp\test\mcp-server.test.mjs`
  Expand tool coverage and remove hard-coded absolute source path assumptions.
- `D:\codex-memory-mcp\test\memory-roundtrip.test.mjs`
  Expand round-trip coverage for profile defaults and enriched metadata.
- `D:\codex-memory-mcp\README.md`
  Document profiles, new tools, skill installation, and migration workflow.

## Task 1: Add Profile Resolution and Default Scope Logic

**Files:**
- Create: `D:\codex-memory-mcp\src\core\profile.ts`
- Create: `D:\codex-memory-mcp\test\profile-resolution.test.mjs`
- Modify: `D:\codex-memory-mcp\src\memory-service.ts`
- Modify: `D:\codex-memory-mcp\src\server.ts`
- Test: `D:\codex-memory-mcp\test\profile-resolution.test.mjs`

- [x] **Step 1: Write the failing profile tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadMemoryProfile, resolveRecallScopes } from '../src/core/profile.ts';

test('project profile overrides default scope and fallback scopes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'memory-profile-'));
  await mkdir(join(root, '.codex'));
  await writeFile(
    join(root, '.codex', 'memory-profile.json'),
    JSON.stringify({
      version: 1,
      projectId: 'demo-project',
      defaultScope: 'project:demo-project',
      fallbackScopes: ['global'],
    }),
    'utf8'
  );

  try {
    const profile = await loadMemoryProfile({ cwd: root });
    assert.equal(profile.projectId, 'demo-project');
    assert.deepEqual(resolveRecallScopes(profile), ['project:demo-project', 'global']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [x] **Step 2: Run the new test to verify it fails**

Run: `node --import tsx --test test/profile-resolution.test.mjs`

Expected: FAIL with `Cannot find module '../src/core/profile.ts'` or equivalent assertion failures.

- [x] **Step 3: Implement the profile loader and scope resolver**

```ts
export interface MemoryProfile {
  version: number;
  projectId?: string;
  defaultScope: string;
  fallbackScopes: string[];
  writePolicy?: {
    defaultKind?: 'episodic' | 'semantic';
    promoteDecisionToSemantic?: boolean;
  };
  recallPolicy?: {
    maxScopes?: number;
    preferProject?: boolean;
  };
}

export async function loadMemoryProfile(
  input: { cwd?: string; userHome?: string }
): Promise<MemoryProfile> {
  // 1. Try <cwd>/.codex/memory-profile.json
  // 2. Try ~/.codex/memory/profiles/default.json
  // 3. Return built-in defaults
}

export function resolveRecallScopes(
  profile: MemoryProfile,
  explicitScope?: string
): string[] {
  if (explicitScope) return [explicitScope];
  return [profile.defaultScope, ...profile.fallbackScopes].filter(
    (scope, index, list) => list.indexOf(scope) === index
  );
}
```

- [x] **Step 4: Wire the service and server to use the resolved profile**

Implementation notes:
- Extend `createMemoryService()` options with `profile` or `profileContext`.
- In `src/server.ts`, load the profile using `process.cwd()` as project root and an env override such as `CODEX_MEMORY_PROJECT_ROOT` when needed.
- Keep explicit `scope` arguments backward compatible. When `scope` is omitted, use the profile defaults.

- [x] **Step 5: Run the focused profile test again**

Run: `node --import tsx --test test/profile-resolution.test.mjs`

Expected: PASS.

- [x] **Step 6: Run the full test suite to catch regressions**

Run: `npm test`

Expected: PASS with the new profile test included.

- [x] **Step 7: Create a checkpoint**

If this directory is under git:

```bash
git add src/core/profile.ts src/memory-service.ts src/server.ts test/profile-resolution.test.mjs
git commit -m "feat: add memory profile resolution"
```

## Task 2: Extend Metadata for Memory Kind, Stability, and Project Context

**Files:**
- Create: `D:\codex-memory-mcp\src\core\memory-kinds.ts`
- Create: `D:\codex-memory-mcp\test\memory-metadata.test.mjs`
- Modify: `D:\codex-memory-mcp\src\core\smart-metadata.ts`
- Modify: `D:\codex-memory-mcp\src\memory-service.ts`
- Modify: `D:\codex-memory-mcp\test\memory-roundtrip.test.mjs`
- Test: `D:\codex-memory-mcp\test\memory-metadata.test.mjs`

- [x] **Step 1: Write the failing metadata normalization tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSmartMetadata, buildSmartMetadata } from '../src/core/smart-metadata.ts';

test('smart metadata backfills kind, stability, and project context', () => {
  const metadata = parseSmartMetadata(undefined, {
    text: 'Use apply_patch for code edits.',
    category: 'preference',
    importance: 0.9,
    timestamp: 1770000000000,
  });

  assert.equal(metadata.kind, 'semantic');
  assert.equal(typeof metadata.stability, 'number');
  assert.equal(Array.isArray(metadata.tags), true);
});
```

- [x] **Step 2: Run the metadata test to verify it fails**

Run: `node --import tsx --test test/memory-metadata.test.mjs`

Expected: FAIL because the new normalized metadata fields are not defined yet.

- [x] **Step 3: Implement explicit memory kinds and metadata defaults**

```ts
export type MemoryKind = 'episodic' | 'semantic';

export function deriveMemoryKind(input: {
  category: string;
  importance: number;
  promoteDecisionToSemantic?: boolean;
}): MemoryKind {
  if (input.category === 'preference') return 'semantic';
  if (input.category === 'decision' && input.promoteDecisionToSemantic) return 'semantic';
  return 'episodic';
}
```

Update `SmartMemoryMetadata` to include:

```ts
kind: MemoryKind;
stability: number;
tags: string[];
project_id?: string;
session_id?: string;
```

- [x] **Step 4: Update service writes so new memories carry project-aware metadata**

Implementation notes:
- On `store()`, set `kind`, `stability`, `project_id`, and `session_id` from the resolved profile/context.
- On `update()`, preserve existing values unless explicitly replaced.
- Add a small helper that updates `access_count` and `last_accessed_at` for recalled memories without changing user-visible text.

- [x] **Step 5: Re-run the targeted metadata tests**

Run: `node --import tsx --test test/memory-metadata.test.mjs`

Expected: PASS.

- [x] **Step 6: Extend the existing round-trip test and run it**

Run: `node --import tsx --test test/memory-roundtrip.test.mjs`

Expected: PASS with assertions covering `kind`, `stability`, and backward-compatible metadata parsing.

- [x] **Step 7: Create a checkpoint**

If this directory is under git:

```bash
git add src/core/memory-kinds.ts src/core/smart-metadata.ts src/memory-service.ts test/memory-metadata.test.mjs test/memory-roundtrip.test.mjs
git commit -m "feat: enrich memory metadata"
```

## Task 3: Add Project-First Recall Ranking and Supersede Filtering

**Files:**
- Create: `D:\codex-memory-mcp\src\core\memory-ranking.ts`
- Create: `D:\codex-memory-mcp\test\memory-recall-ranking.test.mjs`
- Modify: `D:\codex-memory-mcp\src\memory-service.ts`
- Modify: `D:\codex-memory-mcp\src\core\smart-metadata.ts`
- Test: `D:\codex-memory-mcp\test\memory-recall-ranking.test.mjs`

- [x] **Step 1: Write failing ranking tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createMemoryService } from '../src/memory-service.ts';

test('project-scoped memory outranks matching global memory', async () => {
  const dbPath = await mkdtemp(join(tmpdir(), 'memory-ranking-'));
  const embedder = {
    dimensions: 4,
    embedQuery: async () => [1, 0, 0, 0],
    embedPassage: async () => [1, 0, 0, 0],
  };

  const service = await createMemoryService({
    dbPath,
    embedder,
    profile: {
      version: 1,
      projectId: 'demo',
      defaultScope: 'project:demo',
      fallbackScopes: ['global'],
      recallPolicy: { preferProject: true, maxScopes: 2 },
    },
  });

  try {
    await service.store({ text: 'Use pnpm in this project.', scope: 'global', category: 'preference', importance: 0.7 });
    await service.store({ text: 'Use npm in this project.', scope: 'project:demo', category: 'decision', importance: 0.8 });
    const results = await service.recall({ query: 'package manager', limit: 5 });
    assert.equal(results[0].scope, 'project:demo');
  } finally {
    await rm(dbPath, { recursive: true, force: true });
  }
});
```

- [x] **Step 2: Run the ranking test to verify it fails**

Run: `node --import tsx --test test/memory-recall-ranking.test.mjs`

Expected: FAIL because recall currently does not apply profile-first re-ranking.

- [x] **Step 3: Implement the ranking helper**

```ts
export function rankRecallResults(input: {
  items: Array<{
    id: string;
    score: number;
    importance: number;
    timestamp: number;
    scope: string;
    metadata?: string;
  }>;
  primaryScope?: string;
}): Array<{ id: string; finalScore: number }> {
  // finalScore =
  //   retrievalScore * 0.55 +
  //   importance * 0.20 +
  //   recencyScore * 0.15 +
  //   stability * 0.10 +
  //   projectScopeBoost
}
```

Implementation notes:
- Use existing `parseSmartMetadata()` to read `stability`, `superseded_by`, and activity state.
- Suppress superseded memories from default recall unless a future debug/list mode asks for historical entries.
- Apply only a small scope boost so obviously irrelevant project memories do not outrank a clearly matching global memory.

- [x] **Step 4: Change service recall to search all resolved scopes and then re-rank**

Implementation notes:
- Replace the current single-scope filter with the resolved array from Task 1.
- Keep `scope` on the returned record so callers can tell whether the result came from project or global memory.
- Touch recall metadata after successful retrieval so `access_count` and `last_accessed_at` evolve over time.

- [x] **Step 5: Run the targeted ranking test again**

Run: `node --import tsx --test test/memory-recall-ranking.test.mjs`

Expected: PASS.

- [x] **Step 6: Run the whole suite**

Run: `npm test`

Expected: PASS.

- [x] **Step 7: Create a checkpoint**

If this directory is under git:

```bash
git add src/core/memory-ranking.ts src/memory-service.ts src/core/smart-metadata.ts test/memory-recall-ranking.test.mjs
git commit -m "feat: add project-first recall ranking"
```

## Task 4: Expose Memory List, Export, and Import

**Files:**
- Create: `D:\codex-memory-mcp\src\core\export-import.ts`
- Create: `D:\codex-memory-mcp\test\memory-transfer.test.mjs`
- Modify: `D:\codex-memory-mcp\src\memory-service.ts`
- Modify: `D:\codex-memory-mcp\src\server.ts`
- Modify: `D:\codex-memory-mcp\src\core\store.ts`
- Modify: `D:\codex-memory-mcp\test\mcp-server.test.mjs`
- Test: `D:\codex-memory-mcp\test\memory-transfer.test.mjs`

- [x] **Step 1: Write failing export/import tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createMemoryService } from '../src/memory-service.ts';

test('memory export and import preserves text, scope, and metadata', async () => {
  const sourceDb = await mkdtemp(join(tmpdir(), 'memory-export-src-'));
  const targetDb = await mkdtemp(join(tmpdir(), 'memory-export-dst-'));
  const exportPath = join(tmpdir(), `memory-export-${Date.now()}.jsonl`);

  // create two services, export from one, import into the other, then recall
  // assert exported file contains one JSON object per line
});
```

- [x] **Step 2: Run the transfer test to verify it fails**

Run: `node --import tsx --test test/memory-transfer.test.mjs`

Expected: FAIL because export/import methods and tools do not exist yet.

- [x] **Step 3: Implement export/import helpers**

```ts
export interface ExportMemoryInput {
  path: string;
  scopes?: string[];
  category?: string;
}

export interface ImportMemoryInput {
  path: string;
  mode?: 'skip-existing' | 'upsert';
  reembed?: boolean;
}
```

Implementation notes:
- Export using `jsonl`, one record per line, plus `schemaVersion`.
- Import should accept old records that lack newly added metadata fields.
- If imported vectors are missing or dimension-mismatched, regenerate vectors with the current embedder and keep the original text and metadata.

- [x] **Step 4: Add service methods and MCP tools**

Register new tools in `src/server.ts`:

```ts
memory_list
memory_export
memory_import
```

Tool shape guidance:
- `memory_list`: accept `scope`, `category`, `limit`, `offset`
- `memory_export`: accept `path`, `scope`, `category`
- `memory_import`: accept `path`, `mode`, `scope`

- [x] **Step 5: Fix the MCP server test so it is portable**

Replace the hard-coded server path:

```js
['--import', 'tsx', '<repo-root>/packages/codex-memory-mcp/src/server.ts']
```

with a path derived from the test file location:

```js
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverEntry = join(__dirname, '..', 'src', 'server.ts');
```

- [x] **Step 6: Run the focused tests**

Run:

```bash
node --import tsx --test test/memory-transfer.test.mjs
node --import tsx --test test/mcp-server.test.mjs
```

Expected: PASS.

- [x] **Step 7: Run the full suite**

Run: `npm test`

Expected: PASS with the tool list now containing `memory_list`, `memory_export`, and `memory_import`.

- [x] **Step 8: Create a checkpoint**

If this directory is under git:

```bash
git add src/core/export-import.ts src/memory-service.ts src/server.ts src/core/store.ts test/memory-transfer.test.mjs test/mcp-server.test.mjs
git commit -m "feat: add portable memory export and import"
```

## Task 5: Add Conservative Compaction and Supersede Repair

**Files:**
- Create: `D:\codex-memory-mcp\src\core\compaction.ts`
- Create: `D:\codex-memory-mcp\test\memory-compaction.test.mjs`
- Modify: `D:\codex-memory-mcp\src\memory-service.ts`
- Modify: `D:\codex-memory-mcp\src\server.ts`
- Modify: `D:\codex-memory-mcp\src\core\smart-metadata.ts`
- Test: `D:\codex-memory-mcp\test\memory-compaction.test.mjs`

- [x] **Step 1: Write failing compaction tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('compaction keeps the stronger memory and invalidates the weaker duplicate', async () => {
  // create two near-duplicate decision memories in the same scope
  // run memory compact
  // assert the older/weaker one is invalidated or deleted conservatively
});
```

- [x] **Step 2: Run the compaction test to verify it fails**

Run: `node --import tsx --test test/memory-compaction.test.mjs`

Expected: FAIL because compaction logic and the MCP tool do not exist yet.

- [x] **Step 3: Implement a conservative compaction engine**

```ts
export interface CompactMemoryInput {
  scopes: string[];
  dryRun?: boolean;
  pruneBeforeTimestamp?: number;
}

export interface CompactMemoryResult {
  duplicatesMerged: number;
  supersedesRepaired: number;
  lowValuePruned: number;
}
```

Rules to encode:
- Exact or highly normalized duplicates in the same `scope + category` set are candidates.
- `decision` memories sharing the same `fact_key` should prefer the newest/highest-confidence record.
- Never auto-delete high-importance memories.
- Low-value pruning should require all of these:
  - `importance < 0.25`
  - `confidence < 0.40`
  - `kind === 'episodic'`
  - stale `last_accessed_at`

- [x] **Step 4: Add a service method and the `memory_compact` tool**

Implementation notes:
- Support `dryRun` first so the behavior is inspectable before deletion.
- Return counts and changed IDs in structured content.
- Prefer metadata invalidation over destructive deletion when preserving history matters.

- [x] **Step 5: Run the targeted compaction test**

Run: `node --import tsx --test test/memory-compaction.test.mjs`

Expected: PASS.

- [x] **Step 6: Run the full suite**

Run: `npm test`

Expected: PASS.

- [x] **Step 7: Create a checkpoint**

If this directory is under git:

```bash
git add src/core/compaction.ts src/memory-service.ts src/server.ts src/core/smart-metadata.ts test/memory-compaction.test.mjs
git commit -m "feat: add memory compaction workflow"
```

## Task 6: Create and Validate the Portable Memory Skill

**Files:**
- Create: `C:\Users\Administrator\.codex\skills\portable-memory\SKILL.md`
- Create: `C:\Users\Administrator\.codex\skills\portable-memory\agents\openai.yaml`
- Modify: `D:\codex-memory-mcp\README.md`
- Test: `C:\Users\Administrator\.codex\skills\.system\skill-creator\scripts\quick_validate.py`

- [x] **Step 1: Initialize the skill in the default auto-discovery location**

Run:

```powershell
python C:\Users\Administrator\.codex\skills\.system\skill-creator\scripts\init_skill.py portable-memory --path C:\Users\Administrator\.codex\skills --interface display_name="Portable Memory" --interface short_description="Recall and persist high-value project and global memory through the codex-memory MCP tools." --interface default_prompt="Use portable-memory to recall relevant memory before work, store only stable high-value information, and compact or export memory when asked."
```

Expected: A new directory at `C:\Users\Administrator\.codex\skills\portable-memory`.

- [x] **Step 2: Replace the generated placeholders with the real workflow**

The skill body should instruct Codex to:
- recall before substantial work
- prefer `project:<project-id>` memories over `global`
- store only confirmed, reusable, high-value information
- use `memory_update` or supersede relations instead of rewriting history blindly
- use `memory_export` and `memory_import` for migration

Minimal frontmatter:

```md
---
name: portable-memory
description: Use when the user wants long-term memory, portable project memory, memory recall, memory migration, or a repeatable workflow for storing and retrieving high-value decisions and preferences through codex-memory MCP tools.
---
```

- [x] **Step 3: Validate the skill folder**

Run:

```powershell
python C:\Users\Administrator\.codex\skills\.system\skill-creator\scripts\quick_validate.py C:\Users\Administrator\.codex\skills\portable-memory
```

Expected: PASS with no YAML frontmatter or naming errors.

- [x] **Step 4: Add a short usage section to the project README**

Document:
- how to register the MCP server
- how the skill is discovered
- when to create `.codex/memory-profile.json`
- how to export/import memories during migration

- [x] **Step 5: Create a checkpoint**

If this directory is under git and the skill path is vendored into a repository, commit there using:

```bash
git add README.md
git commit -m "docs: document portable memory skill workflow"
```

## Task 7: Document the Operator Workflow and Example Profile

**Files:**
- Create: `D:\codex-memory-mcp\docs\examples\memory-profile.json`
- Modify: `D:\codex-memory-mcp\README.md`
- Test: `D:\codex-memory-mcp\test\mcp-server.test.mjs`

- [x] **Step 1: Add an example project profile**

Create:

```json
{
  "version": 1,
  "projectId": "codex-memory-mcp",
  "defaultScope": "project:codex-memory-mcp",
  "fallbackScopes": ["global"],
  "writePolicy": {
    "defaultKind": "episodic",
    "promoteDecisionToSemantic": true
  },
  "recallPolicy": {
    "maxScopes": 2,
    "preferProject": true
  }
}
```

- [x] **Step 2: Update the README with the full operator flow**

Document these sections:
- profile discovery order
- new MCP tool list
- migration flow: `memory_export` -> move file -> `memory_import`
- skill path and validation command
- recommendation to use `project` memory for repo-specific decisions and `global` for long-term preferences

- [x] **Step 3: Run the end-to-end MCP test one more time**

Run: `node --import tsx --test test/mcp-server.test.mjs`

Expected: PASS with the expanded tool set and no path assumptions tied to `D:\`.

- [x] **Step 4: Run the final full verification**

Run: `npm test`

Expected: PASS.

- [x] **Step 5: Create a final checkpoint**

If this directory is under git:

```bash
git add README.md docs/examples/memory-profile.json docs/superpowers/specs/2026-03-25-portable-memory-system-design.md docs/superpowers/plans/2026-03-25-portable-memory-system.md
git commit -m "docs: add portable memory operating guide"
```

## Final Verification Checklist

- [x] `node --import tsx --test test/profile-resolution.test.mjs`
- [x] `node --import tsx --test test/memory-metadata.test.mjs`
- [x] `node --import tsx --test test/memory-recall-ranking.test.mjs`
- [x] `node --import tsx --test test/memory-transfer.test.mjs`
- [x] `node --import tsx --test test/memory-compaction.test.mjs`
- [x] `node --import tsx --test test/memory-roundtrip.test.mjs`
- [x] `node --import tsx --test test/mcp-server.test.mjs`
- [x] `npm test`
- [x] `python C:\Users\Administrator\.codex\skills\.system\skill-creator\scripts\quick_validate.py C:\Users\Administrator\.codex\skills\portable-memory`

## Execution Notes

- Do not implement UI or remote sync in this pass.
- Keep the MCP tool surface explicit and inspectable.
- Prefer adding small focused modules instead of growing `memory-service.ts` and `server.ts` further than necessary.
- When a new behavior can be encoded as metadata plus ranking, prefer that over schema churn in the LanceDB row shape.

