# Installation

## Prerequisites

- Node.js 20+ with `npm`
- Codex installed locally
- Optional: PowerShell 7 (`pwsh`) if you want to use the workspace logging scripts outside Windows PowerShell

## Recommended Commands

### Cross-platform

```bash
node scripts/bootstrap.mjs
```

### Windows

```powershell
./bootstrap.ps1
```

### macOS/Linux

```bash
./bootstrap.sh
```

## What Bootstrap Does

Bootstrap performs only repository-safe setup:

- installs or validates dependencies for `packages/codex-memory-mcp`
- installs `skills/portable-memory` into your Codex skills directory
- creates `workspace-memory/config/memory-config.json` from the tracked example if it does not already exist
- creates `.codex/memory-profile.json` from the tracked example if it does not already exist
- preserves existing skill and config destinations instead of overwriting them
- prints exact next commands for MCP registration and verification

Bootstrap does **not**:

- install Node.js or Codex for you
- auto-edit your Codex MCP configuration
- auto-register scheduled tasks
- write personal memory data into this repository

The generated `.codex/memory-profile.json` is local project configuration, not memory content. It is git-ignored and can be edited if you want a different `projectId` or default scope.

## Required Next Steps

Register the MCP server:

```bash
codex mcp add codex-memory -- node --import tsx <repo-root>/packages/codex-memory-mcp/src/server.ts
```

Verify the MCP package:

```bash
cd <repo-root>/packages/codex-memory-mcp
npm test
npm run typecheck
```

Open a new Codex session after MCP registration so the memory tools appear in the active tool set.

## Optional PowerShell Workflow

If you have PowerShell available, you can use the workspace logging scripts after bootstrap:

```powershell
powershell -ExecutionPolicy Bypass -File <repo-root>\workspace-memory\scripts\write-daily-memory.ps1
```

```powershell
powershell -ExecutionPolicy Bypass -File <repo-root>\workspace-memory\scripts\write-project-session-log.ps1 `
  -ProjectRoot C:\path\to\your-project `
  -Summary 'Implemented the current task'
```

```powershell
Invoke-Pester -Path <repo-root>\workspace-memory\tests
```

`memory-config.json` is created locally from the example and should be edited for your machine before you rely on scheduled or repeated logging.

## Troubleshooting

### `npm` not found

Install Node.js and ensure `node` and `npm` are on your PATH.

### `pwsh` not found

This is optional. Bootstrap still succeeds, but PowerShell-specific logging automation remains manual.

### Existing skill or config was kept

This is expected. Bootstrap is intentionally non-destructive and will not overwrite:

- `~/.codex/skills/portable-memory`
- `workspace-memory/config/memory-config.json`
- `.codex/memory-profile.json`

If you want a fresh local config, remove the target file yourself and run bootstrap again.

### MCP tools do not appear in Codex

Usually one of these is missing:

- `codex mcp add ...` was not run successfully
- the path passed to `src/server.ts` was wrong
- the current Codex session was not restarted after registration
