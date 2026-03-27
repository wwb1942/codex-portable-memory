import os from 'node:os';
import path from 'node:path';

export function getCodexHome(env = process.env) {
  return env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

export function getProbeArgs(command) {
  if (command === 'pwsh' || command === 'powershell') {
    return ['-NoLogo', '-NoProfile', '-Command', 'exit 0'];
  }

  return ['--version'];
}

export function buildCommandInvocation(command, args = [], platform = process.platform) {
  if (platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/c', command, ...args],
    };
  }

  return {
    command,
    args,
  };
}

export function getSkillInstallPath({ env = process.env, homeDir = os.homedir() } = {}) {
  const codexHome = env.CODEX_HOME || path.join(homeDir, '.codex');
  return path.join(codexHome, 'skills', 'portable-memory');
}

export function getWorkspaceConfigPath(repoRoot) {
  return path.join(repoRoot, 'workspace-memory', 'config', 'memory-config.json');
}

export function planBootstrapOperations({
  repoRoot,
  homeDir = os.homedir(),
  env = process.env,
}) {
  return {
    packageDir: path.join(repoRoot, 'packages', 'codex-memory-mcp'),
    skillSourceDir: path.join(repoRoot, 'skills', 'portable-memory'),
    skillDestinationDir: getSkillInstallPath({ env, homeDir }),
    workspaceConfigTemplatePath: path.join(
      repoRoot,
      'workspace-memory',
      'config',
      'memory-config.example.json'
    ),
    workspaceConfigPath: getWorkspaceConfigPath(repoRoot),
    projectMemoryProfileTemplatePath: path.join(repoRoot, 'examples', 'memory-profile.json'),
    projectMemoryProfilePath: path.join(repoRoot, '.codex', 'memory-profile.json'),
  };
}

export function planCopyAction({ sourceExists, destinationExists, label }) {
  if (!sourceExists) {
    return {
      kind: 'error',
      label,
      reason: 'source-missing',
    };
  }

  if (destinationExists) {
    return {
      kind: 'keep',
      label,
    };
  }

  return {
    kind: 'create',
    label,
  };
}

export function resolveLoggingCommand({
  platform = process.platform,
  hasPwsh = false,
  hasWindowsPowerShell = false,
}) {
  if (hasPwsh) {
    return 'pwsh';
  }

  if (platform === 'win32' && hasWindowsPowerShell) {
    return 'powershell';
  }

  return null;
}

export function renderNextSteps({ repoRoot, loggingCommand }) {
  const serverPath = path.posix.join(
    repoRoot.replace(/\\/g, '/'),
    'packages',
    'codex-memory-mcp',
    'src',
    'server.ts'
  );

  const steps = [
    'Next steps:',
    `- Register MCP: codex mcp add codex-memory -- node --import tsx ${serverPath}`,
    `- Verify package: cd ${repoRoot.replace(/\\/g, '/')}/packages/codex-memory-mcp && npm test && npm run typecheck`,
  ];

  if (loggingCommand) {
    steps.push(
      `- Optional logging: ${loggingCommand} -ExecutionPolicy Bypass -File ${repoRoot.replace(/\\/g, '/')}/workspace-memory/scripts/write-daily-memory.ps1`
    );
  }

  return `${steps.join('\n')}\n`;
}
