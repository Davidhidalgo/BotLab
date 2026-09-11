import { defineSimulatorIntegrations } from '@botlab/simulators-core';

export const microDuckSimulatorIntegrations = defineSimulatorIntegrations([
  {
    id: 'microduck-official-sim',
    name: 'MicroDuck demo simulator bridge',
    status: 'available',
    dependencyStrategy: 'manual-bridge',
  },
]);
