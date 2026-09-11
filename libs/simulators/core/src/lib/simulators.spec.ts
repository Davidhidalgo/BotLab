import {
  createSimulatorSnapshot,
  defineSimulatorIntegration,
  defineSimulatorIntegrations,
} from './simulators';

describe('simulator contracts', () => {
  it('defines simulator integrations without changing their shape', () => {
    const integration = defineSimulatorIntegration({
      id: 'microduck-official-sim',
      name: 'MicroDuck demo simulator bridge',
      status: 'available',
      dependencyStrategy: 'manual-bridge',
    });

    expect(defineSimulatorIntegrations([integration])).toEqual([integration]);
  });

  it('copies snapshot messages so callers cannot mutate stored arrays by alias', () => {
    const messages = ['ready'];
    const snapshot = createSimulatorSnapshot({
      simulatorId: 'microduck-official-sim',
      state: 'ready',
      commandCount: 0,
      messages,
    });

    messages.push('mutated');

    expect(snapshot.messages).toEqual(['ready']);
  });
});
