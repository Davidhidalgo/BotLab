import { createActor, waitFor } from 'xstate';
import { nativeSimulatorMachine } from './native-simulator-machine';
import type {
  NativeAppConnection,
  NativeAppSnapshot,
} from '@botlab/simulators-microduck-native';

function fixture() {
  let data: NativeAppSnapshot = {
    protocolVersion: 1,
    simulatorId: 'microduck',
    presentation: 'embedded',
    frameTime: 1,
    state: null,
    depth: null,
    program: null,
    postureBusy: false,
    capabilities: { skills: ['sit_toggle'], postures: ['sit', 'stand'] },
  };
  const connection: NativeAppConnection = {
    videoUrl: 'http://local/video?token=test',
    connect: jest.fn(async () => undefined),
    snapshot: jest.fn(async () => data),
    run: jest.fn(async () => '00000000-0000-4000-8000-000000000001'),
    stop: jest.fn(async () => undefined),
    reset: jest.fn(async () => undefined),
    togglePosture: jest.fn(async () => undefined),
    dispose: jest.fn(),
  };
  const actor = createActor(nativeSimulatorMachine, {
    input: { url: 'http://local', factory: () => connection },
  }).start();
  return {
    actor,
    connection,
    update: (snapshot: NativeAppSnapshot) => {
      data = snapshot;
      actor.send({ type: 'snapshot', snapshot });
    },
  };
}

describe('native simulator lifecycle', () => {
  it('releases communication on unmount', async () => {
    const f = fixture();
    f.actor.send({ type: 'connect' });
    await waitFor(f.actor, (s) => s.matches({ online: 'ready' }));
    f.actor.stop();
    expect(f.connection.dispose).toHaveBeenCalledTimes(1);
  });
  it('stops a running program and waits for acknowledgement', async () => {
    const f = fixture();
    f.actor.send({ type: 'connect' });
    await waitFor(f.actor, (s) => s.matches({ online: 'ready' }));
    f.actor.send({
      type: 'operate',
      operation: { kind: 'run', steps: [{ kind: 'wait', value: 1 }] },
    });
    await waitFor(f.actor, (s) => s.matches({ online: 'active' }));
    f.actor.send({ type: 'operate', operation: { kind: 'stop' } });
    await waitFor(f.actor, (s) => s.matches({ online: 'ready' }));
    expect(f.connection.stop).toHaveBeenCalledTimes(1);
    f.actor.stop();
  });
  it('uses the shared result contract and ignores another native run or late progress', async () => {
    const f = fixture();
    f.actor.send({ type: 'connect' });
    await waitFor(f.actor, (state) => state.matches({ online: 'ready' }));
    f.actor.send({
      type: 'operate',
      operation: { kind: 'run', steps: [{ kind: 'wait', value: 1 }] },
    });
    await waitFor(f.actor, (state) => state.matches({ online: 'active' }));
    expect(f.actor.getSnapshot().context.execution).toMatchObject({
      status: 'accepted',
      evidence: 'none',
      program: { targetId: 'microduck-native' },
    });
    const base = await f.connection.snapshot();
    const program: NonNullable<NativeAppSnapshot['program']> = {
      runId: 'foreign',
      status: 'completed',
      index: 0,
      count: 1,
      step: { kind: 'wait', value: 1 },
      progress: 1,
      error: null,
    };
    f.update({ ...base, program });
    expect(f.actor.getSnapshot().context.execution?.status).toBe('accepted');
    expect(f.actor.getSnapshot().context.snapshot?.program).toBeNull();
    f.update({
      ...base,
      program: { ...program, runId: '00000000-0000-4000-8000-000000000001' },
    });
    expect(f.actor.getSnapshot().context.execution).toMatchObject({
      status: 'completed',
      evidence: 'simulator',
    });
    f.update({
      ...base,
      program: {
        ...program,
        runId: '00000000-0000-4000-8000-000000000001',
        status: 'running',
      },
    });
    expect(f.actor.getSnapshot().context.execution?.status).toBe('completed');
    expect(f.actor.getSnapshot().context.snapshot?.program?.status).toBe(
      'completed',
    );
    f.actor.stop();
  });

  it('records connection loss as failure rather than native completion', async () => {
    const f = fixture();
    f.actor.send({ type: 'connect' });
    await waitFor(f.actor, (state) => state.matches({ online: 'ready' }));
    f.actor.send({
      type: 'operate',
      operation: { kind: 'run', steps: [{ kind: 'wait', value: 1 }] },
    });
    await waitFor(f.actor, (state) => state.matches({ online: 'active' }));
    f.actor.send({ type: 'failure', error: 'connection lost' });
    expect(f.actor.getSnapshot().context.execution).toMatchObject({
      status: 'failed',
      diagnostic: { code: 'transport-failed' },
    });
    f.actor.stop();
  });

  it('connection loss exits the session and does not auto-reconnect', async () => {
    const f = fixture();
    f.actor.send({ type: 'connect' });
    await waitFor(f.actor, (s) => s.matches({ online: 'ready' }));
    f.actor.send({ type: 'failure', error: 'connection lost' });
    expect(f.actor.getSnapshot().matches('failed')).toBe(true);
    expect(f.connection.dispose).toHaveBeenCalledTimes(1);
    expect(f.connection.connect).toHaveBeenCalledTimes(1);
    f.actor.stop();
  });
});
