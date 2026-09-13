import { createMicroDuckAdapter, compileMicroDuckProgram } from '@botlab/adapters-microduck';
import { createStackChanAdapter } from '@botlab/adapters-stackchan';
import {
  createBlocksEditorProvider,
  readMicroDuckProgramFromWorkspace,
  sampleScratchBlocksWorkspaceArtifact,
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
  type SimulatorOutputArtifact,
  type Target,
} from '@botlab/model';
import {
  createBotLabRuntime,
  type BotLabRuntime,
  type RuntimeIntrospectionSnapshot,
  type RuntimeRunResult,
} from '@botlab/runtime';
import {
  createMicroDuckSimulatorBridge,
  microDuckSimulatorIntegrations,
} from '@botlab/simulators-microduck';
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
  outputArtifact: SimulatorOutputArtifact;
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
    input: { workspace?: BlocksWorkspaceArtifact } | undefined;
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
      async ({ input }: { input: ValidateWorkspaceInput }): Promise<ValidateWorkspaceOutput> => {
        const validation = createBlocksEditorProvider(
          input.artifact.engine
        ).validateWorkspace(input.artifact);

        return {
          validation,
          artifact: {
            ...input.artifact,
            status: validation.valid ? 'loaded' : 'invalid',
            validationErrors: validation.errors,
          },
        };
      }
    ),
    compileWorkspace: fromPromise(
      async ({ input }: { input: CompileWorkspaceInput }) => {
        if (input.artifact.status === 'invalid') {
          throw new Error('Workspace is invalid. Validate or fix it before compiling.');
        }

        const target = input.runtime
          .listTargets()
          .find((candidate) => candidate.id === input.targetId);

        if (!target || target.status !== 'available') {
          throw new Error('Select an available target before compiling.');
        }

        const compiledArtifact = compileMicroDuckWorkspaceArtifact(
          input.artifact,
          input.targetId
        );

        input.runtime.loadCompiledBehavior(
          input.demoSessionId,
          compiledArtifact
        );
        input.runtime.confirmPolicy(input.demoSessionId);

        return {
          compiledArtifact,
          runtimeSnapshot: input.runtime.inspectRuntime(),
          buildMessage: `Plan ${compiledArtifact.id} compiled from Scratch Blocks for ${target.name}.`,
        };
      }
    ),
    simulatePlan: fromPromise(
      async ({ input }: { input: SimulatePlanInput }) => {
        if (!input.artifact) {
          throw new Error('Compile a plan before simulating.');
        }

        if (!input.target) {
          throw new Error('Select an available target before simulating.');
        }

        const simulator = createMicroDuckSimulatorBridge();
        await simulator.boot(input.target);
        const simulation = await simulator.simulate(input.artifact);
        const outputArtifact: SimulatorOutputArtifact = {
          id: `simout-${simulation.artifactId}`,
          kind: 'simulator-output',
          label: `MicroDuck simulator output for ${input.artifact.label}`,
          createdAt: new Date().toISOString(),
          simulatorId: simulation.simulatorId,
          sourceArtifactId: input.artifact.id,
          targetId: input.artifact.targetId,
          status: simulation.status,
          commandCount: simulation.commandCount,
          commands: simulation.commands,
          messages: simulation.messages,
          snapshot: simulation.snapshot,
        };

        return {
          simulationResult: {
            simulatorId: simulation.simulatorId,
            artifactId: outputArtifact.id,
            status: simulation.status,
            commandCount: simulation.commandCount,
            outputArtifact,
          },
          simulationMessage: `Simulation complete: ${simulation.commandCount} command(s) verified for ${input.target.name}.`,
        };
      }
    ),
    queueDemo: fromPromise(async ({ input }: { input: QueueDemoInput }) => {
      input.runtime.queueSession(input.demoSessionId, { priority: 5 });

      return {
        runtimeSnapshot: input.runtime.inspectRuntime(),
      };
    }),
    runQueuedDemo: fromPromise(
      async ({ input }: { input: RunQueuedDemoInput }) => {
        const result = await input.runtime.runNextQueuedSession();

        return {
          runtimeSnapshot: input.runtime.inspectRuntime(),
          runMessage: formatRunMessage(result),
        };
      }
    ),
  },
  actions: {
    selectTarget: assign({
      selectedTargetId: (_, params: { targetId: string }) => params.targetId,
      compiledArtifact: () => undefined,
      simulationResult: () => undefined,
      buildMessage: ({ context }, params: { targetId: string }) =>
        createTargetMessage(context.runtime, params.targetId),
      simulationMessage: () =>
        'Simulation pending for the selected target.',
      runMessage: () =>
        'Compile and simulate before running the selected target.',
      errorMessage: () => undefined,
    }),
    appendFlowLog: assign({
      flowLogCounter: ({ context }) => context.flowLogCounter + 1,
      flowLog: (
        { context },
        params: { category: BotLabFlowLogCategory; message: string }
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
      buildMessage: () =>
        'Workspace edited. Compile again before running.',
    }),
    clearSimulationResult: assign({
      simulationResult: () => undefined,
      simulationMessage: () => 'Simulation pending for the current plan.',
    }),
    setWorkspaceValidation: assign({
      workspaceArtifact: (_, params: ValidateWorkspaceOutput) =>
        params.artifact,
      workspaceMessage: (_, params: ValidateWorkspaceOutput) =>
        params.validation.valid
          ? 'Workspace validated and ready to compile.'
          : params.validation.errors.join(' '),
      errorMessage: (_, params: ValidateWorkspaceOutput) =>
        params.validation.valid
          ? undefined
          : params.validation.errors.join(' '),
    }),
    setCompiledArtifact: assign({
      compiledArtifact: (_, params: CompileWorkspaceOutput) =>
        params.compiledArtifact,
      runtimeSnapshot: (_, params: CompileWorkspaceOutput) =>
        params.runtimeSnapshot,
      buildMessage: (_, params: CompileWorkspaceOutput) => params.buildMessage,
      errorMessage: () => undefined,
    }),
    setBuildError: assign({
      buildMessage: (_, params: { message: string }) => params.message,
      errorMessage: (_, params: { message: string }) => params.message,
    }),
    setSimulationResult: assign({
      simulationResult: (_, params: SimulatePlanOutput) =>
        params.simulationResult,
      simulationMessage: (_, params: SimulatePlanOutput) =>
        params.simulationMessage,
      errorMessage: () => undefined,
    }),
    setSimulationError: assign({
      simulationMessage: (_, params: { message: string }) => params.message,
      errorMessage: (_, params: { message: string }) => params.message,
    }),
    setQueuedSnapshot: assign({
      runtimeSnapshot: (_, params: QueueDemoOutput) => params.runtimeSnapshot,
      runMessage: () => 'Demo queued for MicroDuck.',
      errorMessage: () => undefined,
    }),
    setRunResult: assign({
      runtimeSnapshot: (_, params: RunQueuedDemoOutput) =>
        params.runtimeSnapshot,
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
    workspaceCanRun: ({ context }) =>
      context.workspaceArtifact.status !== 'invalid',
    workspaceIsValid: (_, params: BlocksWorkspaceValidationResult) =>
      params.valid,
  },
}).createMachine({
  id: 'botlabFlow',
  context: ({ input }) => createBotLabFlowContext(input?.workspace),
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
                    message: 'Workspace edited. The plan must be recompiled.',
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
                    message: 'Workspace edited.',
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
                      message: 'Workspace validated successfully.',
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
                      message: 'Workspace invalid.',
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
                    message: 'Workspace edited after validation.',
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
                    message: 'Workspace fixed; validate again.',
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
                message: `Target selected: ${event.targetId}.`,
              }),
            },
          ],
        },
        'workspace.changed': {
          target: '.stale',
          actions: [
            { type: 'clearCompiledArtifact' },
            { type: 'clearSimulationResult' },
          ],
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
                    message: 'Plan compiled for MicroDuck.',
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
                    message: 'Compilation failed.',
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
                    message: 'Simulation completed successfully.',
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
                    message: 'Simulation failed.',
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
                    message: 'Session queued; starting runtime.',
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
                    message: 'Could not queue the execution.',
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
                    message: 'Demo execution completed.',
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
                    message: 'Execution failed.',
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
  { state: 'loaded', label: 'Loaded' },
  { state: 'dirty', label: 'Edited' },
  { state: 'validating', label: 'Validating' },
  { state: 'valid', label: 'Ready' },
  { state: 'invalid', label: 'Invalid' },
];

