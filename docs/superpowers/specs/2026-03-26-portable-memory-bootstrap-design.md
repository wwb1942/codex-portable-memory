# Portable Memory Bootstrap Design

## Goal

Add a cross-platform bootstrap flow so a new user can clone `codex-portable-memory` and get to a usable first-run state with one command.

## Problem

The repository is public and documented, but first-time setup is still too manual:

- users must install the skill by hand
- users must copy local config by hand
- users must infer which steps are required versus optional
- Windows-specific scheduled task setup is mixed into the main onboarding path

That makes the project publishable, but not yet productized.

## Success Criteria

The first version of bootstrap is successful if it can do all of the following on Windows, macOS, and Linux:

1. Check for required runtime prerequisites
2. Install or validate the MCP package dependencies
3. Install the `portable-memory` skill into the user's Codex skills directory
4. Create local config from the example config without overwriting existing user config
5. Print exact next-step commands for MCP registration, verification, and optional workspace logging

The bootstrap flow does not need to make scheduled task registration mandatory for success.

## Non-Goals

This design does not attempt to:

- install Node.js for the user
- install PowerShell 7 for the user
- mutate the user's Codex MCP config automatically
- register OS-native background jobs on macOS or Linux
- publish personal memory data or machine-specific runtime state

## Recommended Approach

Use a Node-based bootstrap entrypoint as the primary installer surface, with optional PowerShell follow-up when `pwsh` is available.

Why this approach:

- Node is already a real project dependency because `codex-memory-mcp` is TypeScript-based
- a Node entrypoint is the most stable cross-platform orchestration layer here
- existing PowerShell scripts remain useful for workspace logging, but they should be treated as optional capability, not first-run hard dependency

## User Experience

The repository should support these entrypoints:

### Primary entrypoint

```bash
node scripts/bootstrap.mjs
```

### Convenience wrappers

```powershell
./bootstrap.ps1
```

```bash
./bootstrap.sh
```

The wrappers should only forward to the Node entrypoint. They should not contain duplicate installation logic.

## Bootstrap Responsibilities

`scripts/bootstrap.mjs` is responsible for:

1. Resolving repository-root relative paths reliably
2. Checking `node` and `npm`
3. Detecting optional `pwsh`
4. Running `npm install` in `packages/codex-memory-mcp` when needed
5. Copying `skills/portable-memory` to `~/.codex/skills/portable-memory`
6. Creating `workspace-memory/config/memory-config.json` from `memory-config.example.json` when missing
7. Optionally creating a user-editable example memory profile copy for onboarding
8. Printing platform-aware next steps

It must be safe to run more than once.

## File Boundaries

### New files

- `scripts/bootstrap.mjs`
  Main bootstrap implementation
- `bootstrap.ps1`
  Windows-friendly wrapper that calls the Node entrypoint
- `bootstrap.sh`
  Unix-friendly wrapper that calls the Node entrypoint
- `docs/install.md`
  Expanded installation and troubleshooting guide

### Modified files

- `README.md`
  Replace long manual setup with a short bootstrap-first quick start

## Configuration Rules

Bootstrap must preserve user state:

- never overwrite an existing installed skill directory without an explicit replace strategy
- never overwrite an existing `memory-config.json`
- never write into personal memory stores
- only create missing files from tracked examples/templates

If a destination already exists, bootstrap should report that it was kept.

## Platform Policy

### Required

- Node.js
- npm

### Optional

- PowerShell 7 (`pwsh`)

Behavior:

- if `pwsh` exists, print additional commands for workspace logging setup and task registration
- if `pwsh` does not exist, bootstrap still succeeds and clearly marks workspace logging automation as optional

## Output Contract

Bootstrap output should end with a short checklist that tells the user exactly what to run next, for example:

- register the MCP server
- run package tests
- run package typecheck
- if `pwsh` exists, run daily/session log commands

The output should distinguish:

- completed automatically
- skipped because already present
- optional follow-up steps

## Error Handling

Bootstrap should fail fast on hard blockers:

- missing `node`
- missing `npm`
- missing repository directories or expected tracked files

Bootstrap should continue with warnings for soft blockers:

- `pwsh` missing
- skill destination already exists
- local config already exists

## Testing Strategy

### Automated

Add lightweight tests for bootstrap logic, focused on pure behaviors:

- path resolution
- destination path selection
- no-overwrite behavior
- platform-aware command rendering

The tests do not need to execute real `npm install` or mutate the real user home directory.

### Manual verification

Verify these scenarios:

1. Clean environment with Node only
2. Environment with Node and `pwsh`
3. Re-running bootstrap when config and skill already exist

## Documentation Changes

`README.md` should become bootstrap-first:

- keep the product explanation
- shorten setup instructions to a single recommended command
- link to `docs/install.md` for platform details and troubleshooting

`docs/install.md` should contain:

- prerequisites
- bootstrap commands
- what bootstrap changes on disk
- required post-bootstrap commands
- optional `pwsh` workflow
- common failure cases

## Rollout Notes

This should ship as an incremental improvement, not a redesign of the whole repository.

Existing manual commands remain valid. Bootstrap becomes the default onboarding path, not the only path.
