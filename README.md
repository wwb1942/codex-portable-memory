# Codex Portable Memory

[![Built with Codex](https://img.shields.io/badge/Built%20with-Codex-000000?style=flat-square)](https://openai.com/codex/)

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

License: [MIT](LICENSE)

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

Bootstrap the repository:

```bash
node scripts/bootstrap.mjs
```

Windows wrapper:

```powershell
./bootstrap.ps1
```

macOS/Linux wrapper:

```bash
./bootstrap.sh
```

Bootstrap will:

- install or validate `packages/codex-memory-mcp` dependencies
- install `skills/portable-memory` into your local Codex skills directory
- create `workspace-memory/config/memory-config.json` if it does not already exist
- create `.codex/memory-profile.json` if it does not already exist
- print exact next-step commands for MCP registration and verification

The generated `.codex/memory-profile.json` is repo-local configuration, ignored by git, and safe to edit if you want a different default project scope.

Full install and troubleshooting notes live in [docs/install.md](docs/install.md).

## Verify

Register the MCP server:

```bash
codex mcp add codex-memory -- node --import tsx <repo-root>/packages/codex-memory-mcp/src/server.ts
```

Run the MCP backend checks:

```bash
cd <repo-root>/packages/codex-memory-mcp
npm test
npm run typecheck
```

Optional workspace logging verification:

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

## GitHub Metadata

Suggested GitHub description, topics, and release notes are tracked in:

- [docs/github-metadata.md](docs/github-metadata.md)
- [docs/releases/v0.1.0.md](docs/releases/v0.1.0.md)
