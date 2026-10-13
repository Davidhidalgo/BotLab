/** Boolean expressions over one confirmed frontal distance, shared by robot targets. */
export type WalkingCondition =
  | { sourceBlockId: string; posture: 'sit' | 'stand' | 'transitioning' }
  | { sourceBlockId: string; thresholdMeters: number }
  | { sourceBlockId: string; operator: 'not'; operand: WalkingCondition }
  | {
      sourceBlockId: string;
      operator: 'and' | 'or';
      left: WalkingCondition;
      right: WalkingCondition;
    };

export function validateWalkingCondition(
  value: unknown,
  ids = new Set<string>(),
  depth = 0,
): asserts value is WalkingCondition {
  if (depth > 16 || !value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Condición no válida o más de 16 niveles.');
  const c = value as Record<string, unknown>;
  if (
    typeof c['sourceBlockId'] !== 'string' ||
    !c['sourceBlockId'].trim() ||
    ids.has(c['sourceBlockId'])
  )
    throw new Error('Cada condición necesita un identificador distinto.');
  ids.add(c['sourceBlockId']);
  if (ids.size > 256) throw new Error('Usa como máximo 256 bloques.');
  if ('posture' in c) {
    if (!['sit', 'stand', 'transitioning'].includes(String(c['posture'])))
      throw new Error('Postura no válida.');
  } else if (!('operator' in c)) {
    if (
      typeof c['thresholdMeters'] !== 'number' ||
      !Number.isFinite(c['thresholdMeters']) ||
      c['thresholdMeters'] < 0.05 ||
      c['thresholdMeters'] > 4
    )
      throw new Error('La condición necesita una distancia de 5–400 cm.');
  } else if (c['operator'] === 'not')
    validateWalkingCondition(c['operand'], ids, depth + 1);
  else if (c['operator'] === 'and' || c['operator'] === 'or') {
    validateWalkingCondition(c['left'], ids, depth + 1);
    validateWalkingCondition(c['right'], ids, depth + 1);
  } else throw new Error('Operador de condición no compatible.');
}

export function evaluateWalkingCondition(
  condition: WalkingCondition,
  distanceMeters?: number,
  posture?: 'sit' | 'stand' | 'transitioning',
): boolean {
  validateWalkingCondition(condition);
  const needs = walkingConditionRequirements(condition);
  if (
    needs.posture &&
    !['sit', 'stand', 'transitioning'].includes(posture ?? '')
  )
    throw new Error('Postura desconocida.');
  if (
    needs.distance &&
    (distanceMeters === undefined ||
      !Number.isFinite(distanceMeters) ||
      distanceMeters < 0)
  )
    throw new Error('Distancia frontal desconocida.');
  function evaluate(c: WalkingCondition): boolean {
    if ('posture' in c) return posture === c.posture;
    if (!('operator' in c)) return distanceMeters! < c.thresholdMeters;
    if (c.operator === 'not') return !evaluate(c.operand);
    return c.operator === 'and'
      ? evaluate(c.left) && evaluate(c.right)
      : evaluate(c.left) || evaluate(c.right);
  }
  return evaluate(condition);
}

export function describeWalkingCondition(
  condition: WalkingCondition,
  postures = {
    sit: 'sentado',
    stand: 'de pie',
    transitioning: 'cambiando de postura',
  },
): string {
  if ('posture' in condition) return `¿${postures[condition.posture]}?`;
  if (!('operator' in condition))
    return `d < ${condition.thresholdMeters * 100} cm`;
  if (condition.operator === 'not')
    return `¬(${describeWalkingCondition(condition.operand, postures)})`;
  return `(${describeWalkingCondition(condition.left, postures)} ${condition.operator === 'and' ? '∧' : '∨'} ${describeWalkingCondition(condition.right, postures)})`;
}

export function walkingConditionRequirements(condition: unknown): {
  distance: boolean;
  posture: boolean;
} {
  validateWalkingCondition(condition);
  function needs(c: WalkingCondition): { distance: boolean; posture: boolean } {
    if ('posture' in c) return { distance: false, posture: true };
    if (!('operator' in c)) return { distance: true, posture: false };
    if (c.operator === 'not') return needs(c.operand);
    const a = needs(c.left),
      b = needs(c.right);
    return {
      distance: a.distance || b.distance,
      posture: a.posture || b.posture,
    };
  }
  return needs(condition);
}
