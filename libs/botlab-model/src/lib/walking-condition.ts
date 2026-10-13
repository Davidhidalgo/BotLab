/** Boolean expressions over one confirmed frontal distance, shared by robot targets. */
export type WalkingCondition =
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
  if (!('operator' in c)) {
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
  distanceMeters: number,
): boolean {
  validateWalkingCondition(condition);
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0)
    throw new Error('Distancia frontal desconocida.');
  function evaluate(c: WalkingCondition): boolean {
    if (!('operator' in c)) return distanceMeters < c.thresholdMeters;
    if (c.operator === 'not') return !evaluate(c.operand);
    return c.operator === 'and'
      ? evaluate(c.left) && evaluate(c.right)
      : evaluate(c.left) || evaluate(c.right);
  }
  return evaluate(condition);
}

export function describeWalkingCondition(condition: WalkingCondition): string {
  if (!('operator' in condition))
    return `d < ${condition.thresholdMeters * 100} cm`;
  if (condition.operator === 'not')
    return `¬(${describeWalkingCondition(condition.operand)})`;
  return `(${describeWalkingCondition(condition.left)} ${condition.operator === 'and' ? '∧' : '∨'} ${describeWalkingCondition(condition.right)})`;
}
