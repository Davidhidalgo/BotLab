import type { BotLabAdapter } from '@botlab/model';

export function createMicroDuckAdapter(): BotLabAdapter {
  return {
    id: 'microduck',
    name: 'MicroDuck',
    status: 'available',
    targets: [
      {
        id: 'microduck-usb',
        name: 'MicroDuck USB',
        kind: 'robot',
        adapterId: 'microduck',
        status: 'available',
      },
      {
        id: 'microduck-sim',
        name: 'MicroDuck Simulator',
        kind: 'simulator',
        adapterId: 'microduck',
        status: 'planned',
      },
    ],
    capabilities: [
      {
        id: 'microduck-leds',
        kind: 'light',
        name: 'LED matrix',
        description: 'Initial light output capability for MicroDuck behaviors.',
        targetIds: ['microduck-usb', 'microduck-sim'],
      },
      {
        id: 'microduck-motion',
        kind: 'motion',
        name: 'Differential movement',
        description: 'Motion capability placeholder for future hardware integration.',
        targetIds: ['microduck-usb', 'microduck-sim'],
      },
    ],
  };
}
