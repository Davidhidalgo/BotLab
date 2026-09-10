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
      },
    ],
    capabilities: [
      {
        id: 'stackchan-expression',
        kind: 'expression',
        name: 'Face expression',
        description: 'Future expressive output capability for StackChan.',
        targetIds: ['stackchan-planned'],
      },
      {
        id: 'stackchan-sound',
        kind: 'sound',
        name: 'Speech and sound',
        description: 'Future audio capability for StackChan behaviors.',
        targetIds: ['stackchan-planned'],
      },
    ],
  };
}
