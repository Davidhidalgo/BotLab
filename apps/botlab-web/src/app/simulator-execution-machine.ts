import { assign, fromCallback, sendTo, setup } from 'xstate';
import {
  observeMicroDuckExecution,
  type MicroDuckExecutionRequest,
  type MicroDuckExecutionUpdate,
} from '@botlab/simulators-microduck';

export const simulatorExecutionMachine = setup({
  types: {} as {
    context: {
      request?: MicroDuckExecutionRequest;
      update?: MicroDuckExecutionUpdate;
    };
    events:
      | { type: 'start'; request: MicroDuckExecutionRequest }
      | { type: 'status'; update: MicroDuckExecutionUpdate }
      | { type: 'stop' }
      | { type: 'scene.reset' }
      | { type: 'detach' };
  },
  actors: {
    transport: fromCallback<{ type: 'stop' }, MicroDuckExecutionRequest>(
      ({ input, sendBack, receive }) => {
        const client = observeMicroDuckExecution(input, (update) =>
          sendBack({ type: 'status', update })
        );
        receive(() => client.stop());
        return () => client.dispose();
      }
    ),
  },
  actions: {
    remember: assign({
      update: ({ context, event }) =>
        event.type === 'status' ? event.update : context.update,
    }),
  },
}).createMachine({
  id: 'simulatorExecution',
  initial: 'idle',
  context: {},
  on: {
    'scene.reset': {
      target: '.idle',
      actions: assign({ request: undefined, update: undefined }),
    },
    start: {
      target: '.active',
      reenter: true,
      actions: assign({
        request: ({ event }) => event.request,
        update: undefined,
      }),
    },
  },
  states: {
    idle: {},
    active: {
      tags: ['busy'],
      initial: 'awaiting',
      invoke: {
        id: 'transport',
        src: 'transport',
        input: ({ context }) => context.request!,
      },
      on: {
        stop: { target: '.stopping' },
        detach: { target: 'stopped' },
        status: [
          {
            guard: ({ event }) => event.update.status === 'completed',
            target: 'completed',
            actions: 'remember',
          },
          {
            guard: ({ event }) => event.update.status === 'stopped',
            target: 'stopped',
            actions: 'remember',
          },
          {
            guard: ({ event }) => event.update.status === 'failed',
            target: 'failed',
            actions: 'remember',
          },
          { actions: 'remember' },
        ],
      },
      states: {
        awaiting: {
          after: { 60000: { target: '#simulatorExecution.failed' } },
          on: {
            status: {
              guard: ({ event }) => event.update.status === 'running',
              target: 'running',
              actions: 'remember',
            },
          },
        },
        running: {
          after: { 15000: { target: '#simulatorExecution.failed' } },
          on: {
            status: {
              guard: ({ event }) => event.update.status === 'running',
              target: 'running',
              reenter: true,
              actions: 'remember',
            },
          },
        },
        stopping: {
          entry: sendTo('transport', { type: 'stop' }),
          after: { 3000: { target: '#simulatorExecution.failed' } },
        },
      },
    },
    completed: {},
    stopped: {},
    failed: {},
  },
});
