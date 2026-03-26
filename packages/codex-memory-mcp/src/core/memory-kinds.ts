export type MemoryKind = 'episodic' | 'semantic';

export function deriveMemoryKind(input: {
  category?: string;
  importance?: number;
  explicitKind?: MemoryKind;
  promoteDecisionToSemantic?: boolean;
}): MemoryKind {
  if (input.explicitKind === 'episodic' || input.explicitKind === 'semantic') {
    return input.explicitKind;
  }

  if (input.category === 'preference') return 'semantic';
  if (input.category === 'decision' && input.promoteDecisionToSemantic) return 'semantic';
  if ((input.importance || 0) >= 0.9) return 'semantic';
  return 'episodic';
}

export function deriveStability(input: {
  kind: MemoryKind;
  importance?: number;
  explicitStability?: number;
}): number {
  if (typeof input.explicitStability === 'number' && Number.isFinite(input.explicitStability)) {
    return Math.max(0, Math.min(1, input.explicitStability));
  }

  const importance = typeof input.importance === 'number' && Number.isFinite(input.importance)
    ? Math.max(0, Math.min(1, input.importance))
    : 0.7;

  if (input.kind === 'semantic') {
    return Math.max(0.75, importance);
  }

  return Math.max(0.35, Math.min(0.8, importance));
}
