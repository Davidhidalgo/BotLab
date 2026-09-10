import type { SimulatorIntegration } from '@botlab/model';

export const officialSimulatorIntegrations: SimulatorIntegration[] = [
  {
    id: 'microduck-official-sim',
    name: 'MicroDuck official simulator',
    status: 'planned',
    dependencyStrategy: 'official-package',
  },
  {
    id: 'stackchan-sim-bridge',
    name: 'StackChan simulator bridge',
    status: 'planned',
    dependencyStrategy: 'manual-bridge',
  },
];
