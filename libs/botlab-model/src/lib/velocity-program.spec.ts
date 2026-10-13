import { describe, it, expect } from 'vitest';
import {
  expandWalkingProgram,
  type WalkingProgramStep,
} from './velocity-program';

const wait: WalkingProgramStep = {
  sourceBlockId: 'wait',
  kind: 'wait',
  durationSeconds: 1,
};
const repeat = (
  count: number,
  body: WalkingProgramStep[] = [wait],
  sourceBlockId = 'repeat',
): WalkingProgramStep => ({ sourceBlockId, kind: 'repeat', count, body });
const expand = (program: WalkingProgramStep[]) =>
  expandWalkingProgram(program, () => {});

describe('bounded walking repeats', () => {
  it('keeps sequential programs compatible and skips zero bodies', () => {
    expect(expand([wait])).toEqual([wait]);
    expect(expand([repeat(0)])).toEqual([]);
    expect(expand([repeat(0), { ...wait, sourceBlockId: 'after' }])).toEqual([
      { ...wait, sourceBlockId: 'after' },
    ]);
  });
  it('retains the complete iteration path and checkpoints for empty bodies', () => {
    const steps = expand([repeat(2, [repeat(2, [wait], 'inner')])]);
    expect(
      steps
        .filter((s) => s.sourceBlockId === 'wait')
        .map((s) => s.iterations?.map((i) => i.iteration)),
    ).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
    ]);
    expect(steps.at(-1)?.iterations).toEqual([
      { sourceBlockId: 'repeat', iteration: 2, count: 2 },
      { sourceBlockId: 'inner', iteration: 2, count: 2 },
    ]);
    expect(expand([repeat(2, [])])).toHaveLength(2);
  });
  it('validates every source action before lowering even if unreachable', () => {
    expect(() =>
      expandWalkingProgram([repeat(0)], () => {
        throw new Error('invalid action');
      }),
    ).toThrow('invalid action');
    expect(() => expand([repeat(0, [wait, wait])])).toThrow(/identificador/);
    expect(() => expand([repeat(1, [wait], 'wait')])).toThrow(/identificador/);
    expect(() => expand([{ ...wait, sourceBlockId: '' }])).toThrow(
      /identificador/,
    );
  });
  it('rejects invalid counts, depth and expansion without unbounded empty loops', () => {
    for (const count of [-1, 0.5, 101, NaN, Infinity])
      expect(() => expand([repeat(count)])).toThrow(/entero/);
    let nested: WalkingProgramStep = wait;
    for (let i = 0; i < 16; i++) nested = repeat(1, [nested], `r-${i}`);
    expect(expand([nested])).toHaveLength(17);
    expect(() => expand([repeat(0, [nested])])).toThrow(/16 niveles/);
    expect(() => expand([repeat(100, [repeat(100, [], 'inner')])])).toThrow(
      /256 pasos/,
    );
    expect(expand([repeat(100)])).toHaveLength(200);
    expect(
      expand(
        Array.from({ length: 256 }, (_, i) => ({
          ...wait,
          sourceBlockId: `w-${i}`,
        })),
      ),
    ).toHaveLength(256);
    expect(() =>
      expand(
        Array.from({ length: 257 }, (_, i) => ({
          ...wait,
          sourceBlockId: `w-${i}`,
        })),
      ),
    ).toThrow(/256 bloques/);
  });
});

describe('walking conditional lowering', () => {
  const condition = { sourceBlockId: 'sensor', thresholdMeters: 0.3 };
  it('preserves nested branch and loop exits with following actions', () => {
    const p = expand([
      {
        sourceBlockId: 'loop',
        kind: 'until',
        condition,
        body: [
          {
            sourceBlockId: 'choice',
            kind: 'if',
            condition: { ...condition, sourceBlockId: 'inner' },
            body: [wait],
            otherwise: [{ ...wait, sourceBlockId: 'other' }],
          },
        ],
      },
      { ...wait, sourceBlockId: 'after' },
    ]);
    expect(p[0].flow).toEqual({ whenTrue: 6, whenFalse: 1 });
    expect(p[1].flow).toEqual({ whenTrue: 2, whenFalse: 4 });
    expect(p[3].flow).toEqual({ next: 5 });
    expect(p[5].flow).toEqual({ next: 0 });
    expect(p[6].sourceBlockId).toBe('after');
  });
  it('validates unselected branches and conditions before expansion', () => {
    expect(() =>
      expandWalkingProgram(
        [
          {
            sourceBlockId: 'if',
            kind: 'if',
            condition,
            body: [],
            otherwise: [wait],
          },
        ],
        () => {
          throw new Error('invalid hidden branch');
        },
      ),
    ).toThrow('invalid hidden branch');
    expect(() =>
      expand([
        {
          sourceBlockId: 'loop',
          kind: 'until',
          condition: { ...condition, thresholdMeters: NaN },
          body: [],
        },
      ]),
    ).toThrow('condición');
    expect(() =>
      expand([
        {
          sourceBlockId: 'loop',
          kind: 'until',
          condition,
          body: [{ ...wait, sourceBlockId: 'sensor' }],
        },
      ]),
    ).toThrow('identificador');
  });
});

describe('conditional waiting', () => {
  const step: WalkingProgramStep = {
    sourceBlockId: 'await',
    kind: 'wait-until',
    condition: { sourceBlockId: 'sensor', thresholdMeters: 0.3 },
    timeoutSeconds: 2,
  };
  it('checks immediately and waits half a simulated second between fresh checks', () => {
    const result = expand([step, wait]);
    expect(result[0].flow).toEqual({
      whenTrue: 3,
      whenFalse: 1,
      maxFalseChecks: 5,
    });
    expect(result[1]).toMatchObject({ kind: 'wait', durationSeconds: 0.5 });
    expect(result[2].flow).toEqual({ next: 0 });
    expect(result[3]).toEqual(wait);
  });
  it('rejects invalid deadlines before running', () => {
    for (const timeoutSeconds of [0, 0.6, 31, Infinity, NaN])
      expect(() => expand([{ ...step, timeoutSeconds }])).toThrow(
        /espera máxima/,
      );
  });
});
