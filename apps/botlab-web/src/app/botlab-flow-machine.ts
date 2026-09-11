import { createMicroDuckAdapter } from '@botlab/adapters-microduck';
import { createStackChanAdapter } from '@botlab/adapters-stackchan';
import {
  sampleArbitrationStrategies,
  sampleMicroDuckCompiledBehaviorArtifact,
  sampleMicroDuckLedBehavior,
  samplePolicies,
  sampleSchedulers,
  sampleSkills,
} from '@botlab/model';
import {
  createBotLabRuntime,
  type BotLabRuntime,
  type RuntimeIntrospectionSnapshot,
  type RuntimeRunResult,
} from '@botlab/runtime';
import { officialSimulatorIntegrations } from '@botlab/simulators';
import { assign, fromPromise, setup } from 'xstate';

export type BotLabFlowState =
  | 'ready'
  | 'queueing'
  | 'running'
  | 'completed'
  | 'failed';

export interface BotLabFlowContext {
  runtime: BotLabRuntime;
  demoSessionId: string;
  runtimeSnapshot: RuntimeIntrospectionSnapshot;
  runMessage: string;
  errorMessage?: string;
}

interface QueueDemoInput {
  runtime: BotLabRuntime;
  demoSessionId: string;
}

interface QueueDemoOutput {
  runtimeSnapshot: RuntimeIntrospectionSnapshot;
}

interface RunQueuedDemoInput {
  runtime: BotLabRuntime;
}

interface RunQueuedDemoOutput {
  runtimeSnapshot: RuntimeIntrospectionSnapshot;
  runMessage: string;
}

export const botLabFlowMachine = setup({
  types: {} as {
    context: BotLabFlowContext;
    events: { type: 'demo.run' };
  },
  actors: {
    queueDemo: fromPromise(async ({ input }: { input: QueueDemoInput }) => {
      input.runtime.queueSession(input.demoSessionId, { priority: 5 });

      return {
        runtimeSnapshot: input.runtime.inspectRuntime(),
      };
    }),
    runQueuedDemo: fromPromise(async ({ input }: { input: RunQueuedDemoInput }) => {
      const result = await input.runtime.runNextQueuedSession();

      return {
        runtimeSnapshot: input.runtime.inspectRuntime(),
        runMessage: formatRunMessage(result),
      };
    }),
  },
  actions: {
    setQueuedSnapshot: assign({
      runtimeSnapshot: (_, params: QueueDemoOutput) => params.runtimeSnapshot,
      runMessage: () => 'Demo en cola para MicroDuck.',
      errorMessage: () => undefined,
    }),
    setRunResult: assign({
      runtimeSnapshot: (_, params: RunQueuedDemoOutput) => params.runtimeSnapshot,
      runMessage: (_, params: RunQueuedDemoOutput) => params.runMessage,
      errorMessage: () => undefined,
    }),
    setError: assign({
      errorMessage: (_, params: { message: string }) => params.message,
      runMessage: (_, params: { message: string }) => params.message,
    }),
  },
}).createMachine({
  id: 'botlabFlow',
  context: createBotLabFlowContext,
  initial: 'ready',
  states: {
    ready: {
      tags: ['idle'],
      on: {
        'demo.run': {
          target: 'queueing',
        },
      },
    },
    queueing: {
      tags: ['busy'],
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
          ],
        },
        onError: {
          target: 'failed',
          actions: [
            {
              type: 'setError',
              params: ({ event }) => ({
                message: formatErrorMessage(event.error),
              }),
            },
          ],
        },
      },
    },
    running: {
      tags: ['busy'],
      invoke: {
        src: 'runQueuedDemo',
        input: ({ context }) => ({
          runtime: context.runtime,
        }),
        onDone: {
          target: 'completed',
          actions: [
            {
              type: 'setRunResult',
              params: ({ event }) => event.output,
            },
          ],
        },
        onError: {
          target: 'failed',
          actions: [
            {
              type: 'setError',
              params: ({ event }) => ({
                message: formatErrorMessage(event.error),
              }),
            },
          ],
        },
      },
    },
    completed: {
      tags: ['completed'],
      on: {
        'demo.run': {
          target: 'queueing',
        },
      },
    },
    failed: {
      tags: ['error'],
      on: {
        'demo.run': {
          target: 'queueing',
        },
      },
    },
  },
});

export const botLabFlowSteps: Array<{
  state: BotLabFlowState;
  label: string;
}> = [
  { state: 'ready', label: 'Preparada' },
  { state: 'queueing', label: 'En cola' },
  { state: 'running', label: 'Ejecutando' },
  { state: 'completed', label: 'Completada' },
  { state: 'failed', label: 'Error' },
];

export const botLabFlowStateLabels: Record<BotLabFlowState, string> = {
  ready: 'Preparada',
  queueing: 'En cola',
  running: 'Ejecutando',
  completed: 'Completada',
  failed: 'Error',
};

function createBotLabFlowContext(): BotLabFlowContext {
  const runtime = createBotLabRuntime({
    adapters: [createMicroDuckAdapter(), createStackChanAdapter()],
    simulators: officialSimulatorIntegrations,
    behaviors: [sampleMicroDuckLedBehavior],
    skills: sampleSkills,
    schedulers: sampleSchedulers,
    arbitrationStrategies: sampleArbitrationStrategies,
    policies: samplePolicies,
    dispatchers: [
      {
        targetId: 'microduck-usb',
        async dispatch(command) {
          await new Promise((resolve) => {
            globalThis.setTimeout(resolve, 250);
          });

          return {
            commandId: command.id,
            status: 'dispatched',
            message: `Demo dispatch ${command.commandId}.`,
          };
        },
      },
    ],
  });
  const session = runtime.createSession({ id: 'demo-microduck-leds' });

  runtime.loadCompiledBehavior(session.id, sampleMicroDuckCompiledBehaviorArtifact);
  runtime.confirmPolicy(session.id);

  return {
    runtime,
    demoSessionId: session.id,
    runtimeSnapshot: runtime.inspectRuntime(),
    runMessage: 'Demo preparada para MicroDuck',
  };
}

function formatRunMessage(result: RuntimeRunResult | undefined) {
  if (!result) {
    return 'No habia sesiones pendientes en cola.';
  }

  return `${result.snapshot.dispatchedCommandCount} comando(s) enviados. Estado: ${
    runtimeStateLabels[result.snapshot.state]
  }.`;
}

function formatErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Error desconocido en el flujo demo.';
}

const runtimeStateLabels = {
  created: 'Creada',
  queued: 'En cola',
  ready: 'Lista',
  'awaiting-confirmation': 'Pendiente',
  running: 'Ejecutando',
  paused: 'Pausada',
  stopped: 'Completada',
  error: 'Error',
  disposed: 'Cerrada',
};
