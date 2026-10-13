import { describe, expect, it } from 'vitest';
import {
  evaluateWalkingCondition,
  validateWalkingCondition,
  type WalkingCondition,
} from './walking-condition';
const near: WalkingCondition = { sourceBlockId: 'near', thresholdMeters: 0.3 };
const far: WalkingCondition = { sourceBlockId: 'far', thresholdMeters: 2 };
describe('shared walking conditions', () => {
  it('evaluates nested logic using one measured distance and strict boundaries', () => {
    const condition: WalkingCondition = {
      sourceBlockId: 'both',
      operator: 'and',
      left: far,
      right: { sourceBlockId: 'negation', operator: 'not', operand: near },
    };
    expect(evaluateWalkingCondition(condition, 1)).toBe(true);
    expect(evaluateWalkingCondition(condition, 0.3)).toBe(true);
    expect(evaluateWalkingCondition(condition, 0.2)).toBe(false);
    expect(evaluateWalkingCondition(condition, 2)).toBe(false);
    expect(evaluateWalkingCondition({ ...condition, operator: 'or' }, 2)).toBe(
      true,
    );
  });
  it('rejects unknown data, malformed unused operands and cycles before evaluation', () => {
    expect(() => evaluateWalkingCondition(near, NaN)).toThrow(/desconocida/);
    const invalid = {
      sourceBlockId: 'or',
      operator: 'or',
      left: near,
      right: { sourceBlockId: 'bad', thresholdMeters: Infinity },
    };
    expect(() => validateWalkingCondition(invalid)).toThrow(/5–400/);
    expect(() =>
      validateWalkingCondition({
        sourceBlockId: 'and',
        operator: 'and',
        left: near,
        right: near,
      }),
    ).toThrow(/identificador/);
    const loop: Record<string, unknown> = {
      sourceBlockId: 'loop',
      operator: 'not',
    };
    loop['operand'] = loop;
    expect(() => validateWalkingCondition(loop)).toThrow(/identificador/);
  });
});
