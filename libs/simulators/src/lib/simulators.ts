import type { SimulatorIntegration } from '@botlab/model';

export const officialSimulatorIntegrations: SimulatorIntegration[] = [
  {
    id: 'microduck-official-sim',
    name: 'MicroDuck demo simulator bridge',
    status: 'available',
    dependencyStrategy: 'manual-bridge',
  },
  {
    id: 'stackchan-sim-bridge',
    name: 'StackChan simulator bridge',
    status: 'planned',
    dependencyStrategy: 'manual-bridge',
  },
];
