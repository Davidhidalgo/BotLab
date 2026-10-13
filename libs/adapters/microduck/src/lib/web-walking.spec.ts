import { describe, it, expect } from 'vitest';
import { compileMicroduckWalkingProgram } from './web-walking';
describe('educational web walking', () => {
  it('preserves physical goals and source block IDs', () => {
    const result = compileMicroduckWalkingProgram([
      { kind: 'distance', sourceBlockId: 'd', distanceMeters: 1 },
      { kind: 'turn', sourceBlockId: 't', angleRadians: Math.PI / 2 },
      { kind: 'wait', sourceBlockId: 'w', durationSeconds: 1 },
    ]);
    expect(
      result.commands.map((c) => [c.sourceBlockId, c.commandId, c.inputs]),
    ).toEqual([
      ['d', 'distance', { distanceMeters: 1, speed: 0.25, timeoutSeconds: 40 }],
      [
        't',
        'turn',
        { angleRadians: Math.PI / 2, speed: 1, timeoutSeconds: 45 },
      ],
      ['w', 'wait', { durationSeconds: 1 }],
    ]);
  });
  it('rejects unsupported goal ranges and duplicate source identities', () => {
    for (const distanceMeters of [-1, 21, NaN])
      expect(() =>
        compileMicroduckWalkingProgram([
          { kind: 'distance', sourceBlockId: 'd', distanceMeters },
        ]),
      ).toThrow(/Usa avance/);
    expect(() =>
      compileMicroduckWalkingProgram(
        Array(2).fill({
          kind: 'distance',
          sourceBlockId: 'd',
          distanceMeters: 1,
        }),
      ),
    ).toThrow(/identificador/);
  });
});

it('does not enable the unvalidated right turn as a measured goal', () => {
  expect(() =>
    compileMicroduckWalkingProgram([
      { sourceBlockId: 'right', kind: 'turn', angleRadians: -Math.PI / 2 },
    ]),
  ).toThrow(/izquierda/);
});

it('compiles repeated actions with unique execution IDs, source identity and iterations', () => {
  const plan = compileMicroduckWalkingProgram([
    {
      kind: 'repeat',
      sourceBlockId: 'repeat',
      count: 3,
      body: [
        { sourceBlockId: 'walk', kind: 'distance', distanceMeters: 0.5 },
        { sourceBlockId: 'wait', kind: 'wait', durationSeconds: 1 },
      ],
    },
  ]);
  expect(plan.commands).toHaveLength(9);
  expect(new Set(plan.commands.map((c) => c.id)).size).toBe(9);
  expect(
    plan.commands
      .filter((c) => c.commandId === 'distance')
      .map((c) => [c.sourceBlockId, c.iterations]),
  ).toEqual(
    [1, 2, 3].map((iteration) => [
      'walk',
      [{ sourceBlockId: 'repeat', iteration, count: 3 }],
    ]),
  );
  expect(
    compileMicroduckWalkingProgram([
      { kind: 'repeat', sourceBlockId: 'zero', count: 0, body: [] },
    ]).commands,
  ).toEqual([]);
  expect(() =>
    compileMicroduckWalkingProgram([
      {
        kind: 'repeat',
        sourceBlockId: 'zero',
        count: 0,
        body: [{ sourceBlockId: 'bad', kind: 'distance', distanceMeters: -1 }],
      },
    ]),
  ).toThrow(/Usa avance/);
});

it('compiles only the measured head directions', () => {
  for (const angleRadians of [-0.3, 0, 0.3])
    expect(
      compileMicroduckWalkingProgram([
        { kind: 'head-yaw', sourceBlockId: 'h', angleRadians },
      ]).commands[0],
    ).toMatchObject({ commandId: 'head-yaw', inputs: { angleRadians } });
  for (const angleRadians of [0.2, NaN, 1])
    expect(() =>
      compileMicroduckWalkingProgram([
        { kind: 'head-yaw', sourceBlockId: 'h', angleRadians },
      ]),
    ).toThrow(/Usa avance/);
});
