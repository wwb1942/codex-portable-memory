import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverEntry = join(__dirname, '..', 'src', 'server.ts');

function createRpcHarness(child) {
  let nextId = 1;
  let buffer = '';
  const pending = new Map();

  child.stdout.on('data', chunk => {
    buffer += chunk.toString();
    while (buffer.includes('\n')) {
      const newlineIndex = buffer.indexOf('\n');
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id && pending.has(message.id)) {
        pending.get(message.id).resolve(message);
        pending.delete(message.id);
      }
    }
  });

  child.stderr.on('data', chunk => {
    const text = chunk.toString();
    for (const { reject } of pending.values()) {
      reject(new Error(text));
    }
    pending.clear();
  });

  return {
    async call(method, params) {
      const id = nextId++;
      const payload = { jsonrpc: '2.0', id, method, params };
      const promise = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
      child.stdin.write(`${JSON.stringify(payload)}\n`);
      return promise;
    },
  };
}

test('MCP server exposes the resolved memory profile', async () => {
  const dbPath = await mkdtemp(join(tmpdir(), 'codex-memory-profile-tool-db-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-memory-profile-tool-root-'));
  await mkdir(join(projectRoot, '.codex'));
  await writeFile(
    join(projectRoot, '.codex', 'memory-profile.json'),
    JSON.stringify({
      version: 1,
      projectId: 'resolved-project',
      defaultScope: 'project:resolved-project',
      fallbackScopes: ['global'],
      recallPolicy: {
        maxScopes: 2,
        preferProject: true,
      },
    }),
    'utf8',
  );

  const child = spawn(process.execPath, ['--import', 'tsx', serverEntry], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      CODEX_MEMORY_TEST_EMBEDDER: 'deterministic',
      CODEX_MEMORY_DB_PATH: dbPath,
      CODEX_MEMORY_PROJECT_ROOT: projectRoot,
    },
  });

  const rpc = createRpcHarness(child);

  try {
    await rpc.call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'profile-resolve-client', version: '0.1.0' },
    });

    const tools = await rpc.call('tools/list', {});
    const toolNames = tools.result.tools.map(tool => tool.name);
    assert.equal(toolNames.includes('memory_profile_resolve'), true);

    const resolved = await rpc.call('tools/call', {
      name: 'memory_profile_resolve',
      arguments: {},
    });

    assert.equal(resolved.result.structuredContent.ok, true);
    assert.equal(
      resolved.result.structuredContent.profile.defaultScope,
      'project:resolved-project',
    );
    assert.deepEqual(
      resolved.result.structuredContent.recallScopes,
      ['project:resolved-project', 'global'],
    );
  } finally {
    child.kill();
    await rm(dbPath, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});
