import { createMicroDuckAdapter } from '@botlab/adapters-microduck';
import { createStackChanAdapter } from '@botlab/adapters-stackchan';
import {
  createBlocksEditorProvider,
  sampleTurboWarpWorkspaceArtifact,
  type BlocksWorkspaceArtifact,
  type BlocksWorkspaceValidationResult,
} from '@botlab/blocks';
import {
  type CompiledBehaviorArtifact,
  sampleArbitrationStrategies,
  sampleMicroDuckCompiledBehaviorArtifact,
  sampleMicroDuckLedBehavior,
  samplePolicies,
  sampleSchedulers,
  sampleSkills,
  type Target,
} from '@botlab/model';
import {
  createBotLabRuntime,
  type BotLabRuntime,
  type RuntimeIntrospectionSnapshot,
  type RuntimeRunResult,
} from '@botlab/runtime';
import { officialSimulatorIntegrations } from '@botlab/simulators';
import { assign, fromPromise, setup } from 'xstate';

export type BotLabWorkspaceState =
  | 'loaded'
  | 'dirty'
  | 'validating'
  | 'valid'
  | 'invalid';

export type BotLabExecutionState =
  | 'ready'
  | 'queueing'
  | 'running'
  | 'completed'
  | 'failed';

export type BotLabBuildState =
  | 'draft'
  | 'stale'
  | 'compiling'
  | 'compiled'
  | 'failed';

export type BotLabSimulationState =
  | 'idle'
  | 'stale'
  | 'simulating'
  | 'passed'
  | 'failed';

export interface BotLabSimulationResult {
  simulatorId: string;
  artifactId: string;
  status: 'passed' | 'failed';
  commandCount: number;
}

export type BotLabFlowLogCategory =
  | 'target'
  | 'workspace'
  | 'build'
  | 'simulation'
  | 'execution'
  | 'error';

export interface BotLabFlowLogEntry {
  id: string;
  category: BotLabFlowLogCategory;
  message: string;
}

