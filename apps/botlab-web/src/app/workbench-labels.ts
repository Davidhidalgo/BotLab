import type { MicroDuckOfficialSimulatorHostState } from '@botlab/simulators-microduck';
import {
  botLabExecutionSteps,
  type BotLabBuildState,
  type BotLabExecutionState,
  type BotLabSimulationState,
  type BotLabWorkspaceState,
} from './botlab-flow-machine';
import type { BotLabCopy } from './i18n';

export function getWorkspaceArtifactStatusLabel(
  status: string,
  copy: BotLabCopy,
) {
  const labels: Record<string, string> = {
    empty: copy.status.empty,
    loaded: copy.status.loaded,
    dirty: copy.status.dirty,
    invalid: copy.status.invalid,
    'read-only': copy.status.readOnly,
  };

  return labels[status] ?? status;
}

export function getWorkspaceFlowStateLabel(
  state: BotLabWorkspaceState,
  copy: BotLabCopy,
) {
  const labels: Record<BotLabWorkspaceState, string> = {
    loaded: copy.status.loaded,
    dirty: copy.status.dirty,
    validating: copy.status.loading,
    valid: copy.status.ready,
    invalid: copy.status.invalid,
  };

  return labels[state];
}

export function getBuildStateLabel(state: BotLabBuildState, copy: BotLabCopy) {
  const labels: Record<BotLabBuildState, string> = {
    draft: copy.status.pending,
    stale: copy.status.stale,
    compiling: copy.compiling,
    compiled: copy.messages.planCompiled,
    failed: copy.status.error,
  };

  return labels[state];
}

export function getSimulationStateLabel(
  state: BotLabSimulationState,
  copy: BotLabCopy,
) {
  const labels: Record<BotLabSimulationState, string> = {
    idle: copy.status.pending,
    stale: copy.status.stale,
    simulating: copy.simulating,
    passed: 'OK',
    failed: copy.status.error,
  };

  return labels[state];
}

export function getExecutionStateLabel(
  state: BotLabExecutionState,
  copy: BotLabCopy,
) {
  const labels: Record<BotLabExecutionState, string> = {
    ready: copy.status.ready,
    queueing: copy.status.queued,
    running: copy.running,
    completed: copy.status.completed,
    dispatched: copy.status.dispatched,
    cancelled: copy.status.stopped,
    'confirmation-required': copy.status.requiresConfirmation,
    'no-work': copy.status.noWork,
    failed: copy.status.error,
  };

  return labels[state];
}

export function getRuntimeStateLabel(state: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    created: copy.status.ready,
    queued: copy.status.queued,
    ready: copy.status.ready,
    'awaiting-confirmation': copy.status.awaiting,
    running: copy.running,
    paused: copy.status.paused,
    stopped: copy.status.stopped,
    error: copy.status.error,
    disposed: copy.status.disposed,
  };

  return labels[state] ?? state;
}

export function getFlowLogLabel(category: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    target: copy.labels.target,
    workspace: 'Workspace',
    build: copy.panels.build,
    simulation: copy.panels.simulator,
    execution: copy.panels.runtime,
    error: copy.status.error,
  };

  return labels[category] ?? category;
}

export function getTargetKindLabel(kind: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    robot: copy.targetKind.robot,
    simulator: copy.targetKind.simulator,
  };

  return labels[kind] ?? kind;
}

export function getTargetStatusLabel(status: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    available: copy.status.available,
    planned: copy.status.planned,
    offline: copy.status.offline,
  };

  return labels[status] ?? status;
}

export function getArtifactKindLabel(kind: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    blocks: copy.artifactKind.blocks,
    'compiled-plan': copy.artifactKind.compiledPlan,
    log: copy.artifactKind.log,
    trace: copy.artifactKind.trace,
    'simulator-output': copy.artifactKind.simulatorOutput,
  };

  return labels[kind] ?? kind;
}

export function getPolicyDecisionLabel(decision: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    allow: copy.status.allowed,
    deny: copy.status.denied,
    warn: copy.status.warning,
    'require-confirmation': copy.status.requiresConfirmation,
  };

  return labels[decision] ?? decision;
}

export function getAssetCacheStatusLabel(status: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    ready: copy.status.ready,
    missing: copy.status.missing,
    stale: copy.status.stale,
    'pending-review': copy.status.review,
    blocked: copy.status.blocked,
  };

  return labels[status] ?? status;
}

export function getOfficialSimulatorHostStateLabel(
  state: MicroDuckOfficialSimulatorHostState,
  copy: BotLabCopy,
) {
  const labels: Record<MicroDuckOfficialSimulatorHostState, string> = {
    blocked: copy.status.blocked,
    loading: copy.status.loading,
    ready: copy.status.ready,
    running: copy.host.connected,
    failed: copy.status.error,
    disconnected: copy.status.disconnected,
  };

  return labels[state];
}

export function getRuntimeEventLabel(type: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    'session-created': copy.labels.demoSession,
    'artifact-loaded': copy.labels.artifact,
    'policy-evaluated': copy.panels.policy,
    'policy-confirmed': copy.status.confirmationApplied,
    'session-queued': copy.status.queued,
    'session-dequeued': copy.running,
    'session-started': copy.running,
    'command-dispatched': copy.labels.generatedCommand,
    'session-paused': copy.status.paused,
    'session-resumed': copy.running,
    'session-stopped': copy.status.completed,
    'session-disposed': copy.status.disposed,
    'runtime-error': copy.status.error,
  };

  return labels[type] ?? type;
}

