import { describe, it, expect } from 'vitest';
import {
  compileJumperJointProgram,
  compileJumperWalkingProgram,
  jumperJointTargetId,
} from './jumper';
const limits = [{ name: 'hip', min: -1, max: 1 }];
describe('Jumper compilation', () => {
  it('preserves radian units and source IDs for the simulated target', () => {
    const artifact = compileJumperJointProgram(
      [{ sourceBlockId: 'b', joint: 'hip', positionRadians: 0.2 }],
      limits,
    );
    expect(artifact.targetId).toBe(jumperJointTargetId);
    expect(artifact.commands[0]).toMatchObject({
      sourceBlockId: 'b',
      inputs: { joint: 'hip', positionRadians: 0.2 },
    });
  });
  it('rejects missing joints, invalid numbers, limits and duplicate source IDs', () => {
    for (const [joint, positionRadians] of [
      ['missing', 0],
      ['hip', 2],
      ['hip', NaN],
    ] as const)
      expect(() =>
        compileJumperJointProgram(
          [{ sourceBlockId: 'b', joint, positionRadians }],
          limits,
        ),
      ).toThrow(/no válida/);
    expect(() =>
      compileJumperJointProgram(
        Array(2).fill({ sourceBlockId: 'b', joint: 'hip', positionRadians: 0 }),
        limits,
      ),
    ).toThrow(/no válida/);
  });
});

it('only enables the validated forward walking capability', () => {
  expect(
    compileJumperWalkingProgram([
      { sourceBlockId: 'w', forward: 0.24, yaw: 0, durationSeconds: 3 },
    ]).commands[0].inputs,
  ).toEqual({ forward: 0.24, yaw: 0, durationSeconds: 3 });
  expect(() =>
    compileJumperWalkingProgram([
      { sourceBlockId: 'w', forward: 0.24, yaw: 1, durationSeconds: 3 },
    ]),
  ).toThrow(/sin giro/);
});

it('compiles measured distance and waits, rejecting unvalidated turn angles', () => {
  expect(
    compileJumperWalkingProgram([
      { sourceBlockId: 'd', kind: 'distance', distanceMeters: 0.5 },
      { sourceBlockId: 'w', kind: 'wait', durationSeconds: 1 },
    ]).commands.map((c) => [c.commandId, c.inputs]),
  ).toEqual([
    ['distance', { distanceMeters: 0.5, speed: 0.24, timeoutSeconds: 27.5 }],
    ['wait', { durationSeconds: 1 }],
  ]);
  expect(() =>
    compileJumperWalkingProgram([
      { sourceBlockId: 't', kind: 'turn', angleRadians: 1 },
    ]),
  ).toThrow(/90°/);
});

it('compiles only measured quarter turns and preserves direction', () => {
  for (const sign of [-1, 1]) {
    expect(
      compileJumperWalkingProgram([
        {
          sourceBlockId: 't',
          kind: 'turn',
          angleRadians: (sign * Math.PI) / 2,
        },
      ]).commands[0],
    ).toMatchObject({
      commandId: 'turn',
      inputs: {
        angleRadians: (sign * Math.PI) / 2,
        speed: 1,
        timeoutSeconds: 45,
      },
    });
  }
  for (const angleRadians of [0, Math.PI, NaN, Infinity])
    expect(() =>
      compileJumperWalkingProgram([
        { sourceBlockId: 't', kind: 'turn', angleRadians },
      ]),
    ).toThrow(/90°/);
});

it('compiles repeated actions with unique execution IDs, source identity and iterations', () => {
  const plan = compileJumperWalkingProgram([
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
    compileJumperWalkingProgram([
      { kind: 'repeat', sourceBlockId: 'zero', count: 0, body: [] },
    ]).commands,
  ).toEqual([]);
  expect(() =>
    compileJumperWalkingProgram([
      {
        kind: 'repeat',
        sourceBlockId: 'zero',
        count: 0,
        body: [{ sourceBlockId: 'bad', kind: 'distance', distanceMeters: -1 }],
      },
    ]),
  ).toThrow(/avance/);
});