export interface BotLabFlowContext {
  runtime: BotLabRuntime;
  demoSessionId: string;
  selectedTargetId: string;
  workspaceArtifact: BlocksWorkspaceArtifact;
  compiledArtifact?: CompiledBehaviorArtifact;
  simulationResult?: BotLabSimulationResult;
  runtimeSnapshot: RuntimeIntrospectionSnapshot;
  workspaceMessage: string;
  buildMessage: string;
  simulationMessage: string;
  runMessage: string;
  errorMessage?: string;
  flowLog: BotLabFlowLogEntry[];
  flowLogCounter: number;
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

interface ValidateWorkspaceInput {
  artifact: BlocksWorkspaceArtifact;
}

interface ValidateWorkspaceOutput {
  artifact: BlocksWorkspaceArtifact;
  validation: BlocksWorkspaceValidationResult;
}

interface CompileWorkspaceInput {
  runtime: BotLabRuntime;
  demoSessionId: string;
  artifact: BlocksWorkspaceArtifact;
  targetId: string;
}

interface CompileWorkspaceOutput {
  compiledArtifact: CompiledBehaviorArtifact;
  runtimeSnapshot: RuntimeIntrospectionSnapshot;
  buildMessage: string;
}

interface SimulatePlanInput {
  artifact?: CompiledBehaviorArtifact;
  target?: Target;
}

interface SimulatePlanOutput {
  simulationMessage: string;
  simulationResult: BotLabSimulationResult;
}

export const botLabFlowMachine = setup({
  types: {} as {
    context: BotLabFlowContext;
    events:
      | { type: 'target.selected'; targetId: string }
      | { type: 'workspace.changed'; artifact: BlocksWorkspaceArtifact }
      | { type: 'workspace.validate' }
      | { type: 'build.compile' }
      | { type: 'simulation.run' }
      | { type: 'demo.run' };
  },
  actors: {
    validateWorkspace: fromPromise(
      async ({ input }: { input: ValidateWorkspaceInput }) => {
        const validation = createBlocksEditorProvider(
          input.artifact.engine,
        ).validateWorkspace(
          input.artifact,
        );

        return {
          validation,
          artifact: {
            ...input.artifact,
            status: validation.valid ? 'loaded' : 'invalid',
            validationErrors: validation.errors,
          },
        };
      },
    ),
    compileWorkspace: fromPromise(
      async ({ input }: { input: CompileWorkspaceInput }) => {
        if (input.artifact.status === 'invalid') {
          throw new Error('Workspace invalido. Valida o corrige antes de compilar.');
        }

        const target = input.runtime
          .listTargets()
          .find((candidate) => candidate.id === input.targetId);

        if (!target || target.status !== 'available') {
          throw new Error('Selecciona un target disponible antes de compilar.');
        }

        const compiledArtifact = createMicroDuckArtifactForTarget(input.targetId);

        input.runtime.loadCompiledBehavior(input.demoSessionId, compiledArtifact);
        input.runtime.confirmPolicy(input.demoSessionId);

        return {
          compiledArtifact,
          runtimeSnapshot: input.runtime.inspectRuntime(),
          buildMessage: `Plan ${compiledArtifact.id} compilado para ${target.name}.`,
        };
      },
    ),
    simulatePlan: fromPromise(async ({ input }: { input: SimulatePlanInput }) => {
      if (!input.artifact) {
        throw new Error('Compila un plan antes de simular.');
      }

      await new Promise((resolve) => {
        globalThis.setTimeout(resolve, 200);
      });

      return {
        simulationResult: {
          simulatorId:
            input.target?.profile?.simulator?.integrationId ??
            'microduck-official-sim',
          artifactId: input.artifact.id,
          status: 'passed' as const,
          commandCount: input.artifact.commands.length,
        },
        simulationMessage: `Simulacion completa: ${input.artifact.commands.length} comando(s) verificados para ${input.target?.name ?? 'MicroDuck'}.`,
      };
    }),
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
    selectTarget: assign({
      selectedTargetId: (_, params: { targetId: string }) => params.targetId,
      compiledArtifact: () => undefined,
      simulationResult: () => undefined,
      buildMessage: ({ context }, params: { targetId: string }) =>
        createTargetMessage(context.runtime, params.targetId),
      simulationMessage: () => 'Simulacion pendiente para el target seleccionado.',
      runMessage: () => 'Compila y simula antes de ejecutar el target seleccionado.',
      errorMessage: () => undefined,
    }),
    appendFlowLog: assign({
      flowLogCounter: ({ context }) => context.flowLogCounter + 1,
      flowLog: (
        { context },
        params: { category: BotLabFlowLogCategory; message: string },
      ) =>
        [
          {
            id: `flow-log-${context.flowLogCounter + 1}`,
            category: params.category,
            message: params.message,
          },
          ...context.flowLog,
        ].slice(0, 8),
    }),
    setWorkspaceArtifact: assign({
      workspaceArtifact: (_, params: { artifact: BlocksWorkspaceArtifact }) =>
        params.artifact,
      workspaceMessage: (_, params: { artifact: BlocksWorkspaceArtifact }) =>
        `Workspace ${workspaceStatusLabels[params.artifact.status]}.`,
      errorMessage: () => undefined,
    }),
    clearCompiledArtifact: assign({
      compiledArtifact: () => undefined,
      buildMessage: () => 'Workspace editado. Compila de nuevo antes de ejecutar.',
    }),
    clearSimulationResult: assign({
      simulationResult: () => undefined,
      simulationMessage: () => 'Simulacion pendiente para el plan actual.',
    }),
    setWorkspaceValidation: assign({
      workspaceArtifact: (_, params: ValidateWorkspaceOutput) => params.artifact,
      workspaceMessage: (_, params: ValidateWorkspaceOutput) =>
        params.validation.valid
          ? 'Workspace validado y listo para compilar.'
          : params.validation.errors.join(' '),
      errorMessage: (_, params: ValidateWorkspaceOutput) =>
        params.validation.valid ? undefined : params.validation.errors.join(' '),
    }),
    setCompiledArtifact: assign({
      compiledArtifact: (_, params: CompileWorkspaceOutput) => params.compiledArtifact,
      runtimeSnapshot: (_, params: CompileWorkspaceOutput) => params.runtimeSnapshot,
      buildMessage: (_, params: CompileWorkspaceOutput) => params.buildMessage,
      errorMessage: () => undefined,
    }),
    setBuildError: assign({
      buildMessage: (_, params: { message: string }) => params.message,
      errorMessage: (_, params: { message: string }) => params.message,
    }),
    setSimulationResult: assign({
      simulationResult: (_, params: SimulatePlanOutput) => params.simulationResult,
      simulationMessage: (_, params: SimulatePlanOutput) => params.simulationMessage,
      errorMessage: () => undefined,
    }),
    setSimulationError: assign({
      simulationMessage: (_, params: { message: string }) => params.message,
      errorMessage: (_, params: { message: string }) => params.message,
    }),
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
  guards: {
    buildCanCompile: ({ context }) =>
      context.workspaceArtifact.status !== 'invalid' &&
      targetCanRunMicroDuckDemo(context.runtime, context.selectedTargetId),
    hasCompiledArtifact: ({ context }) => Boolean(context.compiledArtifact),
    hasPassedSimulation: ({ context }) =>
      context.simulationResult?.status === 'passed',
    workspaceCanRun: ({ context }) => context.workspaceArtifact.status !== 'invalid',
    workspaceIsValid: (_, params: BlocksWorkspaceValidationResult) => params.valid,
  },
}).createMachine({
  id: 'botlabFlow',
  context: createBotLabFlowContext,
  type: 'parallel',
  states: {
    workspace: {
      initial: 'loaded',
      states: {
        loaded: {
          tags: ['workspace-ready'],
          on: {
            'workspace.changed': {
              target: 'dirty',
              actions: [
                {
                  type: 'setWorkspaceArtifact',
                  params: ({ event }) => ({ artifact: event.artifact }),
                },
                {
                  type: 'appendFlowLog',
                  params: {
                    category: 'workspace',
                    message: 'Workspace editado. El plan debe recompilarse.',
                  },
                },
              ],
            },
            'workspace.validate': {
              target: 'validating',
            },
          },
        },
        dirty: {
          tags: ['dirty'],
          on: {
            'workspace.changed': {
              actions: [
                {
                  type: 'setWorkspaceArtifact',
                  params: ({ event }) => ({ artifact: event.artifact }),
                },
                {
                  type: 'appendFlowLog',
                  params: {
                    category: 'workspace',
                    message: 'Workspace editado.',
                  },
                },
              ],
            },
            'workspace.validate': {
              target: 'validating',
            },
          },
        },
        validating: {
          tags: ['workspace-busy'],
          invoke: {
            src: 'validateWorkspace',
            input: ({ context }) => ({
              artifact: context.workspaceArtifact,
            }),
            onDone: [
              {
                guard: {
                  type: 'workspaceIsValid',
                  params: ({ event }) => event.output.validation,
                },
                target: 'valid',
                actions: [
                  {
                    type: 'setWorkspaceValidation',
                    params: ({ event }) => event.output,
                  },
                  {
                    type: 'appendFlowLog',
                    params: {
                      category: 'workspace',
                      message: 'Workspace validado correctamente.',
                    },
                  },
                ],
              },
              {
                target: 'invalid',
                actions: [
                  {
                    type: 'setWorkspaceValidation',
                    params: ({ event }) => event.output,
                  },
                  {
                    type: 'appendFlowLog',
                    params: {
                      category: 'error',
                      message: 'Workspace invalido.',
                    },
                  },
                ],
              },
            ],
            onError: {
              target: 'invalid',
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
        valid: {
          tags: ['workspace-ready'],
          on: {
            'workspace.changed': {
              target: 'dirty',
              actions: [
                {
                  type: 'setWorkspaceArtifact',
                  params: ({ event }) => ({ artifact: event.artifact }),
                },
                {
                  type: 'appendFlowLog',
                  params: {
                    category: 'workspace',
                    message: 'Workspace editado tras validacion.',
                  },
                },
              ],
            },
            'workspace.validate': {
              target: 'validating',
            },
          },
        },
        invalid: {
          tags: ['error'],
          on: {
            'workspace.changed': {
              target: 'dirty',
              actions: [
                {
                  type: 'setWorkspaceArtifact',
                  params: ({ event }) => ({ artifact: event.artifact }),
                },
                {
                  type: 'appendFlowLog',
                  params: {
                    category: 'workspace',
                    message: 'Workspace corregido; vuelve a validar.',
                  },
                },
              ],
            },
            'workspace.validate': {
              target: 'validating',
            },
          },
        },
      },
    },
    build: {
      initial: 'draft',
      on: {
        'target.selected': {
          target: '.stale',
          actions: [
            {
              type: 'selectTarget',
              params: ({ event }) => ({ targetId: event.targetId }),
            },
            {
              type: 'appendFlowLog',
              params: ({ event }) => ({
                category: 'target',
                message: `Target seleccionado: ${event.targetId}.`,
              }),
            },
          ],
        },
        'workspace.changed': {
          target: '.stale',
          actions: [{ type: 'clearCompiledArtifact' }, { type: 'clearSimulationResult' }],
        },
      },
      states: {
        draft: {
          on: {
            'build.compile': {
              guard: { type: 'buildCanCompile' },
              target: 'compiling',
            },
          },
        },
        stale: {
          tags: ['dirty'],
          on: {
            'build.compile': {
              guard: { type: 'buildCanCompile' },
              target: 'compiling',
            },
          },
        },
        compiling: {
          tags: ['build-busy'],
          invoke: {
            src: 'compileWorkspace',
            input: ({ context }) => ({
              runtime: context.runtime,
              demoSessionId: context.demoSessionId,
              artifact: context.workspaceArtifact,
              targetId: context.selectedTargetId,
            }),
            onDone: {
              target: 'compiled',
              actions: [
                {
                  type: 'setCompiledArtifact',
                  params: ({ event }) => event.output,
                },
                {
                  type: 'appendFlowLog',
                  params: {
                    category: 'build',
                    message: 'Plan compilado para MicroDuck.',
                  },
                },
              ],
            },
            onError: {
              target: 'failed',
              actions: [
                {
                  type: 'setBuildError',
                  params: ({ event }) => ({
                    message: formatErrorMessage(event.error),
                  }),
                },
                {
                  type: 'appendFlowLog',
                  params: {
                    category: 'error',
                    message: 'La compilacion fallo.',
                  },
                },
              ],
            },
          },
        },
        compiled: {
          tags: ['build-ready'],
          on: {
            'build.compile': {
              guard: { type: 'buildCanCompile' },
              target: 'compiling',
            },
          },
        },
        failed: {
          tags: ['error'],
          on: {
            'build.compile': {
              guard: { type: 'buildCanCompile' },
              target: 'compiling',
            },
          },
        },
      },
    },
    simulation: {
      initial: 'idle',
      on: {
        'target.selected': {
          target: '.idle',
        },
        'workspace.changed': {
          target: '.stale',
          actions: [{ type: 'clearSimulationResult' }],
        },
        'build.compile': {
          target: '.stale',
          actions: [{ type: 'clearSimulationResult' }],
        },
      },
      states: {
        idle: {
          on: {
            'simulation.run': {
              guard: { type: 'hasCompiledArtifact' },
              target: 'simulating',
            },
          },
        },
        stale: {
          tags: ['dirty'],
          on: {
            'simulation.run': {
              guard: { type: 'hasCompiledArtifact' },
              target: 'simulating',
            },
          },
        },
        simulating: {
          tags: ['simulation-busy'],
          invoke: {
            src: 'simulatePlan',
            input: ({ context }) => ({
              artifact: context.compiledArtifact,
              target: context.runtime
                .listTargets()
                .find((target) => target.id === context.selectedTargetId),
            }),
            onDone: {
              target: 'passed',
              actions: [
                {
                  type: 'setSimulationResult',
                  params: ({ event }) => event.output,
                },
                {
                  type: 'appendFlowLog',
                  params: {
                    category: 'simulation',
                    message: 'Simulacion completada correctamente.',
                  },
                },
              ],
            },
            onError: {
              target: 'failed',
              actions: [
                {
                  type: 'setSimulationError',
                  params: ({ event }) => ({
                    message: formatErrorMessage(event.error),
                  }),
                },
                {
                  type: 'appendFlowLog',
                  params: {
                    category: 'error',
                    message: 'La simulacion fallo.',
                  },
                },
              ],
            },
          },
        },
        passed: {
          tags: ['simulation-ready'],
          on: {
            'simulation.run': {
              guard: { type: 'hasCompiledArtifact' },
              target: 'simulating',
            },
          },
        },
        failed: {
          tags: ['error'],
          on: {
            'simulation.run': {
              guard: { type: 'hasCompiledArtifact' },
              target: 'simulating',
            },
          },
        },
      },
    },
    execution: {
      initial: 'ready',
      on: {
        'target.selected': {
          target: '.ready',
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
                    message: 'Sesion encolada; iniciando runtime.',
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
                    message: formatErrorMessage(event.error),
                  }),
                },
                {
                  type: 'appendFlowLog',
                  params: {
                    category: 'error',
                    message: 'No se pudo encolar la ejecucion.',
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
            onDone: {
              target: 'completed',
              actions: [
                {
                  type: 'setRunResult',
                  params: ({ event }) => event.output,
                },
                {
                  type: 'appendFlowLog',
                  params: {
                    category: 'execution',
                    message: 'Ejecucion demo completada.',
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
                    message: formatErrorMessage(event.error),
                  }),
                },
                {
                  type: 'appendFlowLog',
                  params: {
                    category: 'error',
                    message: 'La ejecucion fallo.',
                  },
                },
              ],
            },
          },
        },
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
    },
  },
});

export const botLabWorkspaceSteps: Array<{
  state: BotLabWorkspaceState;
  label: string;
}> = [
  { state: 'loaded', label: 'Cargado' },
  { state: 'dirty', label: 'Editado' },
  { state: 'validating', label: 'Validando' },
  { state: 'valid', label: 'Listo' },
  { state: 'invalid', label: 'Invalido' },
];

export const botLabExecutionSteps: Array<{
  state: BotLabExecutionState;
  label: string;
}> = [
  { state: 'ready', label: 'Preparada' },
  { state: 'queueing', label: 'En cola' },
  { state: 'running', label: 'Ejecutando' },
  { state: 'completed', label: 'Completada' },
  { state: 'failed', label: 'Error' },
];

export const botLabBuildSteps: Array<{
  state: BotLabBuildState;
  label: string;
}> = [
  { state: 'draft', label: 'Pendiente' },
  { state: 'stale', label: 'Desactualizado' },
  { state: 'compiling', label: 'Compilando' },
  { state: 'compiled', label: 'Compilado' },
  { state: 'failed', label: 'Error' },
];

export const botLabSimulationSteps: Array<{
  state: BotLabSimulationState;
  label: string;
}> = [
  { state: 'idle', label: 'Pendiente' },
  { state: 'stale', label: 'Desactualizada' },
  { state: 'simulating', label: 'Simulando' },
  { state: 'passed', label: 'OK' },
  { state: 'failed', label: 'Error' },
];

export const botLabWorkspaceStateLabels: Record<BotLabWorkspaceState, string> = {
  loaded: 'Cargado',
  dirty: 'Editado',
  validating: 'Validando',
  valid: 'Listo',
  invalid: 'Invalido',
};

export const botLabBuildStateLabels: Record<BotLabBuildState, string> = {
  draft: 'Pendiente',
  stale: 'Desactualizado',
  compiling: 'Compilando',
  compiled: 'Compilado',
  failed: 'Error',
};

export const botLabSimulationStateLabels: Record<BotLabSimulationState, string> = {
  idle: 'Pendiente',
  stale: 'Desactualizada',
  simulating: 'Simulando',
  passed: 'OK',
  failed: 'Error',
};

export const botLabExecutionStateLabels: Record<BotLabExecutionState, string> = {
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
      {
        targetId: 'microduck-sim',
        async dispatch(command) {
          await new Promise((resolve) => {
            globalThis.setTimeout(resolve, 120);
          });

          return {
            commandId: command.id,
            status: 'dispatched',
            message: `Simulated dispatch ${command.commandId}.`,
          };
        },
      },
    ],
  });
  const session = runtime.createSession({ id: 'demo-microduck-leds' });
  const selectedTargetId = 'microduck-sim';

