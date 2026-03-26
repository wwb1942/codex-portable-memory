import { randomUUID } from 'node:crypto';

import { MemoryScopeManager } from './core/scopes.js';
import {
  DEFAULT_MEMORY_PROFILE,
  resolveRecallScopes,
  resolveWriteScope,
  type MemoryProfile,
} from './core/profile.js';
import {
  exportMemoriesToJsonl,
  importMemoriesFromJsonl,
  normalizeImportedMemoryRecord,
} from './core/export-import.js';
import { compactMemories, type CompactMemoryResult } from './core/compaction.js';
import {
  MemoryStore,
  type MemoryEntry,
  type MemorySearchResult,
  validateStoragePath,
} from './core/store.js';
import {
  buildSmartMetadata,
  parseSmartMetadata,
  stringifySmartMetadata,
} from './core/smart-metadata.js';
import { rankRecallResults } from './core/memory-ranking.js';

export type MemoryCategory =
  | 'preference'
  | 'fact'
  | 'decision'
  | 'entity'
  | 'other'
  | 'reflection';

export interface EmbedderLike {
  dimensions: number;
  embedQuery(text: string): Promise<number[]>;
  embedPassage(text: string): Promise<number[]>;
}

export interface CreateMemoryServiceOptions {
  dbPath: string;
  embedder: EmbedderLike;
  defaultScope?: string;
  profile?: MemoryProfile;
  sessionId?: string;
}

export interface StoreMemoryInput {
  text: string;
  category?: MemoryCategory;
  scope?: string;
  importance?: number;
  tags?: string[];
}

export interface RecallMemoryInput {
  query: string;
  scope?: string;
  limit?: number;
}

export interface ListMemoryInput {
  scope?: string;
  category?: MemoryCategory;
  limit?: number;
  offset?: number;
}

export interface ExportMemoryInput {
  path: string;
  scope?: string;
  scopes?: string[];
  category?: MemoryCategory;
}

export interface ImportMemoryInput {
  path: string;
  mode?: 'skip-existing' | 'upsert';
  reembed?: boolean;
}

export interface CompactMemoryServiceInput {
  scopes?: string[];
  scope?: string;
  dryRun?: boolean;
  pruneBeforeTimestamp?: number;
}

export interface UpdateMemoryInput {
  id: string;
  text?: string;
  category?: MemoryCategory;
  scope?: string;
  importance?: number;
}

export interface ForgetMemoryInput {
  id: string;
  scope?: string;
}

export interface MemoryRecallResult {
  id: string;
  text: string;
  category: MemoryCategory;
  scope: string;
  importance: number;
  timestamp: number;
  score: number;
}

interface MemoryRecallCandidate extends MemoryRecallResult {
  metadata?: string;
}

export interface MemoryService {
  store(input: StoreMemoryInput): Promise<MemoryEntry>;
  recall(input: RecallMemoryInput): Promise<MemoryRecallResult[]>;
  list(input: ListMemoryInput): Promise<MemoryEntry[]>;
  export(input: ExportMemoryInput): Promise<{ path: string; count: number }>;
  import(input: ImportMemoryInput): Promise<{ path: string; count: number }>;
  compact(input: CompactMemoryServiceInput): Promise<CompactMemoryResult>;
  update(input: UpdateMemoryInput): Promise<MemoryEntry | null>;
  forget(input: ForgetMemoryInput): Promise<boolean>;
}

function clamp01(value: number | undefined, fallback = 0.7): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, Number(value)));
}

function normalizeCategory(category?: string): MemoryCategory {
  switch (category) {
    case 'preference':
    case 'fact':
    case 'decision':
    case 'entity':
    case 'other':
    case 'reflection':
      return category;
    default:
      return 'fact';
  }
}

function buildScopeFilter(
  scope: string | string[] | undefined,
  scopeManager: MemoryScopeManager,
): string[] | undefined {
  if (!scope) return undefined;

  const scopes = Array.isArray(scope) ? scope : [scope];
  for (const item of scopes) {
    if (!scopeManager.validateScope(item)) {
      throw new Error(`Invalid memory scope: ${item}`);
    }
  }
  return scopes;
}

