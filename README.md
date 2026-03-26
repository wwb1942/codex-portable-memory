# Codex Portable Memory

Portable memory stack for Codex, split into three reusable parts:

- `packages/codex-memory-mcp`
  LanceDB-backed MCP server for storage, recall, import/export, compaction, and project-aware scope resolution.
- `workspace-memory`
  Markdown-first workspace logging layer for daily logs and per-project session logs.
- `skills/portable-memory`
  Codex skill that standardizes when to recall, store, update, export, import, and compact memory.

## Use Cases

- Keep durable project memory across Codex sessions
- Separate repository-specific memory from cross-project preferences
- Keep Markdown logs usable even when semantic memory services are offline
- Export and import memory when moving machines
- Reduce stale or duplicated memory with compaction and supersede rules

## What This Repository Is

This repository contains the reusable memory framework.

It does not contain personal memory data.

Excluded from the publishable repo:

- real daily logs
- real project session logs
- local LanceDB state
- exported memory snapshots
- machine-specific `.codex` state

## Repository Layout

```text
codex-portable-memory/
|- packages/
|  \- codex-memory-mcp/
|- skills/
|  \- portable-memory/
|- workspace-memory/
|  |- config/
|  |- scripts/
|  |- templates/
|  \- tests/
\- examples/
```

## Quick Start

### 1. Start the MCP backend

```powershell
cd <repo-root>\packages\codex-memory-mcp
npm install
npm test
```

Register it with Codex:

```powershell
codex mcp add codex-memory -- node --import tsx <repo-root>\packages\codex-memory-mcp\src\server.ts
```

### 2. Install the skill

Copy the skill into your Codex skills directory:

```powershell
Copy-Item -Path <repo-root>\skills\portable-memory `
  -Destination $HOME\.codex\skills\portable-memory `
  -Recurse -Force
```

### 3. Configure workspace logging

Create your local config from the example:

```powershell
Copy-Item `
  -Path <repo-root>\workspace-memory\config\memory-config.example.json `
  -Destination <repo-root>\workspace-memory\config\memory-config.json
```

Edit `memory-config.json` for your machine, then run:

```powershell
powershell -ExecutionPolicy Bypass -File <repo-root>\workspace-memory\scripts\write-daily-memory.ps1
```

`memoryRoot` should point to the cloned `workspace-memory` directory, because the scheduled task definition resolves the script path from that root.

To create or append a project session log:

```powershell
powershell -ExecutionPolicy Bypass -File <repo-root>\workspace-memory\scripts\write-project-session-log.ps1 `
  -ProjectRoot C:\path\to\your-project `
  -Summary 'Implemented the current task'
```

To register the daily scheduled task:

```powershell
powershell -ExecutionPolicy Bypass -File <repo-root>\workspace-memory\scripts\register-daily-memory-task.ps1
```

## Verify

Run the MCP backend checks:

```powershell
cd <repo-root>\packages\codex-memory-mcp
npm test
npm run typecheck
```

Run the workspace logging tests:

```powershell
Invoke-Pester -Path <repo-root>\workspace-memory\tests
```

## Operating Model

- `workspace-memory` is the file-first truth source.
- `codex-memory-mcp` is the semantic retrieval and governance layer.
- `portable-memory` is the usage workflow for Codex.

Recommended flow:

1. Write durable facts and session checkpoints into Markdown logs.
2. Use MCP recall before substantial work.
3. Store only high-value confirmed memories.
4. Update or supersede old memories instead of duplicating them.
5. Export/import when moving machines and compact periodically.
