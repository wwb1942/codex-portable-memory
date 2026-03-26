import os from 'node:os';
import path from 'node:path';

export function getCodexHome(env = process.env) {
  return env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

export function getSkillInstallPath({ env = process.env, homeDir = os.homedir() } = {}) {
  const codexHome = env.CODEX_HOME || path.join(homeDir, '.codex');
  return path.join(codexHome, 'skills', 'portable-memory');
}

export function getWorkspaceConfigPath(repoRoot) {
  return path.join(repoRoot, 'workspace-memory', 'config', 'memory-config.json');
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

export function renderNextSteps({ repoRoot, hasPwsh }) {
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

  if (hasPwsh) {
    steps.push(
      `- Optional logging: pwsh -File ${repoRoot.replace(/\\/g, '/')}/workspace-memory/scripts/write-daily-memory.ps1`
    );
  }

  return `${steps.join('\n')}\n`;
}
