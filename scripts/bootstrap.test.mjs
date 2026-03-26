import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  getCodexHome,
  getSkillInstallPath,
  getWorkspaceConfigPath,
  planCopyAction,
  renderNextSteps,
} from './bootstrap-lib.mjs';

test('getCodexHome prefers CODEX_HOME when provided', () => {
  assert.equal(getCodexHome({ CODEX_HOME: '/tmp/codex-home' }), '/tmp/codex-home');
});

test('getSkillInstallPath uses the codex home skills directory', () => {
  const actual = getSkillInstallPath({
    env: {},
    homeDir: '/home/tester',
  });

  assert.equal(actual, path.join('/home/tester', '.codex', 'skills', 'portable-memory'));
});

test('getWorkspaceConfigPath targets the tracked workspace config file', () => {
  const actual = getWorkspaceConfigPath('/repo-root');

  assert.equal(actual, path.join('/repo-root', 'workspace-memory', 'config', 'memory-config.json'));
});

test('planCopyAction marks missing destination as create', () => {
  const action = planCopyAction({
    sourceExists: true,
    destinationExists: false,
    label: 'workspace config',
  });

  assert.equal(action.kind, 'create');
});

test('planCopyAction preserves existing destination', () => {
  const action = planCopyAction({
    sourceExists: true,
    destinationExists: true,
    label: 'workspace config',
  });

  assert.equal(action.kind, 'keep');
});

test('renderNextSteps includes pwsh guidance only when available', () => {
  const withPwsh = renderNextSteps({
    repoRoot: '/repo-root',
    hasPwsh: true,
  });
  const withoutPwsh = renderNextSteps({
    repoRoot: '/repo-root',
    hasPwsh: false,
  });

  assert.match(withPwsh, /write-daily-memory/);
  assert.doesNotMatch(withoutPwsh, /write-daily-memory/);
});

test('renderNextSteps prints codex mcp registration command from repo root', () => {
  const output = renderNextSteps({
    repoRoot: 'D:/projects/codex-portable-memory',
    hasPwsh: true,
  });

  assert.match(output, /codex mcp add codex-memory/);
  assert.match(output, /packages\/codex-memory-mcp\/src\/server\.ts/);
});