export const botLabExecutionSteps: Array<{
  state: BotLabExecutionState;
  label: string;
}> = [
  { state: 'ready', label: 'Ready' },
  { state: 'queueing', label: 'Queueing' },
  { state: 'running', label: 'Running' },
  { state: 'completed', label: 'Completed' },
  { state: 'failed', label: 'Error' },
];

export const botLabBuildSteps: Array<{
  state: BotLabBuildState;
  label: string;
}> = [
  { state: 'draft', label: 'Pending' },
  { state: 'stale', label: 'Stale' },
  { state: 'compiling', label: 'Compiling' },
  { state: 'compiled', label: 'Compiled' },
  { state: 'failed', label: 'Error' },
];

export const botLabSimulationSteps: Array<{
  state: BotLabSimulationState;
  label: string;
}> = [
  { state: 'idle', label: 'Pending' },
  { state: 'stale', label: 'Stale' },
  { state: 'simulating', label: 'Simulating' },
  { state: 'passed', label: 'OK' },
  { state: 'failed', label: 'Error' },
];

export const botLabWorkspaceStateLabels: Record<BotLabWorkspaceState, string> =
  {
    loaded: 'Loaded',
    dirty: 'Edited',
    validating: 'Validating',
    valid: 'Ready',
    invalid: 'Invalid',
  };

