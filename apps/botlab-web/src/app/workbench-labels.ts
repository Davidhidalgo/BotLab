import type { BotLabMessage, BotLabMessageParams } from '@botlab/model';
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

type MessageFormatter = (
  params: BotLabMessageParams,
  copy: BotLabCopy,
) => string;

/** Localized renderings by message code; codes without an entry show their English text. */
const messageCatalog: Record<string, MessageFormatter> = {
  'program.single-script': (_, copy) => copy.messages.singleScript,
  'program.numeric-wait': (_, copy) => copy.messages.numericWait,
  'program.invalid-wait': (_, copy) => copy.messages.invalidWait,
  'program.invalid-steps': (_, copy) => copy.messages.invalidSteps,
  'program.invalid-angle': (_, copy) => copy.messages.invalidAngle,
  'program.invalid-distance': (_, copy) => copy.messages.invalidDistance,
  'program.empty-script': (_, copy) => copy.messages.emptyScript,
  'program.unsupported-block': ({ block }, copy) =>
    `${copy.messages.unsupportedBlock} ${block}.`,
  'flow.workspace-loaded': (_, copy) => copy.messages.workspaceLoaded,
  'flow.workspace-status': ({ status }, copy) =>
    getWorkspaceArtifactStatusLabel(String(status), copy),
  'flow.target-selected': ({ target }, copy) =>
    `${copy.messages.targetSelectedPrefix} ${target}. ${copy.messages.targetSelectedSuffix}`,
  'flow.plan-compiled': ({ plan, target }, copy) =>
    `${copy.messages.planCompiled} ${plan} · ${target}.`,
  'flow.simulation-before-run': (_, copy) => copy.messages.simulationBeforeRun,
  'flow.simulation-complete': ({ count, target }, copy) =>
    `${copy.messages.simulationCompletePrefix} ${count} ${copy.messages.simulationCompleteSuffix} ${target}.`,
  'flow.demo-queued': (_, copy) => copy.messages.demoQueued,
  'flow.commands-sent': ({ count, status }, copy) =>
    `${count} ${copy.messages.commandSentSuffix} ${formatExecutionStatus(String(status), copy)}.`,
  'flow.log.sample-workspace-loaded': (_, copy) =>
    copy.messages.sampleWorkspaceLoaded,
  'flow.log.workspace-edited': (_, copy) => copy.status.dirty,
  'flow.log.workspace-validated': (_, copy) => copy.status.ready,
  'flow.log.plan-compiled': (_, copy) => copy.messages.planCompiled,
  'flow.log.simulation-completed': (_, copy) => copy.status.completed,
};

export function formatBotLabMessage(message: BotLabMessage, copy: BotLabCopy) {
  const format = messageCatalog[message.code];
  return format ? format(message.params ?? {}, copy) : message.text;
}

function formatExecutionStatus(status: string, copy: BotLabCopy) {
  if (botLabExecutionSteps.some((step) => step.state === status))
    return getExecutionStateLabel(status as BotLabExecutionState, copy);
  return status === 'dispatched' ? copy.status.dispatched : status;
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
