import { assign, fromPromise, setup } from 'xstate';
import { runStackChanProgram } from '@botlab/adapters-stackchan';
import type { ExecutionResult } from '@botlab/model';

type Request = Parameters<typeof runStackChanProgram>[0];
export const stackChanExecutionMachine = setup({
  types: {} as {
    context: { request?: Request; result?: ExecutionResult; error?: string };
    events:
      | { type: 'run'; request: Request }
      | { type: 'cancel' }
      | { type: 'source.changed' }
      | { type: 'connection.lost' };
  },
  actors: {
    execute: fromPromise(
      ({ input, signal }: { input: Request; signal: AbortSignal }) =>
        runStackChanProgram(input, signal),
    ),
  },
  actions: {
    prepare: assign(({ event }) =>
      event.type === 'run'
        ? { request: event.request, result: undefined, error: undefined }
        : {},
    ),
    clear: assign({ result: undefined, error: undefined }),
  },
}).createMachine({
  id: 'stackchan-execution',
  initial: 'idle',
  context: {},
  on: {
    run: { target: '.running', actions: 'prepare' },
    'source.changed': { target: '.idle', actions: 'clear' },
  },
  states: {
    idle: {},
    running: {
      invoke: {
        src: 'execute',
        input: ({ context }) => {
          if (!context.request) throw new Error('Missing program');
          return context.request;
        },
        onDone: {
          target: 'finished',
          actions: assign({
            result: ({ event }) => event.output,
            request: undefined,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error
                ? event.error.message
                : String(event.error),
            request: undefined,
          }),
        },
      },
      after: {
        120000: {
          target: 'failed',
          actions: assign({ error: 'Sequence time limit reached' }),
        },
      },
      on: {
        'connection.lost': {
          target: 'failed',
          actions: assign({
            error: 'Bluetooth disconnected; sequence interrupted',
          }),
        },
        run: {},
        cancel: { target: 'cancelled' },
        'source.changed': { target: 'cancelled', actions: 'clear' },
      },
    },
    finished: {},
    failed: {},
    cancelled: {},
  },
});
