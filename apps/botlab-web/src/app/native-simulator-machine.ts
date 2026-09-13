import { assign, fromCallback, fromPromise, setup } from 'xstate';
import {
  createNativeAppConnection,
  type NativeAppConnection,
  type NativeAppSnapshot,
  type NativeProgramStep,
} from '@botlab/simulators-microduck-native';

type Operation =
  | { kind: 'run'; steps: NativeProgramStep[] }
  | { kind: 'stop' | 'reset' | 'posture' };
type Event =
  | { type: 'connect' }
  | { type: 'disconnect' }
  | { type: 'connected' }
  | { type: 'snapshot'; snapshot: NativeAppSnapshot }
  | { type: 'failure'; error: string }
  | { type: 'operate'; operation: Operation };

export const nativeSimulatorMachine = setup({
  types: {} as {
    input: { url: string; factory?: typeof createNativeAppConnection };
    context: {
      url: string;
      factory: typeof createNativeAppConnection;
      connection?: NativeAppConnection;
      snapshot?: NativeAppSnapshot;
      error?: string;
      operation?: Operation;
      runId?: string;
    };
    events: Event;
  },
  actors: {
    session: fromCallback<Event, NativeAppConnection>(({ input, sendBack }) => {
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const failed = (error: unknown) => {
        if (active)
          sendBack({
            type: 'failure',
            error: error instanceof Error ? error.message : String(error),
          });
      };
      async function poll() {
        try {
          const snapshot = await input.snapshot();
          if (!active) return;
          sendBack({ type: 'snapshot', snapshot });
          timer = setTimeout(() => void poll(), 200);
        } catch (error) {
          failed(error);
        }
      }
      void input
        .connect()
        .then(() => {
          if (!active) {
            input.dispose();
            return;
          }
          sendBack({ type: 'connected' });
          void poll();
        })
        .catch(failed);
      return () => {
        active = false;
        clearTimeout(timer);
        input.dispose();
      };
    }),
    command: fromPromise(
      async ({
        input,
      }: {
        input: { connection: NativeAppConnection; operation: Operation };
      }) => {
        switch (input.operation.kind) {
          case 'run':
            return input.connection.run(input.operation.steps);
          case 'stop':
            await input.connection.stop();
            break;
          case 'reset':
            await input.connection.reset();
            break;
          case 'posture':
            await input.connection.togglePosture();
            break;
        }
        return undefined;
      }
    ),
  },
  guards: {
    finished: ({ context, event }) =>
      event.type === 'snapshot' &&
      event.snapshot.program?.runId === context.runId &&
      event.snapshot.program?.status !== 'running',
    runsProgram: ({ context }) => context.operation?.kind === 'run',
  },
  actions: {
    remember: assign({
      snapshot: ({ event }) =>
        event.type === 'snapshot' ? event.snapshot : undefined,
    }),
    begin: assign(({ context }) => ({
      connection: context.factory(context.url),
      snapshot: undefined,
      error: undefined,
      runId: undefined,
    })),
    operation: assign({
      operation: ({ event }) =>
        event.type === 'operate' ? event.operation : undefined,
      error: undefined,
    }),
  },
}).createMachine({
  id: 'nativeSimulator',
  initial: 'offline',
  context: ({ input }) => ({
    url: input.url,
    factory: input.factory ?? createNativeAppConnection,
  }),
  states: {
    offline: { on: { connect: { target: 'online', actions: 'begin' } } },
    failed: { on: { connect: { target: 'online', actions: 'begin' } } },
    online: {
      initial: 'connecting',
      invoke: {
        src: 'session',
        input: ({ context }) => {
          if (!context.connection)
            throw new Error('Missing native connection.');
          return context.connection;
        },
      },
      on: {
        disconnect: { target: 'offline' },
        failure: {
          target: 'failed',
          actions: assign({ error: ({ event }) => event.error }),
        },
        snapshot: { actions: 'remember' },
      },
      states: {
        connecting: { tags: ['busy'], on: { connected: { target: 'ready' } } },
        ready: { on: { operate: { target: 'command', actions: 'operation' } } },
        active: {
          tags: ['busy'],
          on: {
            snapshot: [
              { guard: 'finished', target: 'ready', actions: 'remember' },
              { actions: 'remember' },
            ],
            operate: {
              guard: ({ event }) => event.operation.kind === 'stop',
              target: 'command',
              actions: 'operation',
            },
          },
        },
        command: {
          tags: ['busy'],
          invoke: {
            src: 'command',
            input: ({ context }) => {
              if (!context.connection || !context.operation)
                throw new Error('Missing native operation.');
              return {
                connection: context.connection,
                operation: context.operation,
              };
            },
            onDone: [
              {
                guard: 'runsProgram',
                target: 'active',
                actions: assign({ runId: ({ event }) => event.output }),
              },
              { target: 'ready' },
            ],
            onError: {
              target: 'ready',
              actions: assign({ error: ({ event }) => String(event.error) }),
            },
          },
          on: {
            operate: {
              guard: ({ event }) => event.operation.kind === 'stop',
              target: 'command',
              reenter: true,
              actions: 'operation',
            },
          },
        },
      },
    },
  },
});