export function translateFlowMessage(message: string, copy: BotLabCopy) {
  const exactMessages: Record<string, string> = {
    'Use one green flag script. Parallel scripts are not supported yet.':
      copy.messages.singleScript,
    'Wait requires a numeric duration. Expressions are not supported yet.':
      copy.messages.numericWait,
    'Wait duration must be a finite, non-negative number of seconds.':
      copy.messages.invalidWait,
    'Steps must be a whole number.': copy.messages.invalidSteps,
    'Connect at least one block to the green flag.': copy.messages.emptyScript,
    'Compile the demo to evaluate policies.': copy.messages.compilePolicies,
    'Workspace loaded from sample.': copy.messages.workspaceLoaded,
    'Sample workspace loaded.': copy.messages.sampleWorkspaceLoaded,
    'Simulate the compiled plan before running.':
      copy.messages.simulationBeforeRun,
    'Demo ready for MicroDuck Simulator': copy.messages.demoReady,
    'Demo queued for MicroDuck.': copy.messages.demoQueued,
    'Demo execution completed.': copy.messages.demoExecutionCompleted,
    'Workspace edited.': copy.status.dirty,
    'Workspace validated successfully.': copy.status.ready,
    'Plan compiled for MicroDuck.': copy.messages.planCompiled,
    'Simulation completed successfully.': copy.status.completed,
  };

  if (exactMessages[message]) {
    return exactMessages[message];
  }
  if (message.startsWith('Invalid motion STEPS:'))
    return copy.messages.invalidSteps;
  if (message.startsWith('Invalid motion ANGLE:'))
    return copy.messages.invalidAngle;
  if (
    message.startsWith('Invalid motion DISTANCE:') ||
    message.startsWith('Unsupported walk distance:')
  )
    return copy.messages.invalidDistance;

  const unsupportedBlock = message.match(
    /^Unsupported connected block: (.+)\.$/,
  );
  if (unsupportedBlock) {
    return `${copy.messages.unsupportedBlock} ${unsupportedBlock[1]}.`;
  }

  const targetSelected = message.match(
    /^Target (.+) selected\. Compile the workspace to generate an executable plan\.$/,
  );
  if (targetSelected) {
    return `${copy.messages.targetSelectedPrefix} ${targetSelected[1]}. ${copy.messages.targetSelectedSuffix}`;
  }

  const compiledPlan = message.match(
    /^Plan (.+) compiled from Scratch Blocks for (.+)\.$/,
  );
  if (compiledPlan) {
    return `${copy.messages.planCompiled} ${compiledPlan[1]} · ${compiledPlan[2]}.`;
  }

  const simulationComplete = message.match(
    /^(?:Simulation|Command validation) complete: (\d+) command\(s\) verified for (.+)\.$/,
  );
  if (simulationComplete) {
    return `${copy.messages.simulationCompletePrefix} ${simulationComplete[1]} ${copy.messages.simulationCompleteSuffix} ${simulationComplete[2]}.`;
  }

  const commandsSent = message.match(
    /^(\d+) command\(s\) sent\. (?:State|Result): (.+)\.$/,
  );
  if (commandsSent) {
    const resultLabel = botLabExecutionSteps.some(
      (step) => step.state === commandsSent[2],
    )
      ? getExecutionStateLabel(commandsSent[2] as BotLabExecutionState, copy)
      : commandsSent[2] === 'dispatched'
        ? copy.status.dispatched
        : commandsSent[2];
    return `${commandsSent[1]} ${copy.messages.commandSentSuffix} ${resultLabel}.`;
  }

  const loadedFrames = message.match(
    /^Loaded (\d+) BotLab control frame\(s\) into the official simulator source\.$/,
  );
  if (loadedFrames) {
    return `${copy.messages.loadedFramesPrefix} ${loadedFrames[1]} ${copy.messages.loadedFramesSuffix}`;
  }

  const sentFrames = message.match(
    /^Sent (\d+) BotLab control frame\(s\) to the BotLab-enabled simulator host\.$/,
  );
  if (sentFrames) {
    return `${copy.messages.sentFramesPrefix} ${sentFrames[1]} ${copy.messages.sentFramesSuffix}`;
  }

  return message;
}

export const runtimeTraceLabels = {
  lifecycle: 'Lifecycle',
  load: 'Load',
  policy: 'Policy',
  scheduler: 'Scheduler',
  arbitration: 'Arbitration',
  dispatch: 'Dispatch',
  validation: 'Validation',
  error: 'Error',
};

export const runtimeDiagnosticLabels = {
  validation: 'Validation',
  policy: 'Policy',
  adapter: 'Adapter',
  transport: 'Transport',
  scheduler: 'Scheduler',
  arbitration: 'Arbitration',
  simulator: 'Simulator',
  lifecycle: 'Lifecycle',
};

export function formatLedPattern(
  pattern: string | undefined,
  copy: BotLabCopy,
) {
  if (!pattern) {
    return copy.empty.noPattern;
  }

  const labels: Record<string, string> = {
    blink: copy.ledPattern.blink,
    off: copy.ledPattern.off,
    smile: copy.ledPattern.smile,
    solid: copy.ledPattern.solid,
  };

  return labels[pattern] ?? pattern;
}
