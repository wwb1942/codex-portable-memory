import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createMemoryService } from '../src/memory-service.ts';
import { parseSmartMetadata } from '../src/core/smart-metadata.ts';

function deterministicVector(text) {
  const vector = [0, 0, 0, 0];
  for (let i = 0; i < text.length; i++) {
    vector[i % vector.length] += text.charCodeAt(i);
  }
  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
  return vector.map(item => item / norm);
}

test('memory service can store, recall, update and forget memories', async () => {
  const dbPath = await mkdtemp(join(tmpdir(), 'codex-memory-mcp-'));

  const embedder = {
    dimensions: 4,
    embedQuery: async text => deterministicVector(text),
    embedPassage: async text => deterministicVector(text),
  };

  const service = await createMemoryService({
    dbPath,
    embedder,
  });

  try {
    const stored = await service.store({
      text: 'The preferred SQL snapshot date is 2025-12-31.',
      category: 'fact',
      scope: 'custom:sql',
      importance: 0.9,
    });

    assert.ok(stored.id);
    const storedMetadata = parseSmartMetadata(stored.metadata, stored);
    assert.equal(storedMetadata.kind, 'episodic');
    assert.equal(typeof storedMetadata.stability, 'number');
    assert.deepEqual(storedMetadata.tags, []);

    const recalled = await service.recall({
      query: 'preferred snapshot date',
      scope: 'custom:sql',
      limit: 5,
    });

    assert.equal(recalled.length, 1);
    assert.match(recalled[0].text, /2025-12-31/);

    const updated = await service.update({
      id: stored.id,
      text: 'The preferred SQL snapshot date is 2026-03-31.',
    });

    assert.equal(updated?.id, stored.id);

    const recalledAfterUpdate = await service.recall({
      query: 'preferred snapshot date',
      scope: 'custom:sql',
      limit: 5,
    });

    assert.match(recalledAfterUpdate[0].text, /2026-03-31/);

    const deleted = await service.forget({
      id: stored.id,
      scope: 'custom:sql',
    });

    assert.equal(deleted, true);

    const recalledAfterDelete = await service.recall({
      query: 'preferred snapshot date',
      scope: 'custom:sql',
      limit: 5,
    });

    assert.equal(recalledAfterDelete.length, 0);
  } finally {
    await rm(dbPath, { recursive: true, force: true });
  }
});
