import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createMemoryService } from '../src/memory-service.ts';
import { MemoryStore } from '../src/core/store.ts';
import { buildSmartMetadata, stringifySmartMetadata } from '../src/core/smart-metadata.ts';

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
    await service.store({
      text: 'The package manager for this project is pnpm.',
      scope: 'global',
      category: 'preference',
      importance: 0.7,
    });
    await service.store({
      text: 'The package manager for this project is npm.',
      scope: 'project:demo',
      category: 'decision',
      importance: 0.8,
    });

    const results = await service.recall({ query: 'package manager', limit: 5 });
    assert.equal(results[0].scope, 'project:demo');
  } finally {
    await rm(dbPath, { recursive: true, force: true });
  }
});

test('recall suppresses superseded memories by default', async () => {
  const dbPath = await mkdtemp(join(tmpdir(), 'memory-superseded-'));
  const store = new MemoryStore({ dbPath, vectorDim: 4 });
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
    },
  });

  try {
    await store.store({
      text: 'The deployment target is staging.',
      vector: [1, 0, 0, 0],
      category: 'decision',
      scope: 'project:demo',
      importance: 0.8,
      metadata: stringifySmartMetadata(
        buildSmartMetadata(
          {
            text: 'The deployment target is staging.',
            category: 'decision',
            importance: 0.8,
            timestamp: Date.now() - 10_000,
          },
          {
            superseded_by: 'new-deployment-memory',
          },
        ),
      ),
    });

    await service.store({
      text: 'The deployment target is production.',
      scope: 'project:demo',
      category: 'decision',
      importance: 0.9,
    });

    const results = await service.recall({ query: 'deployment target', limit: 5 });
    assert.equal(results.length, 1);
    assert.match(results[0].text, /production/);
  } finally {
    await rm(dbPath, { recursive: true, force: true });
  }
});
