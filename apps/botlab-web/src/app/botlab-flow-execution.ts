import { createBotLabMessage, toBotLabMessage } from '@botlab/model';
import { botLabFlowSetup } from './botlab-flow-setup';

/** `execution` region of the parallel BotLab flow machine. */
export const executionRegion = botLabFlowSetup.createStateConfig({
  initial: 'ready',
  on: {
    'workspace.changed': { target: '.ready', actions: 'invalidateRun' },
    'build.compile': { target: '.ready', actions: 'invalidateRun' },
    'target.selected': {
      target: '.ready',
      actions: 'invalidateRun',
    },
  },
  states: {
    ready: {
      tags: ['idle'],
      on: {
        'demo.run': {
          guard: { type: 'hasPassedSimulation' },
          target: 'queueing',
        },
      },
    },
    queueing: {
      tags: ['execution-busy'],
      invoke: {
        src: 'queueDemo',
        input: ({ context }) => ({
          runtime: context.runtime,
          demoSessionId: context.demoSessionId,
        }),
        onDone: {
          target: 'running',
          actions: [
            {
              type: 'setQueuedSnapshot',
              params: ({ event }) => event.output,
            },
            {
              type: 'appendFlowLog',
              params: {
                category: 'execution',
                message: createBotLabMessage(
                  'flow.log.session-queued',
                  'Session queued; starting runtime.',
                ),
              },
            },
          ],
        },
        onError: {
          target: 'failed',
          actions: [
            {
              type: 'setError',
              params: ({ event }) => ({
                message: toBotLabMessage(
                  event.error,
                  'Unknown error in the demo flow.',
                ),
              }),
            },
            {
              type: 'appendFlowLog',
              params: {
                category: 'error',
                message: createBotLabMessage(
                  'flow.log.queue-failed',
                  'Could not queue the execution.',
                ),
              },
            },
          ],
        },
      },
    },
    running: {
      tags: ['execution-busy'],
      invoke: {
        src: 'runQueuedDemo',
        input: ({ context }) => ({
          runtime: context.runtime,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.outcome.status === 'completed',
            target: 'completed',
            actions: {
              type: 'setRunResult',
              params: ({ event }) => event.output,
            },
          },
          {
            guard: ({ event }) => event.output.outcome.status === 'dispatched',
            target: 'dispatched',
            actions: {
              type: 'setRunResult',
              params: ({ event }) => event.output,
            },
          },
          {
            guard: ({ event }) => event.output.outcome.status === 'cancelled',
            target: 'cancelled',
            actions: {
              type: 'setRunResult',
              params: ({ event }) => event.output,
            },
          },
          {
            guard: ({ event }) =>
              event.output.outcome.status === 'confirmation-required',
            target: 'confirmation-required',
            actions: {
              type: 'setRunResult',
              params: ({ event }) => event.output,
            },
          },
          {
            guard: ({ event }) => event.output.outcome.status === 'no-work',
            target: 'no-work',
            actions: {
              type: 'setRunResult',
              params: ({ event }) => event.output,
            },
          },
          {
            target: 'failed',
            actions: {
              type: 'setRunResult',
              params: ({ event }) => event.output,
            },
          },
        ],
        onError: {
          target: 'failed',
          actions: [
            {
              type: 'setError',
              params: ({ event }) => ({
                message: toBotLabMessage(
                  event.error,
                  'Unknown error in the demo flow.',
                ),
              }),
            },
            {
              type: 'appendFlowLog',
              params: {
                category: 'error',
                message: createBotLabMessage(
                  'flow.log.execution-failed',
                  'Execution failed.',
                ),
              },
            },
          ],
        },
      },
    },
    dispatched: {},
    cancelled: {},
    'confirmation-required': {},
    'no-work': {},
    completed: {
      tags: ['completed'],
      on: {
        'demo.run': {
          guard: { type: 'hasPassedSimulation' },
          target: 'queueing',
        },
      },
    },
    failed: {
      tags: ['error'],
      on: {
        'demo.run': {
          guard: { type: 'hasPassedSimulation' },
          target: 'queueing',
        },
      },
    },
  },
});
