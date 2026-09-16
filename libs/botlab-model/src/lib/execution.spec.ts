import { createProgramIdentity, sameProgram } from './execution';

describe('program identity', () => {
  it('compares semantic JSON independently of property ordering', () => {
    expect(
      sameProgram(
        createProgramIdentity('p', 't', { a: 1, b: 2 }),
        createProgramIdentity('p', 't', { b: 2, a: 1 }),
      ),
    ).toBe(true);
  });
  it('includes branch structure, block references and exact numeric values', () => {
    const original = createProgramIdentity('p', 't', [
      { id: 'one', value: 0.1 },
    ]);
    for (const content of [
      [{ id: 'two', value: 0.1 }],
      [{ id: 'one', value: 0.10000000000000002 }],
      { then: [{ id: 'one', value: 0.1 }] },
    ]) {
      expect(
        sameProgram(original, createProgramIdentity('p', 't', content)),
      ).toBe(false);
    }
    expect(sameProgram(original, { ...original, targetId: 'other' })).toBe(
      false,
    );
  });
  it('rejects non-JSON program inputs instead of assigning an ambiguous revision', () => {
    expect(() => createProgramIdentity('p', 't', { value: NaN })).toThrow();
    expect(() => createProgramIdentity('p', 't', [undefined])).toThrow();
  });
});
