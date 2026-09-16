import type { BotLabAdapter } from '@botlab/model';

export function createStackChanAdapter(): BotLabAdapter {
  return {
    id: 'stackchan',
    name: 'StackChan',
    status: 'planned',
    targets: [
      {
        id: 'stackchan-planned',
        name: 'StackChan',
        kind: 'robot',
        adapterId: 'stackchan',
        status: 'planned',
        profile: {
          hardware: {
            family: 'StackChan',
          },
          simulator: {
            supported: false,
          },
          connection: {
            modes: ['bluetooth'],
            defaultMode: 'bluetooth',
            discovery: 'manual',
          },
        },
      },
    ],
    capabilities: [
      {
        id: 'stackchan-yaw',
        kind: 'motion',
        name: 'Limited horizontal head movement',
        description:
          'DANCE Bluetooth: absolute yaw ±20°, low speed, changes up to 10°.',
        targetIds: ['stackchan-planned'],
        schema: {
          commands: [
            {
              id: 'yaw',
              name: 'Horizontal position',
              description: 'Absolute yaw, changes up to 10°, at low speed.',
              inputs: [
                {
                  name: 'degrees',
                  type: 'number',
                  required: true,
                  min: -20,
                  max: 20,
                },
              ],
            },
          ],
          telemetry: [],
        },
      },
      {
        id: 'stackchan-leds',
        kind: 'light',
        name: 'Side LEDs',
        description: 'DANCE Bluetooth: left/right/both, brightness up to 25%.',
        targetIds: ['stackchan-planned'],
        schema: {
          commands: [
            {
              id: 'leds',
              name: 'Set LEDs',
              description: 'Side LED color and bounded brightness.',
              inputs: [
                { name: 'color', type: 'color', required: true },
                {
                  name: 'side',
                  type: 'enum',
                  required: true,
                  enumValues: ['both', 'left', 'right'],
                },
                {
                  name: 'brightness',
                  type: 'number',
                  required: true,
                  min: 0,
                  max: 25,
                },
              ],
            },
          ],
          telemetry: [],
        },
      },
      {
        id: 'stackchan-expression',
        kind: 'expression',
        name: 'Face expression',
        description: 'Future expressive output capability for StackChan.',
        targetIds: ['stackchan-planned'],
        schema: {
          commands: [
            {
              id: 'set-expression',
              name: 'Set expression',
              description: 'Display a named facial expression.',
              inputs: [
                {
                  name: 'expression',
                  type: 'enum',
                  required: true,
                  enumValues: ['happy', 'neutral', 'surprised', 'sleepy'],
                },
              ],
            },
          ],
          telemetry: [],
        },
      },
      {
        id: 'stackchan-sound',
        kind: 'sound',
        name: 'Speech and sound',
        description: 'Future audio capability for StackChan behaviors.',
        targetIds: ['stackchan-planned'],
        schema: {
          commands: [
            {
              id: 'speak',
              name: 'Speak',
              description: 'Play synthesized speech or a short phrase.',
              inputs: [
                {
                  name: 'text',
                  type: 'string',
                  required: true,
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
