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
        profile: {
          hardware: {
            family: 'MicroDuck',
          },
          firmware: {
            name: 'MicroDuck firmware',
          },
          simulator: {
            supported: true,
            integrationId: 'microduck-official-sim',
          },
          connection: {
            modes: ['usb', 'serial'],
            defaultMode: 'usb',
            discovery: 'manual',
          },
        },
      },
      {
        id: 'microduck-sim',
        name: 'MicroDuck Simulator',
        kind: 'simulator',
        adapterId: 'microduck',
        status: 'available',
        profile: {
          hardware: {
            family: 'MicroDuck',
            model: 'Simulator',
          },
          simulator: {
            supported: true,
            integrationId: 'microduck-official-sim',
          },
          connection: {
            modes: ['simulator'],
            defaultMode: 'simulator',
            discovery: 'automatic',
          },
        },
      },
    ],
    capabilities: [
      {
        id: 'microduck-leds',
        kind: 'light',
        name: 'LED matrix',
        description: 'Initial light output capability for MicroDuck behaviors.',
        targetIds: ['microduck-usb', 'microduck-sim'],
        schema: {
          commands: [
            {
              id: 'set-led-pattern',
              name: 'Set LED pattern',
              description: 'Render a named LED pattern with a brightness value.',
              confirmationRequired: true,
              inputs: [
                {
                  name: 'pattern',
                  type: 'enum',
                  required: true,
                  enumValues: ['smile', 'blink', 'solid', 'off'],
                },
                {
                  name: 'brightness',
                  type: 'number',
                  required: true,
                  min: 0,
                  max: 100,
                },
              ],
            },
          ],
          telemetry: [],
        },
      },
      {
        id: 'microduck-motion',
        kind: 'motion',
        name: 'Differential movement',
        description: 'Motion capability placeholder for future hardware integration.',
        targetIds: ['microduck-usb', 'microduck-sim'],
        schema: {
          commands: [
            {
              id: 'drive-differential',
              name: 'Drive differential motors',
              description: 'Drive left and right motors with normalized power.',
              inputs: [
                {
                  name: 'leftPower',
                  type: 'number',
                  required: true,
                  min: -1,
                  max: 1,
                },
                {
                  name: 'rightPower',
                  type: 'number',
                  required: true,
                  min: -1,
                  max: 1,
                },
              ],
            },
          ],
          telemetry: [],
        },
      },
    ],
  };
}
