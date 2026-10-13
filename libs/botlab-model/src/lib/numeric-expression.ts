/** Bounded, side-effect-free numeric expressions; sensor distance is explicitly in cm. */
export type NumericExpression =
  | { kind: 'literal'; value: number }
  | { kind: 'variable'; name: string }
  | { kind: 'distance-cm' }
  | {
      kind: 'add' | 'subtract' | 'multiply' | 'divide';
      left: NumericExpression;
      right: NumericExpression;
    };
export function validateVariableName(name: unknown): asserts name is string {
  if (
    typeof name !== 'string' ||
    !/^[\p{L}_][\p{L}\p{N}_ ]{0,39}$/u.test(name) ||
    name.trim() !== name
  )
    throw new Error(
      'Usa un nombre de variable de 1–40 letras, números o espacios.',
    );
}
function finite(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) > 1e9)
    throw new Error(
      'El resultado numérico debe ser finito y estar entre −1.000.000.000 y 1.000.000.000.',
    );
  return value;
}
export class NumericVariables {
  private values = new Map<string, number>();
  constructor(snapshot?: unknown) {
    if (snapshot === undefined) return;
    if (!Array.isArray(snapshot) || snapshot.length > 64)
      throw new Error('Variables guardadas no válidas.');
    for (const item of snapshot) {
      if (
        !Array.isArray(item) ||
        item.length !== 2 ||
        typeof item[1] !== 'number' ||
        this.values.has(item[0])
      )
        throw new Error('Variables guardadas no válidas.');
      this.set(item[0], item[1]);
    }
  }
  get(name: string): number {
    validateVariableName(name);
    if (!this.values.has(name))
      throw new Error(`Inicializa la variable «${name}» antes de usarla.`);
    return this.values.get(name)!;
  }
  set(name: string, value: number) {
    validateVariableName(name);
    finite(value);
    if (!this.values.has(name) && this.values.size >= 64)
      throw new Error('Usa como máximo 64 variables.');
    this.values.set(name, value);
  }
  snapshot(): Array<[string, number]> {
    return Array.from(this.values.entries());
  }
}
export function validateNumericExpression(
  value: unknown,
): asserts value is NumericExpression {
  let count = 0;
  function visit(item: unknown, depth: number) {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      depth > 16 ||
      ++count > 128
    )
      throw new Error('Expresión no válida: máximo 16 niveles y 128 valores.');
    const e = item as Record<string, unknown>;
    if (e['kind'] === 'literal') {
      if (typeof e['value'] !== 'number')
        throw new Error('Valor numérico no válido.');
      finite(e['value']);
    } else if (e['kind'] === 'variable') validateVariableName(e['name']);
    else if (e['kind'] === 'distance-cm') return;
    else if (
      ['add', 'subtract', 'multiply', 'divide'].includes(String(e['kind']))
    ) {
      visit(e['left'], depth + 1);
      visit(e['right'], depth + 1);
    } else throw new Error('Operación numérica no compatible.');
  }
  visit(value, 0);
}
export function numericExpressionNeedsDistance(value: unknown): boolean {
  validateNumericExpression(value);
  function visit(e: NumericExpression): boolean {
    return (
      e.kind === 'distance-cm' ||
      ('left' in e && (visit(e.left) || visit(e.right)))
    );
  }
  return visit(value);
}
export function evaluateNumericExpression(
  expression: NumericExpression,
  variables = new NumericVariables(),
  distanceMeters?: number,
): number {
  validateNumericExpression(expression);
  function evaluate(e: NumericExpression): number {
    if (e.kind === 'literal') return e.value;
    if (e.kind === 'variable') return variables.get(e.name);
    if (e.kind === 'distance-cm') {
      if (
        distanceMeters === undefined ||
        !Number.isFinite(distanceMeters) ||
        distanceMeters < 0
      )
        throw new Error('Distancia frontal desconocida.');
      return finite(distanceMeters * 100);
    }
    const a = evaluate(e.left),
      b = evaluate(e.right);
    if (e.kind === 'divide' && b === 0)
      throw new Error('No se puede dividir entre cero.');
    return finite(
      e.kind === 'add'
        ? a + b
        : e.kind === 'subtract'
          ? a - b
          : e.kind === 'multiply'
            ? a * b
            : a / b,
    );
  }
  return evaluate(expression);
}
export function describeNumericExpression(e: NumericExpression): string {
  if (e.kind === 'literal') return String(e.value);
  if (e.kind === 'variable') return e.name;
  if (e.kind === 'distance-cm') return 'd (cm)';
  return `(${describeNumericExpression(e.left)} ${{ add: '+', subtract: '−', multiply: '×', divide: '÷' }[e.kind]} ${describeNumericExpression(e.right)})`;
}
