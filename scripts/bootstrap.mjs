#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildCommandInvocation,
  getProbeArgs,
  planBootstrapOperations,
  planCopyAction,
  resolveLoggingCommand,
  renderNextSteps,
} from './bootstrap-lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const invocation = buildCommandInvocation(command, args);
    const child = spawn(invocation.command, invocation.args, {
      cwd: options.cwd,
      stdio: options.stdio || 'inherit',
      shell: false,
    });

    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

function probeCommand(command, args = getProbeArgs(command)) {
  return new Promise(resolve => {
    const invocation = buildCommandInvocation(command, args);
    const child = spawn(invocation.command, invocation.args, {
      stdio: 'ignore',
      shell: false,
    });

    child.on('error', () => resolve(false));
    child.on('close', code => resolve(code === 0));
  });
}

async function copyDirectoryIfMissing(sourceDir, destinationDir) {
  await fs.mkdir(path.dirname(destinationDir), { recursive: true });
  await fs.cp(sourceDir, destinationDir, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
}

async function copyFileIfMissing(sourceFile, destinationFile) {
  await fs.mkdir(path.dirname(destinationFile), { recursive: true });
  await fs.copyFile(sourceFile, destinationFile);
}

function logOutcome(prefix, message) {
  process.stdout.write(`${prefix} ${message}\n`);
}

async function main() {
  const hasNpm = await probeCommand('npm');

  if (!hasNpm) {
    throw new Error('npm is required but was not found in PATH.');
  }

  const hasPwsh = await probeCommand('pwsh');
  const hasWindowsPowerShell =
    process.platform === 'win32' ? await probeCommand('powershell') : false;
  const loggingCommand = resolveLoggingCommand({
    platform: process.platform,
    hasPwsh,
    hasWindowsPowerShell,
  });
  const operations = planBootstrapOperations({ repoRoot });

  await runCommand('npm', ['install'], {
    cwd: operations.packageDir,
  });
  logOutcome('done', `installed dependencies in ${operations.packageDir}`);

  const skillSourceExists = await fs
    .access(operations.skillSourceDir)
    .then(() => true)
    .catch(() => false);
  const skillDestinationExists = await fs
    .access(operations.skillDestinationDir)
    .then(() => true)
    .catch(() => false);
  const skillAction = planCopyAction({
    sourceExists: skillSourceExists,
    destinationExists: skillDestinationExists,
    label: 'portable-memory skill',
  });

  if (skillAction.kind === 'error') {
    throw new Error(`Missing tracked source for ${skillAction.label}.`);
  }

  if (skillAction.kind === 'create') {
    await copyDirectoryIfMissing(operations.skillSourceDir, operations.skillDestinationDir);
    logOutcome('done', `installed skill to ${operations.skillDestinationDir}`);
  } else {
    logOutcome('kept', `existing skill at ${operations.skillDestinationDir}`);
  }

  const configTemplateExists = await fs
    .access(operations.workspaceConfigTemplatePath)
    .then(() => true)
    .catch(() => false);
  const configDestinationExists = await fs
    .access(operations.workspaceConfigPath)
    .then(() => true)
    .catch(() => false);
  const configAction = planCopyAction({
    sourceExists: configTemplateExists,
    destinationExists: configDestinationExists,
    label: 'workspace config',
  });

  if (configAction.kind === 'error') {
    throw new Error(`Missing tracked source for ${configAction.label}.`);
  }

  if (configAction.kind === 'create') {
    await copyFileIfMissing(operations.workspaceConfigTemplatePath, operations.workspaceConfigPath);
    logOutcome('done', `created config at ${operations.workspaceConfigPath}`);
  } else {
    logOutcome('kept', `existing config at ${operations.workspaceConfigPath}`);
  }

  const projectProfileTemplateExists = await fs
    .access(operations.projectMemoryProfileTemplatePath)
    .then(() => true)
    .catch(() => false);
  const projectProfileDestinationExists = await fs
    .access(operations.projectMemoryProfilePath)
    .then(() => true)
    .catch(() => false);
  const projectProfileAction = planCopyAction({
    sourceExists: projectProfileTemplateExists,
    destinationExists: projectProfileDestinationExists,
    label: 'project memory profile',
  });

  if (projectProfileAction.kind === 'error') {
    throw new Error(`Missing tracked source for ${projectProfileAction.label}.`);
  }

  if (projectProfileAction.kind === 'create') {
    await copyFileIfMissing(
      operations.projectMemoryProfileTemplatePath,
      operations.projectMemoryProfilePath
    );
    logOutcome('done', `created project profile at ${operations.projectMemoryProfilePath}`);
  } else {
    logOutcome('kept', `existing project profile at ${operations.projectMemoryProfilePath}`);
  }

  if (!loggingCommand) {
    logOutcome('warn', 'No supported PowerShell command was found; logging setup remains optional.');
  }

  process.stdout.write('\n');
  process.stdout.write(renderNextSteps({ repoRoot, loggingCommand }));
}

main().catch(error => {
  process.stderr.write(`error ${error.message}\n`);
  process.exitCode = 1;
});
