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
            modes: ['wifi', 'manual'],
            defaultMode: 'manual',
            discovery: 'planned',
          },
        },
      },
    ],
    capabilities: [
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