function fuseHybridResults(
  vectorResults: MemorySearchResult[],
  bm25Results: MemorySearchResult[],
  limit: number,
): MemoryRecallCandidate[] {
  const merged = new Map<string, MemoryRecallCandidate>();

  for (const result of vectorResults) {
    merged.set(result.entry.id, {
      id: result.entry.id,
      text: result.entry.text,
      category: result.entry.category,
      scope: result.entry.scope,
      importance: result.entry.importance,
      timestamp: result.entry.timestamp,
      score: result.score * 0.7,
      metadata: result.entry.metadata,
    });
  }

  for (const result of bm25Results) {
    const existing = merged.get(result.entry.id);
    if (existing) {
      existing.score += result.score * 0.3;
      continue;
    }

    merged.set(result.entry.id, {
      id: result.entry.id,
      text: result.entry.text,
      category: result.entry.category,
      scope: result.entry.scope,
      importance: result.entry.importance,
      timestamp: result.entry.timestamp,
      score: result.score * 0.3,
      metadata: result.entry.metadata,
    });
  }

  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score || b.timestamp - a.timestamp)
    .slice(0, limit);
}

async function touchRecalledMemories(
  store: MemoryStore,
  memories: MemoryRecallCandidate[],
): Promise<void> {
  const now = Date.now();

  await Promise.allSettled(
    memories.map(memory => {
      const metadata = parseSmartMetadata(memory.metadata, {
        text: memory.text,
        category: memory.category,
        importance: memory.importance,
        timestamp: memory.timestamp,
      });

      return store.patchMetadata(memory.id, {
        access_count: metadata.access_count + 1,
        last_accessed_at: now,
      });
    }),
  );
}