  return {
    runtime,
    demoSessionId: session.id,
    selectedTargetId,
    workspaceArtifact: sampleTurboWarpWorkspaceArtifact,
    runtimeSnapshot: runtime.inspectRuntime(),
    workspaceMessage: 'Workspace cargado desde la muestra.',
    buildMessage: createTargetMessage(runtime, selectedTargetId),
    simulationMessage: 'Simula el plan compilado antes de ejecutar.',
    runMessage: 'Demo preparada para MicroDuck Simulator',
    flowLog: [
      {
        id: 'flow-log-0',
        category: 'workspace',
        message: 'Workspace de muestra cargado.',
      },
    ],
    flowLogCounter: 0,
  };
}

function createMicroDuckArtifactForTarget(
  targetId: string,
): CompiledBehaviorArtifact {
  return {
    ...sampleMicroDuckCompiledBehaviorArtifact,
    targetId,
    commands: sampleMicroDuckCompiledBehaviorArtifact.commands.map((command) => ({
      ...command,
      targetId,
    })),
  };
}

function targetCanRunMicroDuckDemo(runtime: BotLabRuntime, targetId: string) {
  const target = runtime.listTargets().find((candidate) => candidate.id === targetId);
  const capability = runtime
    .listCapabilities()
    .find((candidate) => candidate.id === 'microduck-leds');

  return Boolean(
    target?.status === 'available' && capability?.targetIds.includes(targetId),
  );
}

function createTargetMessage(runtime: BotLabRuntime, targetId: string) {
  const target = runtime.listTargets().find((candidate) => candidate.id === targetId);

  if (!target) {
    return 'Target desconocido. Selecciona un destino valido.';
  }

  if (!targetCanRunMicroDuckDemo(runtime, targetId)) {
    return `${target.name} aun no puede ejecutar la demo MicroDuck.`;
  }

  return `Target ${target.name} seleccionado. Compila el workspace para generar un plan ejecutable.`;
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

const workspaceStatusLabels = {
  empty: 'vacio',
  loaded: 'cargado',
  dirty: 'editado',
  invalid: 'invalido',
  'read-only': 'solo lectura',
};
