import { createActor } from 'xstate';
import { botLabFlowMachine } from './botlab-flow-machine';

describe('botLabFlowMachine', () => {
  it('models the demo run flow from ready to completed', async () => {
    const actor = createActor(botLabFlowMachine);

    actor.start();

    expect(actor.getSnapshot().value).toBe('ready');

    const completed = new Promise<void>((resolve, reject) => {
      const subscription = actor.subscribe((snapshot) => {
        if (snapshot.matches('completed')) {
          globalThis.clearTimeout(timeout);
          subscription.unsubscribe();
          resolve();
        }
      });
      const timeout = globalThis.setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error('BotLab flow did not complete in time.'));
      }, 1000);
    });

    actor.send({ type: 'demo.run' });
    await completed;

    expect(actor.getSnapshot().value).toBe('completed');
    expect(actor.getSnapshot().context.runMessage).toContain('1 comando(s) enviados');
  });
});
