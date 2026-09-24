import type {
  BlocksWorkspaceArtifact,
  BlocksWorkspaceValidationResult,
} from '@botlab/blocks';
import type {
  BotLabMessage,
  CompiledBehaviorArtifact,
  ExecutionResult,
  ProgramIdentity,
  SimulatorOutputArtifact,
  Target,
} from '@botlab/model';
import type {
  BotLabRuntime,
  RuntimeIntrospectionSnapshot,
} from '@botlab/runtime';

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
  | 'dispatched'
  | 'cancelled'
  | 'confirmation-required'
  | 'no-work'
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
  purpose: 'command-validation';
  program: ProgramIdentity;
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
  message: BotLabMessage;
}

export interface BotLabFlowContext {
  runtime: BotLabRuntime;
  demoSessionId: string;
  selectedTargetId: string;
  workspaceArtifact: BlocksWorkspaceArtifact;
  compiledArtifact?: CompiledBehaviorArtifact;
  simulationResult?: BotLabSimulationResult;
  runtimeSnapshot: RuntimeIntrospectionSnapshot;
  executionResult?: ExecutionResult;
  workspaceMessage: BotLabMessage;
  buildMessage: BotLabMessage;
  simulationMessage: BotLabMessage;
  runMessage: BotLabMessage;
  errorMessage?: BotLabMessage;
  flowLog: BotLabFlowLogEntry[];
  flowLogCounter: number;
}

export interface QueueDemoInput {
  runtime: BotLabRuntime;
  demoSessionId: string;
}

export interface QueueDemoOutput {
  runtimeSnapshot: RuntimeIntrospectionSnapshot;
}

export interface RunQueuedDemoInput {
  runtime: BotLabRuntime;
}

export interface RunQueuedDemoOutput {
  outcome: ExecutionResult;
  runtimeSnapshot: RuntimeIntrospectionSnapshot;
  runMessage: BotLabMessage;
}

export interface ValidateWorkspaceInput {
  artifact: BlocksWorkspaceArtifact;
}

export interface ValidateWorkspaceOutput {
  artifact: BlocksWorkspaceArtifact;
  validation: BlocksWorkspaceValidationResult;
}

export interface CompileWorkspaceInput {
  runtime: BotLabRuntime;
  demoSessionId: string;
  artifact: BlocksWorkspaceArtifact;
  targetId: string;
}

export interface CompileWorkspaceOutput {
  compiledArtifact: CompiledBehaviorArtifact;
  runtimeSnapshot: RuntimeIntrospectionSnapshot;
  buildMessage: BotLabMessage;
}

export interface SimulatePlanInput {
  artifact?: CompiledBehaviorArtifact;
  target?: Target;
}

export interface SimulatePlanOutput {
  simulationMessage: BotLabMessage;
  simulationResult: BotLabSimulationResult;
}