export async function createMemoryService(
  options: CreateMemoryServiceOptions,
): Promise<MemoryService> {
  const dbPath = validateStoragePath(options.dbPath);
  const profile = options.profile || {
    ...DEFAULT_MEMORY_PROFILE,
    defaultScope: options.defaultScope || DEFAULT_MEMORY_PROFILE.defaultScope,
  };
  const scopeManager = new MemoryScopeManager({
    default: profile.defaultScope || options.defaultScope || 'global',
  });
  const store = new MemoryStore({
    dbPath,
    vectorDim: options.embedder.dimensions,
  });

  return {
    async store(input: StoreMemoryInput): Promise<MemoryEntry> {
      const category = normalizeCategory(input.category);
      const scope = resolveWriteScope(profile, input.scope || scopeManager.getDefaultScope());
      const importance = clamp01(input.importance, 0.7);
      const vector = await options.embedder.embedPassage(input.text);
      const metadata = stringifySmartMetadata(
        buildSmartMetadata(
          {
            text: input.text,
            category,
            importance,
            timestamp: Date.now(),
          },
          {
            l0_abstract: input.text,
            l1_overview: `- ${input.text}`,
            l2_content: input.text,
            last_accessed_at: Date.now(),
            kind:
              profile.writePolicy?.defaultKind ||
              (category === 'preference'
                ? 'semantic'
                : category === 'decision' && profile.writePolicy?.promoteDecisionToSemantic
                  ? 'semantic'
                  : 'episodic'),
            stability: importance,
            tags: input.tags || [],
            project_id: profile.projectId,
            session_id: options.sessionId,
          },
        ),
      );

      return store.store({
        text: input.text,
        vector,
        category,
        scope,
        importance,
        metadata,
      });
    },

    async recall(input: RecallMemoryInput): Promise<MemoryRecallResult[]> {
      const limit = Math.max(1, Math.min(input.limit || 5, 20));
      const resolvedScopes = resolveRecallScopes(profile, input.scope);
      const scopeFilter = buildScopeFilter(resolvedScopes, scopeManager);
      const fetchLimit = Math.max(limit, Math.min(limit * 3, 20));
      const queryVector = await options.embedder.embedQuery(input.query);
      const [vectorResults, bm25Results] = await Promise.all([
        store.vectorSearch(queryVector, fetchLimit, 0.2, scopeFilter, { excludeInactive: true }),
        store.bm25Search(input.query, fetchLimit, scopeFilter, { excludeInactive: true }),
      ]);

      const fused = fuseHybridResults(vectorResults, bm25Results, fetchLimit);
      const ranked = rankRecallResults({
        items: fused,
        primaryScope: resolvedScopes[0],
        limit,
      });

      await touchRecalledMemories(store, ranked);

      return ranked.map(({ metadata: _metadata, ...memory }) => memory);
    },

    async list(input: ListMemoryInput): Promise<MemoryEntry[]> {
      const scopeFilter = buildScopeFilter(
        input.scope ? resolveWriteScope(profile, input.scope) : resolveRecallScopes(profile),
        scopeManager,
      );

      return store.list(scopeFilter, input.category, input.limit || 20, input.offset || 0);
    },

    async export(input: ExportMemoryInput): Promise<{ path: string; count: number }> {
      const scopes = input.scopes?.length ? input.scopes : input.scope ? [input.scope] : resolveRecallScopes(profile);
      const scopeFilter = buildScopeFilter(scopes, scopeManager);
      const memories = await store.list(scopeFilter, input.category, 10_000, 0);
      return exportMemoriesToJsonl(input.path, memories);
    },

    async import(input: ImportMemoryInput): Promise<{ path: string; count: number }> {
      const records = await importMemoriesFromJsonl(input.path);
      let count = 0;

      for (const record of records) {
        const normalized = normalizeImportedMemoryRecord(record);
        const exists = await store.hasId(normalized.id);

        if (exists && input.mode !== 'upsert') {
          continue;
        }

        if (exists && input.mode === 'upsert') {
          await store.delete(normalized.id, [normalized.scope]);
        }

        const vector =
          !input.reembed &&
          Array.isArray(normalized.vector) &&
          normalized.vector.length === options.embedder.dimensions
            ? normalized.vector
            : await options.embedder.embedPassage(normalized.text);

        await store.importEntry({
          ...normalized,
          vector,
        });
        count += 1;
      }

      return { path: input.path, count };
    },

    async compact(input: CompactMemoryServiceInput): Promise<CompactMemoryResult> {
      const scopes = input.scopes?.length
        ? input.scopes
        : input.scope
          ? [input.scope]
          : resolveRecallScopes(profile);
      const scopeFilter = buildScopeFilter(scopes, scopeManager) || resolveRecallScopes(profile);
      return compactMemories(store, {
        scopes: scopeFilter,
        dryRun: input.dryRun,
        pruneBeforeTimestamp: input.pruneBeforeTimestamp,
      });
    },

    async update(input: UpdateMemoryInput): Promise<MemoryEntry | null> {
      const scopeFilter = buildScopeFilter(
        input.scope ? resolveWriteScope(profile, input.scope) : undefined,
        scopeManager,
      );
      const current = await store.getById(input.id, scopeFilter);
      if (!current) return null;

      const nextText = input.text ?? current.text;
      const nextCategory = normalizeCategory(input.category || current.category);
      const nextImportance = clamp01(input.importance, current.importance);
      const nextVector =
        input.text && input.text !== current.text
          ? await options.embedder.embedPassage(input.text)
          : current.vector;

      const metadata = stringifySmartMetadata(
        buildSmartMetadata(
          {
            text: nextText,
            category: nextCategory,
            importance: nextImportance,
            timestamp: current.timestamp,
            metadata: current.metadata,
          },
          {
            l0_abstract: nextText,
            l1_overview: `- ${nextText}`,
            l2_content: nextText,
            last_accessed_at: Date.now(),
            project_id: profile.projectId,
            session_id: options.sessionId,
          },
        ),
      );

      return store.update(
        input.id,
        {
          text: nextText,
          vector: nextVector,
          category: nextCategory,
          importance: nextImportance,
          metadata,
        },
        scopeFilter,
      );
    },

    async forget(input: ForgetMemoryInput): Promise<boolean> {
      const scopeFilter = buildScopeFilter(
        input.scope ? resolveWriteScope(profile, input.scope) : undefined,
        scopeManager,
      );
      return store.delete(input.id, scopeFilter);
    },
  };
}

export function createDeterministicMemoryId(): string {
  return randomUUID();
}
