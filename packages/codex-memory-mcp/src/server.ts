import { homedir } from 'node:os';
import { join } from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

import { createEmbedder } from './core/embedder.js';
import { loadMemoryProfile, resolveRecallScopes } from './core/profile.js';
import {
  createMemoryService,
  type EmbedderLike,
} from './memory-service.js';

function deterministicVector(text: string): number[] {
  const vector = [0, 0, 0, 0];
  for (let i = 0; i < text.length; i++) {
    vector[i % vector.length] += text.charCodeAt(i);
  }
  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
  return vector.map(item => item / norm);
}

function createDeterministicEmbedder(): EmbedderLike {
  return {
    dimensions: 4,
    embedQuery: async text => deterministicVector(text),
    embedPassage: async text => deterministicVector(text),
  };
}

function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getEnvBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function createProductionEmbedder(): EmbedderLike {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    throw new Error('JINA_API_KEY is required for the production memory embedder');
  }

  return createEmbedder({
    provider: 'openai-compatible',
    apiKey,
    model: process.env.CODEX_MEMORY_MODEL || 'jina-embeddings-v5-text-small',
    baseURL: process.env.CODEX_MEMORY_BASE_URL || 'https://api.jina.ai/v1',
    dimensions: getEnvNumber('CODEX_MEMORY_DIMENSIONS', 1024),
    taskQuery: process.env.CODEX_MEMORY_TASK_QUERY || 'retrieval.query',
    taskPassage: process.env.CODEX_MEMORY_TASK_PASSAGE || 'retrieval.passage',
    normalized: getEnvBoolean('CODEX_MEMORY_NORMALIZED', true),
  });
}

function getEmbedder(): EmbedderLike {
  if (process.env.CODEX_MEMORY_TEST_EMBEDDER === 'deterministic') {
    return createDeterministicEmbedder();
  }
  return createProductionEmbedder();
}

function getDbPath(): string {
  return (
    process.env.CODEX_MEMORY_DB_PATH ||
    join(homedir(), '.codex', 'memories', 'lancedb-jina-1024')
  );
}

function getProjectRoot(): string {
  return process.env.CODEX_MEMORY_PROJECT_ROOT || process.cwd();
}

const memoryProfile = await loadMemoryProfile({ cwd: getProjectRoot() });

const memoryService = await createMemoryService({
  dbPath: getDbPath(),
  embedder: getEmbedder(),
  profile: memoryProfile,
  sessionId: process.env.CODEX_MEMORY_SESSION_ID,
});

const server = new McpServer({
  name: 'codex-memory-mcp',
  version: '0.1.0',
});

server.registerTool(
  'memory_profile_resolve',
  {
    description: 'Inspect the resolved memory profile and default recall scopes for this server session.',
    inputSchema: {},
  },
  async () => {
    const recallScopes = resolveRecallScopes(memoryProfile);
    return {
      content: [{ type: 'text', text: `Resolved profile for ${memoryProfile.projectId || 'global'}` }],
      structuredContent: {
        ok: true,
        profile: memoryProfile,
        recallScopes,
      },
    };
  },
);

server.registerTool(
  'memory_store',
  {
    description: 'Store a memory entry for later recall.',
    inputSchema: {
      text: z.string().min(1),
      category: z.enum(['preference', 'fact', 'decision', 'entity', 'other', 'reflection']).optional(),
      scope: z.string().optional(),
      importance: z.number().min(0).max(1).optional(),
    },
  },
  async ({ text, category, scope, importance }) => {
    const memory = await memoryService.store({ text, category, scope, importance });
    return {
      content: [{ type: 'text', text: `Stored memory ${memory.id}` }],
      structuredContent: {
        ok: true,
        memory: {
          id: memory.id,
          text: memory.text,
          category: memory.category,
          scope: memory.scope,
          importance: memory.importance,
          timestamp: memory.timestamp,
        },
      },
    };
  },
);

server.registerTool(
  'memory_recall',
  {
    description: 'Recall relevant memories for a query.',
    inputSchema: {
      query: z.string().min(1),
      scope: z.string().optional(),
      limit: z.number().int().positive().max(20).optional(),
    },
  },
  async ({ query, scope, limit }) => {
    const memories = await memoryService.recall({ query, scope, limit });
    return {
      content: [{ type: 'text', text: `Recalled ${memories.length} memories` }],
      structuredContent: {
        ok: true,
        memories,
      },
    };
  },
);

