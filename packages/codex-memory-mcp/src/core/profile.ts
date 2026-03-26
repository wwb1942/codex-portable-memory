import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface MemoryProfile {
  version: number;
  projectId?: string;
  defaultScope: string;
  fallbackScopes: string[];
  writePolicy?: {
    defaultKind?: 'episodic' | 'semantic';
    promoteDecisionToSemantic?: boolean;
  };
  recallPolicy?: {
    maxScopes?: number;
    preferProject?: boolean;
  };
}

export const DEFAULT_MEMORY_PROFILE: MemoryProfile = {
  version: 1,
  defaultScope: 'global',
  fallbackScopes: [],
};

async function readJsonIfExists(path: string): Promise<Record<string, unknown> | null> {
  try {
    await access(path, constants.R_OK);
  } catch {
    return null;
  }

  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid memory profile: ${path}`);
  }
  return parsed as Record<string, unknown>;
}

function normalizeScopeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeProfile(raw: Record<string, unknown> | null): MemoryProfile {
  if (!raw) {
    return { ...DEFAULT_MEMORY_PROFILE };
  }

  const defaultScope =
    typeof raw.defaultScope === 'string' && raw.defaultScope.trim()
      ? raw.defaultScope.trim()
      : DEFAULT_MEMORY_PROFILE.defaultScope;

  const writePolicy =
    raw.writePolicy && typeof raw.writePolicy === 'object' && !Array.isArray(raw.writePolicy)
      ? (raw.writePolicy as Record<string, unknown>)
      : null;
  const recallPolicy =
    raw.recallPolicy && typeof raw.recallPolicy === 'object' && !Array.isArray(raw.recallPolicy)
      ? (raw.recallPolicy as Record<string, unknown>)
      : null;

  return {
    version: typeof raw.version === 'number' ? raw.version : DEFAULT_MEMORY_PROFILE.version,
    projectId:
      typeof raw.projectId === 'string' && raw.projectId.trim()
        ? raw.projectId.trim()
        : undefined,
    defaultScope,
    fallbackScopes: normalizeScopeList(raw.fallbackScopes).filter(scope => scope !== defaultScope),
    writePolicy: writePolicy
      ? {
          defaultKind:
            writePolicy.defaultKind === 'episodic' || writePolicy.defaultKind === 'semantic'
              ? writePolicy.defaultKind
              : undefined,
          promoteDecisionToSemantic:
            typeof writePolicy.promoteDecisionToSemantic === 'boolean'
              ? writePolicy.promoteDecisionToSemantic
              : undefined,
        }
      : undefined,
    recallPolicy: recallPolicy
      ? {
          maxScopes: typeof recallPolicy.maxScopes === 'number' ? recallPolicy.maxScopes : undefined,
          preferProject:
            typeof recallPolicy.preferProject === 'boolean'
              ? recallPolicy.preferProject
              : undefined,
        }
      : undefined,
  };
}

export async function loadMemoryProfile(
  input: { cwd?: string; userHome?: string } = {},
): Promise<MemoryProfile> {
  const cwd = input.cwd || process.cwd();
  const userHome = input.userHome || homedir();

  const projectPath = join(cwd, '.codex', 'memory-profile.json');
  const userPath = join(userHome, '.codex', 'memory', 'profiles', 'default.json');

  const projectProfile = await readJsonIfExists(projectPath);
  if (projectProfile) {
    return normalizeProfile(projectProfile);
  }

  const userProfile = await readJsonIfExists(userPath);
  return normalizeProfile(userProfile);
}

export function resolveRecallScopes(profile: MemoryProfile, explicitScope?: string): string[] {
  if (explicitScope) return [explicitScope];

  const scopes = [profile.defaultScope, ...profile.fallbackScopes].filter(
    (scope, index, list) => scope && list.indexOf(scope) === index,
  );

  const maxScopes = profile.recallPolicy?.maxScopes;
  if (typeof maxScopes === 'number' && Number.isFinite(maxScopes) && maxScopes > 0) {
    return scopes.slice(0, maxScopes);
  }

  return scopes;
}

export function resolveWriteScope(profile: MemoryProfile, explicitScope?: string): string {
  return explicitScope || profile.defaultScope;
}
