# Codex Memory MCP

Standalone LanceDB-backed portable memory server for Codex.

## What it does

- Stores memories in LanceDB
- Recalls memories with hybrid vector + BM25 search plus project-first re-ranking
- Updates and deletes memories
- Lists memories by scope/category
- Exports and imports portable `jsonl` snapshots
- Compacts duplicate and stale low-value memories
- Uses Jina embeddings in production
- Exposes tools over MCP stdio for Codex

## Commands

```bash
cd packages/codex-memory-mcp
npm test
npm run start
```

## Runtime env

- `JINA_API_KEY`: required for production embedding calls
- `CODEX_MEMORY_DB_PATH`: optional; defaults to `~/.codex/memories/lancedb-jina-1024`
- `CODEX_MEMORY_MODEL`: optional; defaults to `jina-embeddings-v5-text-small`
- `CODEX_MEMORY_BASE_URL`: optional; defaults to `https://api.jina.ai/v1`
- `CODEX_MEMORY_PROJECT_ROOT`: optional; overrides the project root used to discover `.codex/memory-profile.json`
- `CODEX_MEMORY_SESSION_ID`: optional; stamps stored memories with the current session id
- `CODEX_MEMORY_TEST_EMBEDDER`: optional; set to `deterministic` in tests

## Memory Tools

The MCP server exposes these tools:

- `memory_store`
- `memory_recall`
- `memory_list`
- `memory_profile_resolve`
- `memory_update`
- `memory_forget`
- `memory_export`
- `memory_import`
- `memory_compact`

## Profile Discovery

Memory profiles are loaded in this order:

1. `<project>/.codex/memory-profile.json`
2. `~/.codex/memory/profiles/default.json`
3. built-in default profile (`global` scope only)

Use project scope for repo-specific decisions and `global` for long-lived preferences that should survive across repositories.

An example project profile is available at [`docs/examples/memory-profile.json`](docs/examples/memory-profile.json).

Use `memory_profile_resolve` inside Codex to inspect which profile was loaded for the current MCP session and which scopes default recall will search.

## Migration Workflow

Export memory before switching machines or environments:

```bash
memory_export path="C:\temp\codex-memory.jsonl" scope="project:your-project"
```

Import it on the target machine:

```bash
memory_import path="C:\temp\codex-memory.jsonl" mode="skip-existing" reembed=true
```

Use `memory_compact` after large imports or long-running usage to clean duplicate and stale low-value memories.

## Skill

The companion skill lives in the repository at:

```text
skills/portable-memory
```

Install it into your local Codex skills directory before use.

The skill standardizes this workflow:

1. Recall before substantial work.
2. Store only confirmed high-value information.
3. Prefer project scope unless the memory is intentionally cross-project.
4. Export/import for migration and compact for cleanup.

## Codex Registration

Register the MCP server from the repository root:

```bash
codex mcp add codex-memory -- node --import tsx <repo-root>/packages/codex-memory-mcp/src/server.ts
```

Open a new Codex session to let the MCP server appear in the tool set.