export const botLabBuildStateLabels: Record<BotLabBuildState, string> = {
  draft: 'Pending',
  stale: 'Stale',
  compiling: 'Compiling',
  compiled: 'Compiled',
  failed: 'Error',
};

export const botLabSimulationStateLabels: Record<
  BotLabSimulationState,
  string
> = {
  idle: 'Pending',
  stale: 'Stale',
  simulating: 'Simulating',
  passed: 'OK',
  failed: 'Error',
};

export const botLabExecutionStateLabels: Record<BotLabExecutionState, string> =
  {
    ready: 'Ready',
    queueing: 'Queueing',
    running: 'Running',
    completed: 'Completed',
    failed: 'Error',
  };

function createBotLabFlowContext(workspace?: BlocksWorkspaceArtifact): BotLabFlowContext {
  const runtime = createBotLabRuntime({
    adapters: [createMicroDuckAdapter(), createStackChanAdapter()],
    simulators: microDuckSimulatorIntegrations,
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
    workspaceArtifact: workspace ?? sampleScratchBlocksWorkspaceArtifact,
    runtimeSnapshot: runtime.inspectRuntime(),
    workspaceMessage: 'Workspace loaded from sample.',
    buildMessage: createTargetMessage(runtime, selectedTargetId),
    simulationMessage: 'Simulate the compiled plan before running.',
    runMessage: 'Demo ready for MicroDuck Simulator',
    flowLog: [
      {
        id: 'flow-log-0',
        category: 'workspace',
        message: 'Sample workspace loaded.',
      },
    ],
    flowLogCounter: 0,
  };
}

export function compileMicroDuckWorkspaceArtifact(artifact: BlocksWorkspaceArtifact, targetId: string): CompiledBehaviorArtifact {
  return compileMicroDuckProgram(artifact, readMicroDuckProgramFromWorkspace(artifact), targetId);
}

function targetCanRunMicroDuckDemo(runtime: BotLabRuntime, targetId: string) {
  const target = runtime
    .listTargets()
    .find((candidate) => candidate.id === targetId);
  const ledCapability = runtime
    .listCapabilities()
    .find((candidate) => candidate.id === 'microduck-leds');
  const motionCapability = runtime
    .listCapabilities()
    .find((candidate) => candidate.id === 'microduck-motion');

  return Boolean(
    target?.status === 'available' &&
      ledCapability?.targetIds.includes(targetId) &&
      motionCapability?.targetIds.includes(targetId)
  );
}

function createTargetMessage(runtime: BotLabRuntime, targetId: string) {
  const target = runtime
    .listTargets()
    .find((candidate) => candidate.id === targetId);

  if (!target) {
    return 'Unknown target. Select a valid destination.';
  }

  if (!targetCanRunMicroDuckDemo(runtime, targetId)) {
    return `${target.name} cannot run the MicroDuck demo yet.`;
  }

  return `Target ${target.name} selected. Compile the workspace to generate an executable plan.`;
}

function formatRunMessage(result: RuntimeRunResult | undefined) {
  if (!result) {
    return 'There were no pending sessions in the queue.';
  }

  return `${
    result.snapshot.dispatchedCommandCount
  } command(s) sent. State: ${runtimeStateLabels[result.snapshot.state]}.`;
}

function formatErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Unknown error in the demo flow.';
}

const runtimeStateLabels = {
  created: 'Created',
  queued: 'Queued',
  ready: 'Ready',
  'awaiting-confirmation': 'Pending',
  running: 'Running',
  paused: 'Paused',
  stopped: 'Completed',
  error: 'Error',
  disposed: 'Closed',
};

const workspaceStatusLabels = {
  empty: 'empty',
  loaded: 'loaded',
  dirty: 'edited',
  invalid: 'invalid',
  'read-only': 'read only',
};