server.registerTool(
  'memory_list',
  {
    description: 'List memory entries in accessible scopes.',
    inputSchema: {
      scope: z.string().optional(),
      category: z.enum(['preference', 'fact', 'decision', 'entity', 'other', 'reflection']).optional(),
      limit: z.number().int().positive().max(100).optional(),
      offset: z.number().int().min(0).optional(),
    },
  },
  async ({ scope, category, limit, offset }) => {
    const memories = await memoryService.list({ scope, category, limit, offset });
    return {
      content: [{ type: 'text', text: `Listed ${memories.length} memories` }],
      structuredContent: {
        ok: true,
        memories,
      },
    };
  },
);

server.registerTool(
  'memory_export',
  {
    description: 'Export memories to a portable jsonl file.',
    inputSchema: {
      path: z.string().min(1),
      scope: z.string().optional(),
      category: z.enum(['preference', 'fact', 'decision', 'entity', 'other', 'reflection']).optional(),
    },
  },
  async ({ path, scope, category }) => {
    const result = await memoryService.export({ path, scope, category });
    return {
      content: [{ type: 'text', text: `Exported ${result.count} memories` }],
      structuredContent: {
        ok: true,
        ...result,
      },
    };
  },
);

server.registerTool(
  'memory_import',
  {
    description: 'Import memories from a portable jsonl file.',
    inputSchema: {
      path: z.string().min(1),
      mode: z.enum(['skip-existing', 'upsert']).optional(),
      reembed: z.boolean().optional(),
    },
  },
  async ({ path, mode, reembed }) => {
    const result = await memoryService.import({ path, mode, reembed });
    return {
      content: [{ type: 'text', text: `Imported ${result.count} memories` }],
      structuredContent: {
        ok: true,
        ...result,
      },
    };
  },
);

server.registerTool(
  'memory_compact',
  {
    description: 'Compact memories by marking duplicates as superseded and pruning stale low-value items.',
    inputSchema: {
      scope: z.string().optional(),
      scopes: z.array(z.string()).optional(),
      dryRun: z.boolean().optional(),
      pruneBeforeTimestamp: z.number().int().positive().optional(),
    },
  },
  async ({ scope, scopes, dryRun, pruneBeforeTimestamp }) => {
    const result = await memoryService.compact({
      scope,
      scopes,
      dryRun,
      pruneBeforeTimestamp,
    });
    return {
      content: [{ type: 'text', text: `Compacted memories: ${result.changedIds.length} changes` }],
      structuredContent: {
        ok: true,
        ...result,
      },
    };
  },
);

server.registerTool(
  'memory_forget',
  {
    description: 'Delete a memory entry by ID.',
    inputSchema: {
      id: z.string().min(1),
      scope: z.string().optional(),
    },
  },
  async ({ id, scope }) => {
    const deleted = await memoryService.forget({ id, scope });
    return {
      content: [{ type: 'text', text: deleted ? `Deleted memory ${id}` : `Memory ${id} not found` }],
      structuredContent: { ok: deleted },
    };
  },
);

server.registerTool(
  'memory_update',
  {
    description: 'Update an existing memory entry by ID.',
    inputSchema: {
      id: z.string().min(1),
      text: z.string().min(1).optional(),
      importance: z.number().min(0).max(1).optional(),
      category: z.enum(['preference', 'fact', 'decision', 'entity', 'other', 'reflection']).optional(),
      scope: z.string().optional(),
    },
  },
  async ({ id, text, importance, category, scope }) => {
    const memory = await memoryService.update({
      id,
      text,
      importance,
      category,
      scope,
    });

    return {
      content: [{ type: 'text', text: memory ? `Updated memory ${id}` : `Memory ${id} not found` }],
      structuredContent: {
        ok: !!memory,
        memory: memory
          ? {
              id: memory.id,
              text: memory.text,
              category: memory.category,
              scope: memory.scope,
              importance: memory.importance,
              timestamp: memory.timestamp,
            }
          : null,
      },
    };
  },
);

const transport = new StdioServerTransport();

server.connect(transport).catch(error => {
  console.error(error);
  process.exit(1);
});
