import {
  createBlocksEditorProvider,
  type BlocksWorkspaceArtifact,
  type BlocksWorkspaceValidationResult,
} from '@botlab/blocks';
import {
  BotLabError,
  createBotLabMessage,
  identifyCompiledProgram,
  type BotLabMessage,
  type SimulatorOutputArtifact,
} from '@botlab/model';
import type { BotLabRuntime, RuntimeQueueRunResult } from '@botlab/runtime';
import { createMicroDuckSimulatorBridge } from '@botlab/simulators-microduck';
import { assign, fromPromise, setup } from 'xstate';
import { compileMicroDuckWorkspaceArtifact } from './botlab-runtime';
import type {
  BotLabFlowContext,
  BotLabFlowLogCategory,
  CompileWorkspaceInput,
  CompileWorkspaceOutput,
  QueueDemoInput,
  QueueDemoOutput,
  RunQueuedDemoInput,
  RunQueuedDemoOutput,
  SimulatePlanInput,
  SimulatePlanOutput,
  ValidateWorkspaceInput,
  ValidateWorkspaceOutput,
} from './botlab-flow-types';

/** Shared types, actors, actions and guards for every region of the BotLab flow machine. */
export const botLabFlowSetup = setup({
  types: {} as {
    context: BotLabFlowContext;
    input:
      | {
          workspace?: BlocksWorkspaceArtifact;
          targetId?: string;
          /** Injected composition root; defaults to the workbench runtime. */
          runtime?: BotLabRuntime;
        }
      | undefined;
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
      async ({
        input,
      }: {
        input: ValidateWorkspaceInput;
      }): Promise<ValidateWorkspaceOutput> => {
        const validation = createBlocksEditorProvider(
          input.artifact.engine,
        ).validateWorkspace(input.artifact);

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
          throw new BotLabError(
            'flow.workspace-invalid',
            'Workspace is invalid. Validate or fix it before compiling.',
          );
        }

        const target = input.runtime
          .listTargets()
          .find((candidate) => candidate.id === input.targetId);

        if (!target || target.status !== 'available') {
          throw new BotLabError(
            'flow.target-required',
            'Select an available target before compiling.',
          );
        }

        const compiledArtifact = compileMicroDuckWorkspaceArtifact(
          input.artifact,
          input.targetId,
        );

        input.runtime.loadCompiledBehavior(
          input.demoSessionId,
          compiledArtifact,
        );

        return {
          compiledArtifact,
          runtimeSnapshot: input.runtime.inspectRuntime(),
          buildMessage: createBotLabMessage(
            'flow.plan-compiled',
            `Plan ${compiledArtifact.id} compiled from Scratch Blocks for ${target.name}.`,
            { plan: compiledArtifact.id, target: target.name },
          ),
        };
      },
    ),
    simulatePlan: fromPromise(
      async ({ input }: { input: SimulatePlanInput }) => {
        if (!input.artifact) {
          throw new BotLabError(
            'flow.plan-required',
            'Compile a plan before simulating.',
          );
        }

        if (!input.target) {
          throw new BotLabError(
            'flow.target-required',
            'Select an available target before simulating.',
          );
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
            purpose: 'command-validation' as const,
            program: identifyCompiledProgram(input.artifact),
            simulatorId: simulation.simulatorId,
            artifactId: outputArtifact.id,
            status: simulation.status,
            commandCount: simulation.commandCount,
            outputArtifact,
          },
          simulationMessage: createBotLabMessage(
            'flow.simulation-complete',
            `Command validation complete: ${simulation.commandCount} command(s) verified for ${input.target.name}.`,
            { count: simulation.commandCount, target: input.target.name },
          ),
        };
      },
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
          outcome: result.outcome,
        };
      },
    ),
  },
  actions: {
    invalidateRun: assign(({ context }) => {
      context.runtime.stopSession(context.demoSessionId);
      return {
        executionResult: undefined,
        runtimeSnapshot: context.runtime.inspectRuntime(),
        runMessage: createBotLabMessage(
          'flow.run-pending',
          'Compile and simulate before running the selected target.',
        ),
      };
    }),
    selectTarget: assign({
      selectedTargetId: (_, params: { targetId: string }) => params.targetId,
      compiledArtifact: () => undefined,
      simulationResult: () => undefined,
      buildMessage: ({ context }, params: { targetId: string }) =>
        createTargetMessage(context.runtime, params.targetId),
      simulationMessage: () =>
        createBotLabMessage(
          'flow.simulation-pending-target',
          'Simulation pending for the selected target.',
        ),
      runMessage: () =>
        createBotLabMessage(
          'flow.run-pending',
          'Compile and simulate before running the selected target.',
        ),
      errorMessage: () => undefined,
    }),
    appendFlowLog: assign({
      flowLogCounter: ({ context }) => context.flowLogCounter + 1,
      flowLog: (
        { context },
        params: { category: BotLabFlowLogCategory; message: BotLabMessage },
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
        createBotLabMessage(
          'flow.workspace-status',
          `Workspace ${workspaceStatusLabels[params.artifact.status]}.`,
          { status: params.artifact.status },
        ),
      errorMessage: () => undefined,
    }),
    clearCompiledArtifact: assign({
      compiledArtifact: () => undefined,
      buildMessage: () =>
        createBotLabMessage(
          'flow.recompile-required',
          'Workspace edited. Compile again before running.',
        ),
    }),
    clearSimulationResult: assign({
      simulationResult: () => undefined,
      simulationMessage: () =>
        createBotLabMessage(
          'flow.simulation-pending-plan',
          'Simulation pending for the current plan.',
        ),
    }),
    setWorkspaceValidation: assign({
      workspaceArtifact: (_, params: ValidateWorkspaceOutput) =>
        params.artifact,
      workspaceMessage: (_, params: ValidateWorkspaceOutput) =>
        params.validation.valid
          ? createBotLabMessage(
              'flow.workspace-ready',
              'Workspace validated and ready to compile.',
            )
          : validationFailure(params.validation),
      errorMessage: (_, params: ValidateWorkspaceOutput) =>
        params.validation.valid
          ? undefined
          : validationFailure(params.validation),
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
      buildMessage: (_, params: { message: BotLabMessage }) => params.message,
      errorMessage: (_, params: { message: BotLabMessage }) => params.message,
    }),
    setSimulationResult: assign({
      simulationResult: (_, params: SimulatePlanOutput) =>
        params.simulationResult,
      simulationMessage: (_, params: SimulatePlanOutput) =>
        params.simulationMessage,
      errorMessage: () => undefined,
    }),
    setSimulationError: assign({
      simulationMessage: (_, params: { message: BotLabMessage }) =>
        params.message,
      errorMessage: (_, params: { message: BotLabMessage }) => params.message,
    }),
    setQueuedSnapshot: assign({
      runtimeSnapshot: (_, params: QueueDemoOutput) => params.runtimeSnapshot,
      runMessage: () =>
        createBotLabMessage('flow.demo-queued', 'Demo queued for MicroDuck.'),
      errorMessage: () => undefined,
    }),
    setRunResult: assign({
      executionResult: (_, params: RunQueuedDemoOutput) => params.outcome,
      runtimeSnapshot: (_, params: RunQueuedDemoOutput) =>
        params.runtimeSnapshot,
      runMessage: (_, params: RunQueuedDemoOutput) => params.runMessage,
      errorMessage: (_, params: RunQueuedDemoOutput) =>
        params.outcome.status === 'failed' ? params.runMessage : undefined,
    }),
    setError: assign({
      errorMessage: (_, params: { message: BotLabMessage }) => params.message,
      runMessage: (_, params: { message: BotLabMessage }) => params.message,
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
});

export function targetCanRunMicroDuckDemo(
  runtime: BotLabRuntime,
  targetId: string,
) {
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
    motionCapability?.targetIds.includes(targetId),
  );
}

export function createTargetMessage(
  runtime: BotLabRuntime,
  targetId: string,
): BotLabMessage {
  const target = runtime
    .listTargets()
    .find((candidate) => candidate.id === targetId);

  if (!target) {
    return createBotLabMessage(
      'flow.target-unknown',
      'Unknown target. Select a valid destination.',
    );
  }

  if (!targetCanRunMicroDuckDemo(runtime, targetId)) {
    return createBotLabMessage(
      'flow.target-unsupported',
      `${target.name} cannot run the MicroDuck demo yet.`,
      { target: target.name },
    );
  }

  return createBotLabMessage(
    'flow.target-selected',
    `Target ${target.name} selected. Compile the workspace to generate an executable plan.`,
    { target: target.name },
  );
}

export function formatRunMessage(result: RuntimeQueueRunResult): BotLabMessage {
  if (result.outcome.status === 'no-work' || !result.snapshot) {
    return createBotLabMessage(
      'flow.queue-empty',
      'There were no pending sessions in the queue.',
    );
  }

  const count = result.snapshot.dispatchedCommandCount;
  return createBotLabMessage(
    'flow.commands-sent',
    `${count} command(s) sent. Result: ${result.outcome.status}.`,
    { count, status: result.outcome.status },
  );
}

export function validationFailure(
  validation: BlocksWorkspaceValidationResult,
): BotLabMessage {
  return createBotLabMessage(
    'flow.workspace-invalid',
    validation.errors.join(' '),
  );
}

export const workspaceStatusLabels = {
  empty: 'empty',
  loaded: 'loaded',
  dirty: 'edited',
  invalid: 'invalid',
  'read-only': 'read only',
};
