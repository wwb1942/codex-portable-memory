import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createMemoryService } from '../src/memory-service.ts';

function deterministicVector(text) {
  const vector = [0, 0, 0, 0];
  for (let i = 0; i < text.length; i++) {
    vector[i % vector.length] += text.charCodeAt(i);
  }
  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
  return vector.map(item => item / norm);
}

test('memory export and import preserves text, scope, and metadata', async () => {
  const sourceDb = await mkdtemp(join(tmpdir(), 'memory-export-src-'));
  const targetDb = await mkdtemp(join(tmpdir(), 'memory-export-dst-'));
  const exportPath = join(tmpdir(), `memory-export-${Date.now()}.jsonl`);

  const embedder = {
    dimensions: 4,
    embedQuery: async text => deterministicVector(text),
    embedPassage: async text => deterministicVector(text),
  };

  const sourceService = await createMemoryService({ dbPath: sourceDb, embedder });
  const targetService = await createMemoryService({ dbPath: targetDb, embedder });

  try {
    await sourceService.store({
      text: 'Always export project memory before migrating machines.',
      category: 'preference',
      scope: 'project:demo',
      importance: 0.95,
      tags: ['memory', 'migration'],
    });

    const exported = await sourceService.export({
      path: exportPath,
      scopes: ['project:demo'],
    });

    assert.equal(exported.count, 1);
    const raw = await readFile(exportPath, 'utf8');
    assert.match(raw, /"scope":"project:demo"/);

    const imported = await targetService.import({
      path: exportPath,
      mode: 'skip-existing',
      reembed: true,
    });

    assert.equal(imported.count, 1);

    const recalled = await targetService.recall({
      query: 'migrating machines',
      scope: 'project:demo',
      limit: 5,
    });

    assert.equal(recalled.length, 1);
    assert.match(recalled[0].text, /export project memory/);
  } finally {
    await rm(sourceDb, { recursive: true, force: true });
    await rm(targetDb, { recursive: true, force: true });
    await rm(exportPath, { force: true });
  }
});
