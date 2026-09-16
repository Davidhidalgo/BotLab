import {
  createProgramIdentity,
  type ProgramIdentity,
  type ExecutionResult,
} from '@botlab/model';
import { createExecutionLifecycle } from '@botlab/runtime';
import { assign, fromCallback, fromPromise, setup } from 'xstate';
import {
  createNativeAppConnection,
  type NativeAppConnection,
  type NativeAppSnapshot,
  type NativeProgramStep,
} from '@botlab/simulators-microduck-native';

type Operation =
  | { kind: 'run'; steps: NativeProgramStep[]; program?: ProgramIdentity }
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
      execution?: ExecutionResult;
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
      },
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
    cancelExecution: assign(({ context }) => {
      if (!context.execution) return {};
      const lifecycle = createExecutionLifecycle(
        context.execution.executionId,
        context.execution.program,
      );
      lifecycle.update(context.execution);
      lifecycle.update({
        ...context.execution,
        status: 'cancelled',
        evidence: 'none',
        diagnostic: { code: 'execution-cancelled' },
      });
      return { execution: lifecycle.snapshot() };
    }),
    failExecution: assign(({ context, event }) => {
      if (!context.execution) return {};
      const lifecycle = createExecutionLifecycle(
        context.execution.executionId,
        context.execution.program,
      );
      lifecycle.update(context.execution);
      lifecycle.update({
        ...context.execution,
        status: 'failed',
        evidence: 'none',
        diagnostic: {
          code: 'transport-failed',
          message: event.type === 'failure' ? event.error : undefined,
        },
      });
      return { execution: lifecycle.snapshot() };
    }),
    remember: assign(({ context, event }) => {
      if (event.type !== 'snapshot') return {};
      const program = event.snapshot.program;
      if (!program) return { snapshot: event.snapshot };
      if (program.runId !== context.runId || !context.execution) {
        return {
          snapshot: {
            ...event.snapshot,
            program:
              context.runId &&
              context.snapshot?.program?.runId === context.runId
                ? (context.snapshot?.program ?? null)
                : null,
          },
        };
      }
      const lifecycle = createExecutionLifecycle(
        context.execution.executionId,
        context.execution.program,
      );
      lifecycle.update(context.execution);
      const accepted = lifecycle.update({
        ...context.execution,
        status: program.status === 'stopped' ? 'cancelled' : program.status,
        evidence: program.status === 'completed' ? 'simulator' : 'none',
        sourceBlockId: program.step?.sourceBlockId,
        diagnostic:
          program.status === 'failed'
            ? {
                code: 'simulator-failed',
                message: program.errorCode ?? program.error ?? undefined,
              }
            : program.status === 'stopped'
              ? { code: 'execution-cancelled' }
              : undefined,
      });
      return {
        snapshot: accepted
          ? event.snapshot
          : { ...event.snapshot, program: context.snapshot?.program ?? null },
        execution: lifecycle.snapshot(),
      };
    }),
    begin: assign(({ context }) => ({
      connection: context.factory(context.url),
      snapshot: undefined,
      error: undefined,
      runId: undefined,
      execution: undefined,
    })),
    operation: assign({
      snapshot: ({ context, event }) =>
        event.type === 'operate' &&
        ['run', 'reset'].includes(event.operation.kind) &&
        context.snapshot
          ? { ...context.snapshot, program: null }
          : context.snapshot,
      runId: ({ context, event }) =>
        event.type === 'operate' &&
        ['run', 'reset'].includes(event.operation.kind)
          ? undefined
          : context.runId,
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
        disconnect: { target: 'offline', actions: 'cancelExecution' },
        failure: {
          target: 'failed',
          actions: [
            'failExecution',
            assign({ error: ({ event }) => event.error }),
          ],
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
                actions: assign(({ context, event }) => {
                  if (!event.output || context.operation?.kind !== 'run')
                    return {};
                  const program =
                    context.operation.program ??
                    createProgramIdentity(
                      'native-program',
                      'microduck-native',
                      context.operation.steps,
                    );
                  const lifecycle = createExecutionLifecycle(
                    event.output,
                    program,
                  );
                  lifecycle.update({
                    ...lifecycle.snapshot(),
                    status: 'accepted',
                  });
                  return {
                    runId: event.output,
                    execution: lifecycle.snapshot(),
                  };
                }),
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
