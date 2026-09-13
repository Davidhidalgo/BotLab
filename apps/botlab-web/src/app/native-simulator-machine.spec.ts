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
    run: jest.fn(async () => 'run-1'),
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
