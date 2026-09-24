import {
  sampleScratchBlocksWorkspaceArtifact,
  type BlocksWorkspaceArtifact,
} from '@botlab/blocks';
import { createBotLabMessage } from '@botlab/model';
import type { BotLabRuntime } from '@botlab/runtime';
import { buildRegion } from './botlab-flow-build';
import { executionRegion } from './botlab-flow-execution';
import { botLabFlowSetup, createTargetMessage } from './botlab-flow-setup';
import { simulationRegion } from './botlab-flow-simulation';
import type {
  BotLabBuildState,
  BotLabExecutionState,
  BotLabFlowContext,
  BotLabSimulationState,
  BotLabWorkspaceState,
} from './botlab-flow-types';
import { workspaceRegion } from './botlab-flow-workspace';
import { createBotLabWorkbenchRuntime } from './botlab-runtime';

export type {
  BotLabBuildState,
  BotLabExecutionState,
  BotLabFlowContext,
  BotLabFlowLogCategory,
  BotLabFlowLogEntry,
  BotLabSimulationResult,
  BotLabSimulationState,
  BotLabWorkspaceState,
} from './botlab-flow-types';

/**
 * Parallel workbench flow. Each region (workspace, build, simulation,
 * execution) lives in its own module; shared actors and actions live in
 * `botlab-flow-setup.ts`.
 */
export const botLabFlowMachine = botLabFlowSetup.createMachine({
  id: 'botlabFlow',
  context: ({ input }) =>
    createBotLabFlowContext(input?.workspace, input?.targetId, input?.runtime),
  type: 'parallel',
  states: {
    workspace: workspaceRegion,
    build: buildRegion,
    simulation: simulationRegion,
    execution: executionRegion,
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
    dispatched: 'Dispatched',
    cancelled: 'Cancelled',
    'confirmation-required': 'Confirmation required',
    'no-work': 'No work',
    failed: 'Error',
  };

function createBotLabFlowContext(
  workspace?: BlocksWorkspaceArtifact,
  targetId?: string,
  runtime: BotLabRuntime = createBotLabWorkbenchRuntime(),
): BotLabFlowContext {
  const session = runtime.createSession({ id: 'demo-microduck-leds' });
  const selectedTargetId = runtime
    .listTargets()
    .some((target) => target.id === targetId)
    ? targetId!
    : 'stackchan-planned';

  return {
    runtime,
    demoSessionId: session.id,
    selectedTargetId,
    workspaceArtifact: workspace ?? sampleScratchBlocksWorkspaceArtifact,
    runtimeSnapshot: runtime.inspectRuntime(),
    workspaceMessage: createBotLabMessage(
      'flow.workspace-loaded',
      'Workspace loaded from sample.',
    ),
    buildMessage: createTargetMessage(runtime, selectedTargetId),
    simulationMessage: createBotLabMessage(
      'flow.simulation-before-run',
      'Simulate the compiled plan before running.',
    ),
    runMessage: createBotLabMessage(
      'flow.stackchan-pending',
      'StackChan selected; connection integration pending.',
    ),
    flowLog: [
      {
        id: 'flow-log-0',
        category: 'workspace',
        message: createBotLabMessage(
          'flow.log.sample-workspace-loaded',
          'Sample workspace loaded.',
        ),
      },
    ],
    flowLogCounter: 0,
  };
}
