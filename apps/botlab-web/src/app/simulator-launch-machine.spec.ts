import { createActor, waitFor } from 'xstate';
import { botLabFlowMachine } from './botlab-flow-machine';
import { simulatorLaunchMachine } from './simulator-launch-machine';

it('prepares the current program before requesting a simulator launch', async () => {
  const flow = createActor(botLabFlowMachine, { input: {} }).start();
  flow.send({ type: 'target.selected', targetId: 'microduck-sim' });
  const launcher = createActor(simulatorLaunchMachine).start();
  const launch = jest.fn(async () => {
    /* Test double intentionally does nothing. */
  });
  try {
    launcher.send({ type: 'run', flow, launch });
    const result = await waitFor(launcher, (state) => !state.hasTag('busy'), {
      timeout: 2000,
    });
    expect(result.context.error).toBeUndefined();
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({ commands: expect.any(Array) }),
      expect.any(AbortSignal),
    );
  } finally {
    launcher.stop();
    flow.stop();
  }
});
