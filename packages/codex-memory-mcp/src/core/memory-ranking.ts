import type { MemoryEntry } from './store.js';
import { isMemoryActiveAt, parseSmartMetadata } from './smart-metadata.js';

export interface RecallRankingItem {
  id: string;
  text: string;
  category: MemoryEntry['category'];
  scope: string;
  importance: number;
  timestamp: number;
  score: number;
  metadata?: string;
}

function calculateRecencyScore(lastTouchedAt: number, now: number): number {
  const ageMs = Math.max(0, now - lastTouchedAt);
  const ageDays = ageMs / 86_400_000;
  return Math.max(0, 1 - ageDays / 30);
}

export function rankRecallResults(input: {
  items: RecallRankingItem[];
  primaryScope?: string;
  limit: number;
}): RecallRankingItem[] {
  const now = Date.now();

  return input.items
    .flatMap(item => {
      const metadata = parseSmartMetadata(item.metadata, {
        text: item.text,
        category: item.category,
        importance: item.importance,
        timestamp: item.timestamp,
      });

      if (!isMemoryActiveAt(metadata, now)) {
        return [];
      }

      if (metadata.superseded_by) {
        return [];
      }

      const recencyScore = calculateRecencyScore(
        metadata.last_accessed_at || item.timestamp,
        now,
      );
      const scopeBoost = input.primaryScope && item.scope === input.primaryScope ? 0.05 : 0;
      const finalScore =
        item.score * 0.55 +
        item.importance * 0.20 +
        recencyScore * 0.15 +
        metadata.stability * 0.10 +
        scopeBoost;

      return [{ ...item, score: finalScore }];
    })
    .sort((a, b) => b.score - a.score || b.timestamp - a.timestamp)
    .slice(0, input.limit);
}
