import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

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
  assert.equal(
    plan.projectMemoryProfileTemplatePath,
    path.join('/repo-root', 'examples', 'memory-profile.json')
  );
  assert.equal(
    plan.projectMemoryProfilePath,
    path.join('/repo-root', '.codex', 'memory-profile.json')
  );
});

test('bootstrap CLI creates and then preserves the project memory profile', async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'portable-memory-bootstrap-'));
  const repoRoot = path.join(fixtureRoot, 'repo');
  const scriptsDir = path.join(repoRoot, 'scripts');
  const packageDir = path.join(repoRoot, 'packages', 'codex-memory-mcp');
  const skillDir = path.join(repoRoot, 'skills', 'portable-memory');
  const workspaceConfigDir = path.join(repoRoot, 'workspace-memory', 'config');
  const examplesDir = path.join(repoRoot, 'examples');
  const fakeBinDir = path.join(fixtureRoot, 'bin');
  const fakeCodexHome = path.join(fixtureRoot, 'codex-home');
  const projectProfilePath = path.join(repoRoot, '.codex', 'memory-profile.json');

  await fs.mkdir(scriptsDir, { recursive: true });
  await fs.mkdir(packageDir, { recursive: true });
  await fs.mkdir(skillDir, { recursive: true });
  await fs.mkdir(workspaceConfigDir, { recursive: true });
  await fs.mkdir(examplesDir, { recursive: true });
  await fs.mkdir(fakeBinDir, { recursive: true });

  await fs.copyFile(
    path.join(process.cwd(), 'scripts', 'bootstrap.mjs'),
    path.join(scriptsDir, 'bootstrap.mjs')
  );
  await fs.copyFile(
    path.join(process.cwd(), 'scripts', 'bootstrap-lib.mjs'),
    path.join(scriptsDir, 'bootstrap-lib.mjs')
  );
  await fs.writeFile(path.join(packageDir, 'package.json'), '{\"name\":\"fixture-package\"}\n');
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# portable-memory\n');
  await fs.writeFile(
    path.join(workspaceConfigDir, 'memory-config.example.json'),
    '{\"version\":1}\n'
  );
  await fs.writeFile(
    path.join(examplesDir, 'memory-profile.json'),
    '{\"version\":1,\"projectId\":\"fixture-project\",\"defaultScope\":\"project:fixture-project\"}\n'
  );
  await fs.writeFile(
    path.join(fakeBinDir, 'npm.cmd'),
    '@echo off\r\nif "%1"=="--version" exit /b 0\r\nif "%1"=="install" exit /b 0\r\nexit /b 0\r\n'
  );

  async function runBootstrap() {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(scriptsDir, 'bootstrap.mjs')], {
        cwd: repoRoot,
        env: {
          ...process.env,
          CODEX_HOME: fakeCodexHome,
          PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ''}`,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', chunk => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', code => {
        resolve({
          code,
          stdout,
          stderr,
        });
      });
    });
  }

  const firstRun = await runBootstrap();

  assert.equal(firstRun.code, 0, firstRun.stderr);
  assert.match(firstRun.stdout, /done created project profile at /);
  assert.equal(
    await fs.readFile(projectProfilePath, 'utf8'),
    '{"version":1,"projectId":"fixture-project","defaultScope":"project:fixture-project"}\n'
  );

  const secondRun = await runBootstrap();

  assert.equal(secondRun.code, 0, secondRun.stderr);
  assert.match(secondRun.stdout, /kept existing project profile at /);

  await fs.rm(fixtureRoot, { recursive: true, force: true });
});
