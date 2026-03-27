import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  buildCommandInvocation,
  getProbeArgs,
  getCodexHome,
  getSkillInstallPath,
  getWorkspaceConfigPath,
  planCopyAction,
  planBootstrapOperations,
  resolveLoggingCommand,
  renderNextSteps,
} from './bootstrap-lib.mjs';

test('getCodexHome prefers CODEX_HOME when provided', () => {
  assert.equal(getCodexHome({ CODEX_HOME: '/tmp/codex-home' }), '/tmp/codex-home');
});

test('buildCommandInvocation uses cmd /c on Windows', () => {
  assert.deepEqual(buildCommandInvocation('npm', ['--version'], 'win32'), {
    command: 'cmd.exe',
    args: ['/c', 'npm', '--version'],
  });
  assert.deepEqual(buildCommandInvocation('pwsh', ['--version'], 'win32'), {
    command: 'cmd.exe',
    args: ['/c', 'pwsh', '--version'],
  });
});

test('buildCommandInvocation leaves commands unchanged off Windows', () => {
  assert.deepEqual(buildCommandInvocation('npm', ['--version'], 'linux'), {
    command: 'npm',
    args: ['--version'],
  });
});

test('getProbeArgs uses command-specific probes', () => {
  assert.deepEqual(getProbeArgs('npm'), ['--version']);
  assert.deepEqual(getProbeArgs('pwsh'), ['-NoLogo', '-NoProfile', '-Command', 'exit 0']);
  assert.deepEqual(getProbeArgs('powershell'), ['-NoLogo', '-NoProfile', '-Command', 'exit 0']);
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

test('resolveLoggingCommand prefers pwsh and falls back to powershell on Windows', () => {
  assert.equal(
    resolveLoggingCommand({
      platform: 'win32',
      hasPwsh: true,
      hasWindowsPowerShell: true,
    }),
    'pwsh'
  );
  assert.equal(
    resolveLoggingCommand({
      platform: 'win32',
      hasPwsh: false,
      hasWindowsPowerShell: true,
    }),
    'powershell'
  );
});

test('renderNextSteps includes logging guidance only when a logging shell is available', () => {
  const withPwsh = renderNextSteps({
    repoRoot: '/repo-root',
    loggingCommand: 'pwsh',
  });
  const withoutPwsh = renderNextSteps({
    repoRoot: '/repo-root',
    loggingCommand: null,
  });

  assert.match(withPwsh, /write-daily-memory/);
  assert.doesNotMatch(withoutPwsh, /write-daily-memory/);
});

test('renderNextSteps prints codex mcp registration command from repo root', () => {
  const output = renderNextSteps({
    repoRoot: 'D:/projects/codex-portable-memory',
    loggingCommand: 'pwsh',
  });

  assert.match(output, /codex mcp add codex-memory/);
  assert.match(output, /packages\/codex-memory-mcp\/src\/server\.ts/);
});

test('planBootstrapOperations resolves tracked sources and user destinations', () => {
  const plan = planBootstrapOperations({
    repoRoot: '/repo-root',
    homeDir: '/home/tester',
    env: {},
  });

  assert.equal(plan.packageDir, path.join('/repo-root', 'packages', 'codex-memory-mcp'));
  assert.equal(plan.skillSourceDir, path.join('/repo-root', 'skills', 'portable-memory'));
  assert.equal(plan.skillDestinationDir, path.join('/home/tester', '.codex', 'skills', 'portable-memory'));
  assert.equal(
    plan.workspaceConfigTemplatePath,
    path.join('/repo-root', 'workspace-memory', 'config', 'memory-config.example.json')
  );
  assert.equal(
    plan.workspaceConfigPath,
    path.join('/repo-root', 'workspace-memory', 'config', 'memory-config.json')
  );
});
