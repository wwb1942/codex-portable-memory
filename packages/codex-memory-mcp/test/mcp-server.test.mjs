import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
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

test('MCP server can execute memory tool round-trip over stdio', async () => {
  const dbPath = await mkdtemp(join(tmpdir(), 'codex-memory-mcp-server-'));
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
      },
    }
  );

  const rpc = createRpcHarness(child);

  try {
    const initialize = await rpc.call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '0.1.0' },
    });
    assert.equal(initialize.result.serverInfo.name, 'codex-memory-mcp');

    const tools = await rpc.call('tools/list', {});
    const toolNames = tools.result.tools.map(tool => tool.name);
    assert.deepEqual(
      toolNames.sort(),
      [
        'memory_compact',
        'memory_export',
        'memory_forget',
        'memory_import',
        'memory_list',
        'memory_profile_resolve',
        'memory_recall',
        'memory_store',
        'memory_update',
      ].sort(),
    );

    const stored = await rpc.call('tools/call', {
      name: 'memory_store',
      arguments: {
        text: 'The preferred SQL snapshot date is 2025-12-31.',
        category: 'fact',
        scope: 'custom:sql',
        importance: 0.9,
      },
    });

    assert.equal(stored.result.structuredContent.ok, true);
    assert.ok(stored.result.structuredContent.memory.id);

    const recalled = await rpc.call('tools/call', {
      name: 'memory_recall',
      arguments: {
        query: 'preferred snapshot date',
        scope: 'custom:sql',
        limit: 5,
      },
    });

    assert.equal(recalled.result.structuredContent.ok, true);
    assert.equal(recalled.result.structuredContent.memories.length, 1);
    assert.match(recalled.result.structuredContent.memories[0].text, /2025-12-31/);

    const deleted = await rpc.call('tools/call', {
      name: 'memory_forget',
      arguments: {
        id: stored.result.structuredContent.memory.id,
        scope: 'custom:sql',
      },
    });

    assert.equal(deleted.result.structuredContent.ok, true);
  } finally {
    child.kill();
    await rm(dbPath, { recursive: true, force: true });
  }
});
