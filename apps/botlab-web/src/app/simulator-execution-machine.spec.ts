import { createActor } from 'xstate';
import { simulatorExecutionMachine } from './simulator-execution-machine';

describe('simulator execution lifecycle', () => {
  afterEach(() => jest.useRealTimers());
  function fixture() {
    jest.useFakeTimers();
    const postMessage = jest.fn();
    const targetWindow = { postMessage } as unknown as Window;
    const actor = createActor(simulatorExecutionMachine).start();
    actor.send({
      type: 'start',
      request: {
        targetWindow,
        targetOrigin: 'https://sim.test',
        source: {
          artifactId: 'plan',
          targetId: 'microduck-sim',
          errors: [],
          messages: [],
          frames: [
            {
              type: 'differential-drive',
              id: 'wait',
              targetId: 'microduck-sim',
              leftPower: 0,
              rightPower: 0,
              durationMs: 60000,
            },
          ],
        },
      },
    });
    const request = postMessage.mock.calls[0][0];
    function status(value: string) {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://sim.test',
          source: targetWindow,
          data: {
            type: 'botlab.microduck.execution.v1',
            version: 1,
            simulatorId: 'microduck-official-sim',
            executionId: request.executionId,
            artifactId: 'plan',
            status: value,
            frameIndex: 0,
          },
        })
      );
    }
    return { actor, postMessage, status };
  }

  it('does not treat acceptance as completion and times out without engine progress', () => {
    const f = fixture();
    f.status('accepted');
    jest.advanceTimersByTime(59999);
    expect(f.actor.getSnapshot().matches({ active: 'awaiting' })).toBe(true);
    jest.advanceTimersByTime(1);
    expect(f.actor.getSnapshot().matches('failed')).toBe(true);
    expect(f.postMessage.mock.calls.at(-1)![0].type).toBe(
      'botlab.microduck.stop.v1'
    );
    f.status('completed');
    expect(f.actor.getSnapshot().matches('failed')).toBe(true);
    f.actor.stop();
  });

  it('keeps long waits alive with heartbeats but fails after the engine stops responding', () => {
    const f = fixture();
    for (let i = 0; i < 10; i++) {
      f.status('running');
      jest.advanceTimersByTime(10000);
    }
    expect(f.actor.getSnapshot().matches({ active: 'running' })).toBe(true);
    jest.advanceTimersByTime(5000);
    expect(f.actor.getSnapshot().matches('failed')).toBe(true);
    f.actor.stop();
  });

  it('cancels retries and listeners when detached during execution', () => {
    const f = fixture();
    f.actor.send({ type: 'detach' });
    expect(f.actor.getSnapshot().matches('stopped')).toBe(true);
    f.postMessage.mockClear();
    jest.advanceTimersByTime(60000);
    f.status('completed');
    expect(f.postMessage).not.toHaveBeenCalled();
    expect(f.actor.getSnapshot().matches('stopped')).toBe(true);
    f.actor.stop();
  });

  it.each(['awaiting', 'running', 'stopping', 'completed', 'stopped', 'failed'])(
    'clears %s execution on scene reset without replaying it', (state) => {
      const f = fixture();
      if (state === 'stopping') f.actor.send({ type: 'stop' });
      else if (state !== 'awaiting') f.status(state);
      f.actor.send({ type: 'scene.reset' });
      expect(f.actor.getSnapshot().matches('idle')).toBe(true);
      expect(f.actor.getSnapshot().context).toEqual({ request: undefined, update: undefined });
      if (['awaiting', 'running', 'stopping'].includes(state)) {
        expect(f.postMessage.mock.calls.at(-1)![0].type).toBe('botlab.microduck.stop.v1');
      }
      f.postMessage.mockClear();
      f.status('running');
      f.status('completed');
      jest.advanceTimersByTime(65000);
      expect(f.postMessage).not.toHaveBeenCalled();
      expect(f.actor.getSnapshot().matches('idle')).toBe(true);
      f.actor.stop();
    }
  );
});
