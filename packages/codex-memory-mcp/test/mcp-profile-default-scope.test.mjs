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
      const payload = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const promise = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });

      child.stdin.write(`${JSON.stringify(payload)}\n`);
      return promise;
    },
  };
}

test('MCP server respects project memory profile defaults over stdio', async () => {
  const dbPath = await mkdtemp(join(tmpdir(), 'codex-memory-profile-db-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'codex-memory-profile-root-'));
  await mkdir(join(projectRoot, '.codex'));
  await writeFile(
    join(projectRoot, '.codex', 'memory-profile.json'),
    JSON.stringify({
      version: 1,
      projectId: 'smoke-project',
      defaultScope: 'project:smoke-project',
      fallbackScopes: ['global'],
      recallPolicy: {
        maxScopes: 2,
        preferProject: true,
      },
    }),
    'utf8',
  );

  const child = spawn(
    process.execPath,
    ['--import', 'tsx', serverEntry],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        CODEX_MEMORY_TEST_EMBEDDER: 'deterministic',
        CODEX_MEMORY_DB_PATH: dbPath,
        CODEX_MEMORY_PROJECT_ROOT: projectRoot,
      },
    }
  );

  const rpc = createRpcHarness(child);

  try {
    await rpc.call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'profile-test-client', version: '0.1.0' },
    });

    const storedProject = await rpc.call('tools/call', {
      name: 'memory_store',
      arguments: {
        text: 'Default project memory should land in the project scope.',
        category: 'decision',
        importance: 0.8,
      },
    });

    const storedGlobal = await rpc.call('tools/call', {
      name: 'memory_store',
      arguments: {
        text: 'Global memory should stay in global scope.',
        category: 'preference',
        scope: 'global',
        importance: 0.7,
      },
    });

    assert.equal(
      storedProject.result.structuredContent.memory.scope,
      'project:smoke-project',
    );
    assert.equal(storedGlobal.result.structuredContent.memory.scope, 'global');

    const recalled = await rpc.call('tools/call', {
      name: 'memory_recall',
      arguments: {
        query: 'scope memory',
        limit: 5,
      },
    });

    const memories = recalled.result.structuredContent.memories;
    assert.equal(memories[0].scope, 'project:smoke-project');
    assert.equal(memories[1].scope, 'global');
  } finally {
    child.kill();
    await rm(dbPath, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});
