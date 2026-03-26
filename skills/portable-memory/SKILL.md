---
name: portable-memory
description: Use when the user wants long-term memory, portable project memory, memory recall, memory migration, or a repeatable workflow for storing and retrieving high-value decisions and preferences through codex-memory MCP tools. Trigger this skill when the user asks to remember something for later, recall prior project context, export or import memories across machines, compact noisy memory state, or build a reusable memory workflow.
---

# Portable Memory

## Overview

Use the `codex-memory` MCP tools to make project memory portable, project-aware, and low-noise. Recall before substantial work, store only confirmed high-value information, and prefer repairing or superseding memory over creating duplicate records.

## Workflow

1. Resolve the memory boundary.
   Use `project:<project-id>` for repository-specific decisions and `global` for long-lived user preferences that should survive project changes.
2. Recall before acting.
   Before implementing, reviewing, or continuing a multi-step task, call `memory_recall` with the current task and project scope so prior decisions and constraints are visible.
3. Store only durable value.
   Use `memory_store` for confirmed preferences, decisions, facts, and reusable patterns. Do not store raw terminal noise, speculative guesses, or content that can be reconstructed cheaply from code.
4. Update instead of duplicating.
   If a prior memory is being corrected or replaced, prefer `memory_update`. If history should be preserved, create a new memory only when the old one is truly superseded and then use compaction to mark stale entries.
5. Keep memory portable.
   Use `memory_export` before moving to another machine or environment, and `memory_import` after migration. Use `memory_list` to inspect state and `memory_compact` to clean duplicates and stale low-value items.

## Store Rules

- Store explicit user preferences that are likely to matter again.
- Store project decisions that affect future implementation.
- Store stable facts needed across sessions.
- Default to project scope when unsure.
- Escalate to global scope only when the information is intentionally cross-project.

## Avoid

- Do not store one-off command outputs.
- Do not store uncertain inferences as facts.
- Do not repeat an existing memory with only cosmetic wording changes.
- Do not compact aggressively when important history could be lost.

## Example Triggers

- "Remember this project convention."
- "What did we decide last time about this repo?"
- "Export my memory so I can move to another machine."
- "Import these saved memories."
- "Clean up noisy duplicate memories."
