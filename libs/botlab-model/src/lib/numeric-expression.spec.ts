import {
  NumericVariables,
  evaluateNumericExpression as evaluate,
  validateNumericExpression,
  type NumericExpression,
} from './numeric-expression';
import { evaluateWalkingCondition } from './walking-condition';
const literal = (value: number): NumericExpression => ({
  kind: 'literal',
  value,
});
describe('bounded numeric programs', () => {
  it('uses explicit variables and centimetres in arithmetic', () => {
    const variables = new NumericVariables();
    variables.set('contador', 2);
    expect(
      evaluate(
        {
          kind: 'multiply',
          left: { kind: 'variable', name: 'contador' },
          right: { kind: 'distance-cm' },
        },
        variables,
        0.15,
      ),
    ).toBe(30);
    expect(
      evaluate({ kind: 'subtract', left: literal(10), right: literal(3) }),
    ).toBe(7);
    expect(() => evaluate({ kind: 'variable', name: 'contador' })).toThrow(
      /Inicializa/,
    );
    expect(() => evaluate({ kind: 'distance-cm' })).toThrow(/desconocida/);
  });
  it('rejects division by zero, nonfinite values, overflow and excessive trees', () => {
    expect(() =>
      evaluate({ kind: 'divide', left: literal(5), right: literal(0) }),
    ).toThrow(/cero/);
    expect(() =>
      evaluate({ kind: 'multiply', left: literal(1e9), right: literal(2) }),
    ).toThrow(/finito/);
    expect(() => evaluate(literal(NaN))).toThrow();
    let tree: NumericExpression = literal(1);
    for (let i = 0; i < 18; i++)
      tree = { kind: 'add', left: tree, right: literal(1) };
    expect(() => validateNumericExpression(tree)).toThrow(/16/);
  });
  it('bounds variables, accepts safe map keys and validates persisted snapshots', () => {
    const variables = new NumericVariables();
    variables.set('__proto__', 3);
    const restored = new NumericVariables(variables.snapshot());
    expect(restored.get('__proto__')).toBe(3);
    variables.set('__proto__', 4);
    expect(restored.get('__proto__')).toBe(3);
    expect(
      () =>
        new NumericVariables([
          ['x', 1],
          ['x', 2],
        ]),
    ).toThrow();
    expect(() => variables.set(' x', 1)).toThrow();
    for (let i = 0; i < 63; i++) variables.set('v' + i, i);
    expect(() => variables.set('extra', 1)).toThrow(/64/);
  });
  it('does not hide uninitialized variables in a logical branch', () => {
    expect(() =>
      evaluateWalkingCondition({
        sourceBlockId: 'or',
        operator: 'or',
        left: {
          sourceBlockId: 'yes',
          comparison: 'eq',
          left: literal(1),
          right: literal(1),
        },
        right: {
          sourceBlockId: 'unknown',
          comparison: 'gt',
          left: { kind: 'variable', name: 'missing' },
          right: literal(0),
        },
      }),
    ).toThrow(/Inicializa/);
  });
});
