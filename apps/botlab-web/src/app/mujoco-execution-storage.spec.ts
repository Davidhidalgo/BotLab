import { jumperWalkingExample } from '@botlab/blocks';
import {
  decodeMujocoExecution,
  type SavedMujocoExecution,
} from './mujoco-execution-storage';

const targetId = 'jumper-web-walking';
const trace: SavedMujocoExecution['trace'] = [1, 2, 3].map((iteration) => ({
  commandId: `walk-${iteration}`,
  sourceBlockId: 'walk',
  iterations: [{ sourceBlockId: 'repeat', iteration, count: 3 }],
  result: {
    status: 'completed',
    evidence: 'simulator',
    level: 'closed-loop-policy',
    timeSeconds: iteration * 3,
    targetDistanceMeters: 0.5,
    forwardDisplacementMeters: 0.49,
  },
}));
const saved: SavedMujocoExecution = {
  targetId,
  sourceContent: jumperWalkingExample.content,
  status: 'completed',
  startedAt: '2026-10-12T12:00:00Z',
  manifestId: 'jumper',
  modelRevision: 'test',
  mujocoVersion: '3.11.0',
  outcome: {
    executionId: 'run',
    status: 'completed',
    evidence: 'simulator',
    program: { programId: 'walking', revision: 'exact-program', targetId },
  },
  trace,
};
const decode = (value: unknown) =>
  decodeMujocoExecution(value, jumperWalkingExample, targetId);

it('round-trips repeated measurements and still reads legacy traces', () => {
  expect(decode(saved).trace).toEqual(trace);
  const legacy = trace.map(({ sourceBlockId, result }) => ({
    sourceBlockId,
    result,
  }));
  expect(decode({ ...saved, trace: legacy }).trace).toEqual(legacy);
  const longTrace = Array.from({ length: 256 }, (_, i) => ({
    ...trace[0],
    commandId: `command-${i}`,
  }));
  expect(decode({ ...saved, trace: longTrace }).trace).toHaveLength(256);
  expect(() =>
    decode({
      ...saved,
      trace: [...longTrace, { ...trace[0], commandId: 'overflow' }],
    }),
  ).toThrow();
});

it('rejects duplicate command identities and malformed iteration paths', () => {
  expect(() => decode({ ...saved, trace: [trace[0], trace[0]] })).toThrow();
  for (const iterations of [
    null,
    Array(17).fill(trace[0].iterations![0]),
    [{ sourceBlockId: 'repeat', iteration: 0, count: 3 }],
    [{ sourceBlockId: 'repeat', iteration: 4, count: 3 }],
    [{ sourceBlockId: 'repeat', iteration: 1, count: 101 }],
    [{ sourceBlockId: 'repeat', iteration: 1.5, count: 3 }],
    [{ sourceBlockId: '', iteration: 1, count: 3 }],
  ])
    expect(() =>
      decode({ ...saved, trace: [{ ...trace[0], iterations }] }),
    ).toThrow();
});

it('restores zero-repeat outcomes without fabricating physical evidence', () => {
  const zero = {
    ...saved,
    status: 'no-work',
    trace: [],
    outcome: { ...saved.outcome, status: 'no-work', evidence: 'none' },
  };
  expect(decode(zero)).toMatchObject({
    status: 'no-work',
    trace: [],
    outcome: { evidence: 'none' },
  });
  expect(() => decode({ ...zero, trace })).toThrow();
  expect(() =>
    decode({ ...zero, outcome: { ...zero.outcome, evidence: 'simulator' } }),
  ).toThrow();
});

it('restores numeric decisions with their validated snapshot, without executing them', () => {
  const result = {
    status: 'completed',
    evidence: 'simulator',
    level: 'program-evaluation',
    timeSeconds: 1,
    variableChange: { name: 'contador', value: 2 },
    decision: {
      condition: {
        sourceBlockId: 'compare',
        comparison: 'eq',
        left: { kind: 'variable', name: 'contador' },
        right: { kind: 'literal', value: 2 },
      },
      value: true,
      variables: [['contador', 2]],
    },
  };
  const report = { ...saved, trace: [{ sourceBlockId: 'compare', result }] };
  expect(decode(report).trace[0].result).toEqual(result);
  expect(() =>
    decode({
      ...report,
      trace: [
        {
          sourceBlockId: 'compare',
          result: {
            ...result,
            decision: { ...result.decision, variables: [] },
          },
        },
      ],
    }),
  ).toThrow();
  expect(() =>
    decode({
      ...report,
      trace: [
        {
          sourceBlockId: 'compare',
          result: {
            ...result,
            variableChange: { name: 'contador', value: Infinity },
          },
        },
      ],
    }),
  ).toThrow();
});
