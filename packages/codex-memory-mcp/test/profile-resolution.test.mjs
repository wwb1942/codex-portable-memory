import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadMemoryProfile, resolveRecallScopes } from '../src/core/profile.ts';

test('project profile overrides default scope and fallback scopes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'memory-profile-'));
  await mkdir(join(root, '.codex'));
  await writeFile(
    join(root, '.codex', 'memory-profile.json'),
    JSON.stringify({
      version: 1,
      projectId: 'demo-project',
      defaultScope: 'project:demo-project',
      fallbackScopes: ['global'],
    }),
    'utf8',
  );

  try {
    const profile = await loadMemoryProfile({ cwd: root });
    assert.equal(profile.projectId, 'demo-project');
    assert.deepEqual(resolveRecallScopes(profile), ['project:demo-project', 'global']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
