import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createMemoryService } from '../src/memory-service.ts';
import { MemoryStore } from '../src/core/store.ts';
import { buildSmartMetadata, parseSmartMetadata, stringifySmartMetadata } from '../src/core/smart-metadata.ts';

function deterministicVector(text) {
  const vector = [0, 0, 0, 0];
  for (let i = 0; i < text.length; i++) {
    vector[i % vector.length] += text.charCodeAt(i);
  }
  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
  return vector.map(item => item / norm);
}

test('compaction keeps the stronger duplicate memory and invalidates the weaker one', async () => {
  const dbPath = await mkdtemp(join(tmpdir(), 'memory-compact-'));
  const embedder = {
    dimensions: 4,
    embedQuery: async text => deterministicVector(text),
    embedPassage: async text => deterministicVector(text),
  };
  const service = await createMemoryService({ dbPath, embedder });

  try {
    const older = await service.store({
      text: 'The deployment target is production.',
      category: 'decision',
      scope: 'project:demo',
      importance: 0.6,
    });
    const newer = await service.store({
      text: 'The deployment target is production.',
      category: 'decision',
      scope: 'project:demo',
      importance: 0.9,
    });

    const result = await service.compact({
      scopes: ['project:demo'],
    });

    assert.equal(result.duplicatesMerged, 1);

    const memories = await service.list({
      scope: 'project:demo',
      limit: 10,
    });
    const olderRecord = memories.find(memory => memory.id === older.id);
    const newerRecord = memories.find(memory => memory.id === newer.id);

    assert.ok(olderRecord);
    assert.ok(newerRecord);

    const olderMetadata = parseSmartMetadata(olderRecord.metadata, olderRecord);
    assert.equal(olderMetadata.superseded_by, newer.id);

    const recalled = await service.recall({
      query: 'deployment target',
      scope: 'project:demo',
      limit: 5,
    });

    assert.equal(recalled.length, 1);
    assert.equal(recalled[0].id, newer.id);
  } finally {
    await rm(dbPath, { recursive: true, force: true });
  }
});

test('compaction prunes stale low-value episodic memories', async () => {
  const dbPath = await mkdtemp(join(tmpdir(), 'memory-prune-'));
  const store = new MemoryStore({ dbPath, vectorDim: 4 });
  const embedder = {
    dimensions: 4,
    embedQuery: async text => deterministicVector(text),
    embedPassage: async text => deterministicVector(text),
  };
  const service = await createMemoryService({ dbPath, embedder });
  const staleTimestamp = Date.now() - 120 * 24 * 60 * 60 * 1000;

  try {
    const stale = await store.store({
      text: 'Temporary note from an old debugging session.',
      vector: deterministicVector('Temporary note from an old debugging session.'),
      category: 'other',
      scope: 'project:demo',
      importance: 0.1,
      metadata: stringifySmartMetadata(
        buildSmartMetadata(
          {
            text: 'Temporary note from an old debugging session.',
            category: 'other',
            importance: 0.1,
            timestamp: staleTimestamp,
          },
          {
            kind: 'episodic',
            stability: 0.1,
            confidence: 0.2,
            last_accessed_at: staleTimestamp,
          },
        ),
      ),
    });

    const result = await service.compact({
      scopes: ['project:demo'],
      pruneBeforeTimestamp: Date.now() - 90 * 24 * 60 * 60 * 1000,
    });

    assert.equal(result.lowValuePruned, 1);

    const memories = await service.list({
      scope: 'project:demo',
      limit: 10,
    });

    assert.equal(memories.some(memory => memory.id === stale.id), false);
  } finally {
    await rm(dbPath, { recursive: true, force: true });
  }
});
