import { sampleMicroDuckCompiledBehaviorArtifact } from '@botlab/model/testing';
import { createMicroDuckPostureObserver } from './microduck-posture';
import {
  createMicroDuckSimulatorControlSource,
  createMicroDuckBotLabOfficialSource,
} from './microduck-simulator';
import {
  observeMicroDuckExecution,
  type MicroDuckExecutionUpdate,
} from './microduck-execution';

it('invalidates stale and reset physical observations', () => {
  const state = {
    supported: true,
    posture: 'stand' as const,
    height: 0.116,
    gyro: [0, 0, 0],
    time: 1,
    fallen: false,
  };
  const observer = createMicroDuckPostureObserver(() => state);
  observer.observe(0.02);
  state.time = 1.7;
  expect(observer.observe(0.7).observed).toBe('stand');
  expect(observer.observe(0.6).error).toBe('telemetry-unavailable');
  state.time = 0;
  expect(observer.observe(0.02).error).toBe('scene-interrupted');
});

function fixture() {
  const source = createMicroDuckSimulatorControlSource({
    ...sampleMicroDuckCompiledBehaviorArtifact,
    commands: [
      {
        id: 'if',
        commandId: 'if-posture',
        capabilityId: 'microduck-control',
        targetId: 'microduck-sim',
        sourceBlockId: 'if',
        inputs: {
          condition: { type: 'posture', posture: 'stand' },
          then: [
            {
              id: 'sit',
              capabilityId: 'microduck-posture',
              commandId: 'set-posture',
              targetId: 'microduck-sim',
              inputs: { posture: 'sit' },
            },
          ],
          else: [
            {
              id: 'walk',
              capabilityId: 'microduck-motion',
              commandId: 'drive-differential',
              targetId: 'microduck-sim',
              inputs: { leftPower: 1, rightPower: 1, distanceMeters: 1 },
            },
          ],
        },
      },
    ],
  });
  const host = Object.assign(new EventTarget(), {
    crypto: { getRandomValues: (array: Uint32Array) => array.fill(1) },
    setTimeout,
    clearTimeout,
  });
  const target = { postMessage: vi.fn() };
  const updates: MicroDuckExecutionUpdate[] = [];
  const connection = observeMicroDuckExecution(
    {
      source,
      targetWindow: target as unknown as Window,
      targetOrigin: 'https://sim.test',
    },
    (u) => updates.push(u),
    host as unknown as Window,
  );
  const reply = (data: object) =>
    host.dispatchEvent(
      Object.assign(new Event('message'), {
        source: target,
        origin: 'https://sim.test',
        data: {
          type: 'botlab.microduck.execution.v1',
          version: 1,
          simulatorId: 'microduck-official-sim',
          executionId: connection.executionId,
          artifactId: source.artifactId,
          ...data,
        },
      }),
    );
  return { source, reply, updates, connection };
}

it('lowers stable branch indices and accepts completion with proof only for the chosen branch', () => {
  const f = fixture();
  try {
    expect(f.source.errors).toEqual([]);
    expect(f.source.frames[0]).toMatchObject({
      type: 'posture-condition',
      thenIndex: 1,
      elseIndex: 3,
      endIndex: 4,
    });
    f.reply({
      status: 'running',
      frameIndex: 0,
      observedPosture: 'stand',
      conditionResult: true,
    });
    f.reply({
      status: 'running',
      frameIndex: 1,
      observedPosture: 'sit',
      postureCompleted: true,
    });
    f.reply({ status: 'completed' });
    expect(f.updates.at(-1)?.status).toBe('completed');
  } finally {
    f.connection.dispose();
  }
});

it('requires observed completion of a selected posture', () => {
  const f = fixture();
  try {
    f.reply({
      status: 'running',
      frameIndex: 0,
      observedPosture: 'stand',
      conditionResult: true,
    });
    f.reply({ status: 'completed' });
    expect(f.updates.at(-1)).toMatchObject({
      status: 'failed',
      frameIndex: 1,
      failureOrigin: 'transport',
    });
  } finally {
    f.connection.dispose();
  }
});

it('rejects contradictory decisions instead of using them to waive movement evidence', () => {
  const f = fixture();
  try {
    f.reply({
      status: 'running',
      frameIndex: 0,
      observedPosture: 'sit',
      conditionResult: true,
    });
    expect(f.updates).toEqual([]);
    f.reply({ status: 'completed' });
    expect(f.updates.at(-1)).toMatchObject({ status: 'failed', frameIndex: 0 });
  } finally {
    f.connection.dispose();
  }
});

it('the direct source also settles motion before evaluating the next condition', () => {
  const state = {
    supported: true,
    posture: 'stand' as const,
    height: 0.116,
    gyro: [0, 0, 0],
    time: 0,
    fallen: false,
  };
  let x = 0;
  const source = createMicroDuckBotLabOfficialSource({
    getVelocityLimits: () => [1, -1, 2],
    getPosition: () => [x, 0],
    getPostureState: () => state,
  });
  const tick = (n: number) => {
    for (let i = 0; i < n; i++) {
      state.time += 0.02;
      source.poll?.(0.02);
    }
  };
  tick(40);
  source.load({
    artifactId: 'handoff',
    targetId: 'sim',
    messages: [],
    errors: [],
    frames: [
      {
        id: 'walk',
        targetId: 'sim',
        type: 'differential-drive',
        leftPower: 1,
        rightPower: 1,
        distanceMeters: 0.25,
      },
      {
        id: 'if',
        targetId: 'sim',
        type: 'posture-condition',
        posture: 'stand',
        thenIndex: 2,
        elseIndex: 2,
        endIndex: 2,
      },
    ],
  });
  tick(1);
  x = 0.3;
  state.gyro = [1, 0, 0];
  tick(10);
  expect(Array.from(source.command)).toEqual([0, 0, 0]);
  state.gyro = [0, 0, 0];
  expect(() => tick(45)).not.toThrow();
  expect(source.isActive()).toBe(false);
});

it('derives iteration progress from the compiled frame instead of trusting the receiver', () => {
  const f = fixture();
  try {
    f.source.frames[0].iterations = [
      { sourceBlockId: 'loop', iteration: 2, count: 3 },
    ];
    f.reply({
      status: 'running',
      frameIndex: 0,
      iterations: [{ iteration: 99, count: 100 }],
    });
    expect(f.updates.at(-1)?.iterations).toEqual([
      { sourceBlockId: 'loop', iteration: 2, count: 3 },
    ]);
  } finally {
    f.connection.dispose();
  }
});
