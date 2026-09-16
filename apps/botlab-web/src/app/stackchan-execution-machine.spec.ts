import { createActor } from 'xstate';
import { stackChanExecutionMachine } from './stackchan-execution-machine';
import type { StackChanBleConnection } from '@botlab/adapters-stackchan';

describe('StackChan execution lifecycle', () => {
  afterEach(() => jest.useRealTimers());
  it.each(['cancel', 'source.changed'] as const)(
    '%s aborts the actor and prevents later writes',
    async (type) => {
      jest.useFakeTimers();
      const connection: StackChanBleConnection = {
        motionState: { yaw: 0, moves: 0 },
        deviceId: 'd',
        deviceName: 'd',
        sendYaw: jest.fn(async () => ({
          status: 'dispatched' as const,
          evidence: 'dispatch' as const,
        })),
        sendLeds: jest.fn(),
        disconnect: jest.fn(),
      };
      const actor = createActor(stackChanExecutionMachine).start();
      const request = {
        connection,
        programId: 'p',
        onBlock: jest.fn(),
        steps: [
          { type: 'yaw' as const, degrees: 10, sourceBlockId: 'm' },
          {
            type: 'led' as const,
            side: 'both' as const,
            color: '#ffffff',
            brightness: 15,
            sourceBlockId: 'l',
          },
        ],
      };
      actor.send({ type: 'run', request });
      actor.send({ type: 'run', request }); // Double clicks cannot launch another sequence.
      await jest.advanceTimersByTimeAsync(100);
      expect(connection.sendYaw).toHaveBeenCalledTimes(1);
      actor.send({ type });
      await jest.advanceTimersByTimeAsync(10000);
      expect(actor.getSnapshot().matches('cancelled')).toBe(true);
      expect(connection.disconnect).toHaveBeenCalled();
      expect(connection.sendLeds).not.toHaveBeenCalled();
      expect(request.onBlock).toHaveBeenLastCalledWith(undefined);
      actor.stop();
    },
  );
});
