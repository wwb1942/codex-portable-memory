import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSmartMetadata, parseSmartMetadata } from '../src/core/smart-metadata.ts';

test('smart metadata backfills kind, stability, and project context', () => {
  const metadata = parseSmartMetadata(undefined, {
    text: 'Use apply_patch for code edits.',
    category: 'preference',
    importance: 0.9,
    timestamp: 1770000000000,
  });

  assert.equal(metadata.kind, 'semantic');
  assert.equal(typeof metadata.stability, 'number');
  assert.equal(Array.isArray(metadata.tags), true);
  assert.equal(metadata.project_id, undefined);
  assert.equal(metadata.session_id, undefined);
});

test('buildSmartMetadata preserves explicit project context and tags', () => {
  const metadata = buildSmartMetadata(
    {
      text: 'Project decisions should be stored in project scope.',
      category: 'decision',
      importance: 0.8,
      timestamp: 1770000000000,
    },
    {
      project_id: 'codex-memory-mcp',
      session_id: 'session-123',
      tags: ['memory', 'project'],
    },
  );

  assert.equal(metadata.project_id, 'codex-memory-mcp');
  assert.equal(metadata.session_id, 'session-123');
  assert.deepEqual(metadata.tags, ['memory', 'project']);
});
