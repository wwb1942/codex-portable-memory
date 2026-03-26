import { readFile, writeFile } from 'node:fs/promises';

import { buildSmartMetadata, stringifySmartMetadata } from './smart-metadata.js';
import type { MemoryEntry } from './store.js';

export interface PortableMemoryRecord {
  schemaVersion: number;
  id: string;
  text: string;
  vector?: number[];
  category: MemoryEntry['category'];
  scope: string;
  importance: number;
  timestamp: number;
  metadata?: Record<string, unknown> | string;
}

export async function exportMemoriesToJsonl(
  path: string,
  memories: MemoryEntry[],
): Promise<{ path: string; count: number }> {
  const lines = memories.map(memory => {
    let metadata: Record<string, unknown> | string | undefined;
    if (memory.metadata) {
      try {
        metadata = JSON.parse(memory.metadata);
      } catch {
        metadata = memory.metadata;
      }
    }

    const record: PortableMemoryRecord = {
      schemaVersion: 1,
      id: memory.id,
      text: memory.text,
      vector: memory.vector.length > 0 ? memory.vector : undefined,
      category: memory.category,
      scope: memory.scope,
      importance: memory.importance,
      timestamp: memory.timestamp,
      metadata,
    };

    return JSON.stringify(record);
  });

  await writeFile(path, lines.join('\n'), 'utf8');
  return { path, count: memories.length };
}

export async function importMemoriesFromJsonl(path: string): Promise<PortableMemoryRecord[]> {
  const raw = await readFile(path, 'utf8');
  if (!raw.trim()) {
    return [];
  }

  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        const parsed = JSON.parse(line);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('line is not an object');
        }
        return parsed as PortableMemoryRecord;
      } catch (error) {
        throw new Error(
          `Invalid memory import payload at line ${index + 1}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });
}

export function normalizeImportedMemoryRecord(
  record: PortableMemoryRecord,
): Omit<MemoryEntry, 'vector'> & { vector?: number[] } {
  const metadata =
    typeof record.metadata === 'string'
      ? record.metadata
      : JSON.stringify(record.metadata || {});

  return {
    id: record.id,
    text: record.text,
    vector: Array.isArray(record.vector) ? record.vector : undefined,
    category: record.category || 'fact',
    scope: record.scope || 'global',
    importance:
      typeof record.importance === 'number' && Number.isFinite(record.importance)
        ? record.importance
        : 0.7,
    timestamp:
      typeof record.timestamp === 'number' && Number.isFinite(record.timestamp)
        ? record.timestamp
        : Date.now(),
    metadata: stringifySmartMetadata(
      buildSmartMetadata(
        {
          text: record.text,
          category: record.category || 'fact',
          importance:
            typeof record.importance === 'number' && Number.isFinite(record.importance)
              ? record.importance
              : 0.7,
          timestamp:
            typeof record.timestamp === 'number' && Number.isFinite(record.timestamp)
              ? record.timestamp
              : Date.now(),
          metadata,
        },
        {},
      ),
    ),
  };
}
