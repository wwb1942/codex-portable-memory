import { isMemoryActiveAt, parseSmartMetadata } from './smart-metadata.js';
import type { MemoryEntry, MemoryStore } from './store.js';

export interface CompactMemoryInput {
  scopes: string[];
  dryRun?: boolean;
  pruneBeforeTimestamp?: number;
}

export interface CompactMemoryResult {
  duplicatesMerged: number;
  supersedesRepaired: number;
  lowValuePruned: number;
  changedIds: string[];
}

function normalizeDuplicateText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}

function sortByStrength(memories: MemoryEntry[]): MemoryEntry[] {
  return [...memories].sort((left, right) => {
    const leftMeta = parseSmartMetadata(left.metadata, left);
    const rightMeta = parseSmartMetadata(right.metadata, right);
    return (
      right.importance - left.importance ||
      rightMeta.confidence - leftMeta.confidence ||
      right.timestamp - left.timestamp
    );
  });
}

function shouldPruneLowValueMemory(
  memory: MemoryEntry,
  pruneBeforeTimestamp: number,
): boolean {
  const metadata = parseSmartMetadata(memory.metadata, memory);
  return (
    memory.importance < 0.25 &&
    metadata.confidence < 0.4 &&
    metadata.kind === 'episodic' &&
    (metadata.last_accessed_at || memory.timestamp) < pruneBeforeTimestamp
  );
}

export async function compactMemories(
  store: MemoryStore,
  input: CompactMemoryInput,
): Promise<CompactMemoryResult> {
  const memories = await store.list(input.scopes, undefined, 10_000, 0);
  const now = Date.now();
  const pruneBeforeTimestamp = input.pruneBeforeTimestamp || now - 90 * 24 * 60 * 60 * 1000;
  const result: CompactMemoryResult = {
    duplicatesMerged: 0,
    supersedesRepaired: 0,
    lowValuePruned: 0,
    changedIds: [],
  };

  const memoryById = new Map(memories.map(memory => [memory.id, memory]));
  const duplicateGroups = new Map<string, MemoryEntry[]>();

  for (const memory of memories) {
    const metadata = parseSmartMetadata(memory.metadata, memory);
    if (!isMemoryActiveAt(metadata, now)) {
      continue;
    }

    const key = `${memory.scope}|${memory.category}|${normalizeDuplicateText(memory.text)}`;
    const group = duplicateGroups.get(key) || [];
    group.push(memory);
    duplicateGroups.set(key, group);
  }

  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;

    const [winner, ...losers] = sortByStrength(group);
    for (const loser of losers) {
      result.duplicatesMerged += 1;
      result.changedIds.push(loser.id);

      if (!input.dryRun) {
        await store.patchMetadata(loser.id, {
          superseded_by: winner.id,
          invalidated_at: now,
        });
      }
    }
  }

  for (const memory of memories) {
    const metadata = parseSmartMetadata(memory.metadata, memory);
    if (!metadata.supersedes) continue;

    const target = memoryById.get(metadata.supersedes);
    if (!target) continue;

    const targetMetadata = parseSmartMetadata(target.metadata, target);
    if (targetMetadata.superseded_by === memory.id) continue;

    result.supersedesRepaired += 1;
    result.changedIds.push(target.id);

    if (!input.dryRun) {
      await store.patchMetadata(target.id, {
        superseded_by: memory.id,
        invalidated_at: now,
      });
    }
  }

  for (const memory of memories) {
    if (!shouldPruneLowValueMemory(memory, pruneBeforeTimestamp)) {
      continue;
    }

    result.lowValuePruned += 1;
    result.changedIds.push(memory.id);

    if (!input.dryRun) {
      await store.delete(memory.id, [memory.scope]);
    }
  }

  return result;
}
