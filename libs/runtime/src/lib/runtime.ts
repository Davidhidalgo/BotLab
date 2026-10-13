import { createExecutionLifecycle } from './execution';
import type {
  Artifact,
  Behavior,
  BotLabAdapter,
  Capability,
  CompiledBehaviorArtifact,
  CompiledCommand,
  IntrospectionSnapshot,
  Skill,
  Policy,
  PolicyRule,
  SchedulerProfile,
  SimulatorIntegration,
  Target,
  ValidationResult,
  ArbitrationStrategy,
} from '@botlab/model';
import {
  identifyCompiledProgram,
  sameProgram,
  type ProgramIdentity,
  type ExecutionResult,
  type ExecutionStatus,
  type ExecutionDiagnosticCode,
  validateBehaviorDefinition,
  validateCompiledBehaviorArtifact,
} from '@botlab/model';

export type RuntimeSessionState =
  | 'created'
  | 'queued'
  | 'ready'
  | 'awaiting-confirmation'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'error'
  | 'disposed';

export type RuntimeTraceCategory =
  | 'lifecycle'
  | 'load'
  | 'policy'
  | 'scheduler'
  | 'arbitration'
  | 'dispatch'
  | 'validation'
  | 'error';

export type RuntimeErrorCategory =
  | 'validation'
  | 'policy'
  | 'adapter'
  | 'transport'
  | 'scheduler'
  | 'arbitration'
  | 'simulator'
  | 'lifecycle';

export type RuntimeErrorCode =
  | 'behavior-validation-failed'
  | 'compiled-artifact-validation-failed'
  | 'policy-denied'
  | 'policy-confirmation-required'
  | 'missing-compiled-artifact'
  | 'session-already-running'
  | 'queued-session-not-ready'
  | 'capability-lock-conflict'
  | 'target-unavailable'
  | 'missing-dispatcher'
  | 'dispatcher-failed'
  | 'dispatcher-threw'
  | 'invalid-session-transition'
  | 'disposed-session-transition';

export interface RuntimeDiagnostic {
  id: string;
  timestamp: string;
  category: RuntimeErrorCategory;
  code: RuntimeErrorCode;
  severity: 'warning' | 'error';
  message: string;
  commandId?: string;
}

export interface RuntimeTraceEntry {
  program?: ProgramIdentity;
  id: string;
  timestamp: string;
  category: RuntimeTraceCategory;
  message: string;
  commandId?: string;
}

export interface RuntimeTraceArtifact extends Artifact {
  kind: 'trace';
  sessionId: string;
  targetId?: string;
  behaviorId?: string;
  entries: RuntimeTraceEntry[];
}

export interface RuntimeSessionOptions {
  id?: string;
}

export interface RuntimeQueueOptions {
  priority?: number;
}

export interface RuntimeQueueEntry {
  id: string;
  sessionId: string;
  priority: number;
  enqueuedAt: string;
  targetId?: string;
  behaviorId?: string;
}

export interface RuntimeCapabilityLock {
  capabilityId: string;
  sessionId: string;
  commandId?: string;
  acquiredAt: string;
}

export interface RuntimeQueueSnapshot {
  entries: RuntimeQueueEntry[];
  capabilityLocks: RuntimeCapabilityLock[];
}

export interface RuntimeSessionSnapshot {
  program?: ProgramIdentity;
  id: string;
  state: RuntimeSessionState;
  targetId?: string;
  behaviorId?: string;
  loadedArtifactId?: string;
  dispatchedCommandCount: number;
  trace: RuntimeTraceEntry[];
  diagnostics: RuntimeDiagnostic[];
  policyEvaluation?: RuntimePolicyEvaluation;
  messages: string[];
}

export type RuntimePolicyDecision =
  | 'allow'
  | 'deny'
  | 'warn'
  | 'require-confirmation';

export interface RuntimePolicyEvaluation {
  decision: RuntimePolicyDecision;
  policyIds: string[];
  ruleIds: string[];
  messages: string[];
}

export interface RuntimeIntrospectionSnapshot {
  generatedAt: string;
  targets: Target[];
  capabilities: Capability[];
  simulators: SimulatorIntegration[];
  sessions: RuntimeSessionSnapshot[];
  activeSessionCount: number;
  queue: RuntimeQueueSnapshot;
  diagnostics: RuntimeDiagnostic[];
  recentEvents: RuntimeEvent[];
}

export type RuntimeCommandDispatchStatus =
  | 'dispatched'
  | 'completed'
  | 'failed';

export type RuntimeCommandDispatchResult = {
  commandId: string;
  condition?: boolean;
  message: string;
} & (
  | { status: 'dispatched' | 'failed'; evidence?: never }
  | { status: 'completed'; evidence: 'simulator' | 'hardware' }
);

export interface RuntimeCommandDispatcher {
  targetId: string;
  dispatch(
    command: CompiledCommand,
    context: { signal: AbortSignal },
  ): RuntimeCommandDispatchResult | Promise<RuntimeCommandDispatchResult>;
}

export interface RuntimeLoadResult {
  snapshot: RuntimeSessionSnapshot;
  validation: ValidationResult;
}

export interface RuntimeRunResult {
  outcome: ExecutionResult;
  snapshot: RuntimeSessionSnapshot;
  dispatchResults: RuntimeCommandDispatchResult[];
}

export type RuntimeQueueRunResult =
  | RuntimeRunResult
  | {
      outcome: ExecutionResult & { status: 'no-work' };
      snapshot?: never;
      dispatchResults: [];
    };

export type RuntimeEventType =
  | 'session-created'
  | 'artifact-loaded'
  | 'policy-evaluated'
  | 'policy-confirmed'
  | 'session-queued'
  | 'session-dequeued'
  | 'session-started'
  | 'command-dispatched'
  | 'session-paused'
  | 'session-resumed'
  | 'session-stopped'
  | 'session-disposed'
  | 'runtime-error';

export interface RuntimeEvent {
  id: string;
  timestamp: string;
  type: RuntimeEventType;
  sessionId?: string;
  message: string;
}

export type RuntimeEventListener = (event: RuntimeEvent) => void;

export interface RuntimeConfig {
  adapters: BotLabAdapter[];
  simulators: SimulatorIntegration[];
  behaviors?: Behavior[];
  skills?: Skill[];
  schedulers?: SchedulerProfile[];
  arbitrationStrategies?: ArbitrationStrategy[];
  policies?: Policy[];
  dispatchers?: RuntimeCommandDispatcher[];
  now?: () => string;
}

export interface BotLabRuntime {
  listTargets(): Target[];
  listCapabilities(): Capability[];
  listSimulatorIntegrations(): SimulatorIntegration[];
  inspectRuntime(): RuntimeIntrospectionSnapshot;
  inspectTarget(targetId: string): IntrospectionSnapshot;
  inspectQueue(): RuntimeQueueSnapshot;
  createSession(options?: RuntimeSessionOptions): RuntimeSessionSnapshot;
  loadBehavior(sessionId: string, behavior: Behavior): RuntimeLoadResult;
  loadCompiledBehavior(
    sessionId: string,
    artifact: CompiledBehaviorArtifact,
  ): RuntimeLoadResult;
  confirmPolicy(sessionId: string): RuntimeSessionSnapshot;
  queueSession(
    sessionId: string,
    options?: RuntimeQueueOptions,
  ): RuntimeQueueSnapshot;
  runNextQueuedSession(): Promise<RuntimeQueueRunResult>;
  startSession(sessionId: string): Promise<RuntimeRunResult>;
  pauseSession(sessionId: string): RuntimeSessionSnapshot;
  resumeSession(sessionId: string): RuntimeSessionSnapshot;
  stopSession(sessionId: string): RuntimeSessionSnapshot;
  disposeSession(sessionId: string): RuntimeSessionSnapshot;
  inspectSession(sessionId: string): RuntimeSessionSnapshot;
  getSessionTrace(sessionId: string): RuntimeTraceArtifact;
  subscribe(listener: RuntimeEventListener): () => void;
}

interface RuntimeSession {
  id: string;
  state: RuntimeSessionState;
  targetId?: string;
  behaviorId?: string;
  loadedArtifact?: CompiledBehaviorArtifact;
  dispatchedCommandCount: number;
  trace: RuntimeTraceEntry[];
  diagnostics: RuntimeDiagnostic[];
  policyEvaluation?: RuntimePolicyEvaluation;
  policyApproval?: ProgramIdentity;
  program?: ProgramIdentity;
  messages: string[];
  activeRun?: RuntimeActiveRun;
}

interface RuntimeActiveRun {
  controller: AbortController;
  wake?: () => void;
}

export function createBotLabRuntime(config: RuntimeConfig): BotLabRuntime {
  const sessions = new Map<string, RuntimeSession>();
  const listeners = new Set<RuntimeEventListener>();
  const events: RuntimeEvent[] = [];
  const queue: RuntimeQueueEntry[] = [];
  const capabilityLocks = new Map<string, RuntimeCapabilityLock>();
  const now = config.now ?? (() => new Date().toISOString());
  let sessionCounter = 0;
  let eventCounter = 0;
  let diagnosticCounter = 0;
  let queueCounter = 0;
  let runCounter = 0;
  const runtimeId = Array.from(
    globalThis.crypto.getRandomValues(new Uint32Array(4)),
    (value) => value.toString(16),
  ).join('-');

  function listTargets() {
    return config.adapters.flatMap((adapter) => adapter.targets);
  }

  function listCapabilities() {
    return config.adapters.flatMap((adapter) => adapter.capabilities);
  }

  function getSession(sessionId: string): RuntimeSession {
    const session = sessions.get(sessionId);

    if (!session) {
      throw new Error(`Runtime session ${sessionId} is not registered.`);
    }

    return session;
  }

  function appendTrace(
    session: RuntimeSession,
    category: RuntimeTraceCategory,
    message: string,
    commandId?: string,
  ) {
    const entry: RuntimeTraceEntry = {
      program: session.program && { ...session.program },
      id: `${session.id}-trace-${session.trace.length + 1}`,
      timestamp: now(),
      category,
      message,
      commandId,
    };

    session.trace.push(entry);
    session.messages.push(message);
  }

  function recordDiagnostic(
    session: RuntimeSession,
    category: RuntimeErrorCategory,
    code: RuntimeErrorCode,
    message: string,
    commandId?: string,
    severity: RuntimeDiagnostic['severity'] = 'error',
  ) {
    diagnosticCounter += 1;

    const diagnostic: RuntimeDiagnostic = {
      id: `runtime-diagnostic-${diagnosticCounter}`,
      timestamp: now(),
      category,
      code,
      severity,
      message,
      commandId,
    };

    session.diagnostics.push(diagnostic);
    appendTrace(
      session,
      traceCategoryForDiagnostic(category),
      message,
      commandId,
    );
    emit(
      severity === 'error' ? 'runtime-error' : 'policy-evaluated',
      message,
      session.id,
    );
  }

  function emit(type: RuntimeEventType, message: string, sessionId?: string) {
    const event: RuntimeEvent = {
      id: `runtime-event-${eventCounter + 1}`,
      timestamp: now(),
      type,
      sessionId,
      message,
    };

    eventCounter += 1;
    events.push(event);
    listeners.forEach((listener) => listener(event));
  }

  function snapshot(session: RuntimeSession): RuntimeSessionSnapshot {
    return {
      id: session.id,
      state: session.state,
      targetId: session.targetId,
      behaviorId: session.behaviorId,
      loadedArtifactId: session.loadedArtifact?.id,
      program: session.program && { ...session.program },
      dispatchedCommandCount: session.dispatchedCommandCount,
      trace: session.trace.map((entry) => ({
        ...entry,
        program: entry.program && { ...entry.program },
      })),
      diagnostics: [...session.diagnostics],
      policyEvaluation: session.policyEvaluation
        ? {
            ...session.policyEvaluation,
            policyIds: [...session.policyEvaluation.policyIds],
            ruleIds: [...session.policyEvaluation.ruleIds],
            messages: [...session.policyEvaluation.messages],
          }
        : undefined,
      messages: [...session.messages],
    };
  }

  function queueSnapshot(): RuntimeQueueSnapshot {
    return {
      entries: [...queue],
      capabilityLocks: Array.from(capabilityLocks.values()),
    };
  }

  function sortQueue() {
    queue.sort((left, right) => {
      const priorityDelta = right.priority - left.priority;

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return left.id.localeCompare(right.id);
    });
  }

  function acquireCapabilityLocks(
    session: RuntimeSession,
    artifact: CompiledBehaviorArtifact,
  ): boolean {
    const requestedCapabilityIds = Array.from(
      new Set(artifact.commands.map((command) => command.capabilityId)),
    );

    for (const capabilityId of requestedCapabilityIds) {
      const lock = capabilityLocks.get(capabilityId);

      if (lock && lock.sessionId !== session.id) {
        session.state = 'error';
        recordDiagnostic(
          session,
          'arbitration',
          'capability-lock-conflict',
          `Capability ${capabilityId} is locked by session ${lock.sessionId}.`,
        );

        return false;
      }
    }

    for (const capabilityId of requestedCapabilityIds) {
      capabilityLocks.set(capabilityId, {
        capabilityId,
        sessionId: session.id,
        acquiredAt: now(),
      });
    }

    if (requestedCapabilityIds.length > 0) {
      appendTrace(
        session,
        'arbitration',
        `Session ${session.id} acquired ${requestedCapabilityIds.length} capability lock(s).`,
      );
    }

    return true;
  }

  function releaseCapabilityLocks(session: RuntimeSession) {
    let releasedLockCount = 0;

    for (const [capabilityId, lock] of capabilityLocks.entries()) {
      if (lock.sessionId === session.id) {
        capabilityLocks.delete(capabilityId);
        releasedLockCount += 1;
      }
    }

    if (releasedLockCount > 0) {
      appendTrace(
        session,
        'arbitration',
        `Session ${session.id} released ${releasedLockCount} capability lock(s).`,
      );
    }
  }

  function evaluatePolicies(
    artifact: CompiledBehaviorArtifact,
  ): RuntimePolicyEvaluation {
    const matches: Array<{
      policy: Policy;
      rule: PolicyRule;
      commandId?: string;
    }> = [];

    for (const policy of config.policies ?? []) {
      for (const rule of policy.rules) {
        for (const command of artifact.commands) {
          const targetMatches =
            !rule.targetIds?.length ||
            rule.targetIds.includes(command.targetId);
          const capabilityMatches =
            !rule.capabilityIds?.length ||
            rule.capabilityIds.includes(command.capabilityId);

          if (targetMatches && capabilityMatches) {
            matches.push({ policy, rule, commandId: command.id });
          }
        }
      }
    }

    const denyRules = matches.filter(({ rule }) => rule.effect === 'deny');
    const confirmationRules = matches.filter(
      ({ rule }) => rule.effect === 'require-confirmation',
    );
    const warningRules = matches.filter(({ rule }) => rule.effect === 'warn');
    const decision: RuntimePolicyDecision =
      denyRules.length > 0
        ? 'deny'
        : confirmationRules.length > 0
          ? 'require-confirmation'
          : warningRules.length > 0
            ? 'warn'
            : 'allow';

    return {
      decision,
      policyIds: Array.from(new Set(matches.map(({ policy }) => policy.id))),
      ruleIds: Array.from(new Set(matches.map(({ rule }) => rule.id))),
      messages: matches.map(
        ({ rule, commandId }) =>
          `Policy rule ${rule.id} ${rule.effect} for ${
            commandId ?? artifact.id
          }.`,
      ),
    };
  }

  function applyPolicyEvaluation(
    session: RuntimeSession,
    evaluation: RuntimePolicyEvaluation,
  ) {
    session.policyEvaluation = evaluation;

    if (evaluation.decision === 'allow') {
      appendTrace(session, 'policy', `Policy allowed session ${session.id}.`);
      emit(
        'policy-evaluated',
        `Policy allowed session ${session.id}.`,
        session.id,
      );
      return;
    }

    if (evaluation.decision === 'warn') {
      recordDiagnostic(
        session,
        'policy',
        'policy-confirmation-required',
        `Policy warning for session ${session.id}: ${evaluation.messages.join(
          ' ',
        )}`,
        undefined,
        'warning',
      );
      return;
    }

    if (evaluation.decision === 'require-confirmation') {
      session.state = 'awaiting-confirmation';
      recordDiagnostic(
        session,
        'policy',
        'policy-confirmation-required',
        `Policy requires confirmation for session ${session.id}.`,
        undefined,
        'warning',
      );
      return;
    }

    session.state = 'error';
    recordDiagnostic(
      session,
      'policy',
      'policy-denied',
      `Policy denied session ${session.id}: ${evaluation.messages.join(' ')}`,
    );
  }

  function transition(
    sessionId: string,
    state: RuntimeSessionState,
    message: string,
    eventType: RuntimeEventType,
  ): RuntimeSessionSnapshot {
    const session = getSession(sessionId);

    if (session.state === 'disposed') {
      recordDiagnostic(
        session,
        'lifecycle',
        'disposed-session-transition',
        `Disposed session ${session.id} cannot transition.`,
      );
      return snapshot(session);
    }

    if (
      (state === 'paused' &&
        (session.state !== 'running' || !session.activeRun)) ||
      (state === 'running' &&
        (session.state !== 'paused' || !session.activeRun))
    ) {
      recordDiagnostic(
        session,
        'lifecycle',
        'invalid-session-transition',
        `Session ${session.id} cannot transition from ${session.state} to ${state}.`,
      );
      return snapshot(session);
    }

    if (session.state === state) return snapshot(session);
    session.state = state;
    if (state === 'stopped' || state === 'disposed') {
      removeQueuedSession(session);
      session.activeRun?.controller.abort();
    }
    if (state !== 'paused') session.activeRun?.wake?.();
    appendTrace(session, 'lifecycle', message);
    emit(eventType, message, session.id);

    return snapshot(session);
  }

  function removeQueuedSession(session: RuntimeSession) {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (queue[index].sessionId === session.id) queue.splice(index, 1);
    }
  }

  function prepareLoad(session: RuntimeSession): RuntimeLoadResult | undefined {
    if (session.state === 'disposed' || session.activeRun) {
      const message = `Session ${session.id} cannot load while disposed or dispatch is unsettled.`;
      recordDiagnostic(
        session,
        'lifecycle',
        'invalid-session-transition',
        message,
      );
      return {
        snapshot: snapshot(session),
        validation: { valid: false, errors: [message] },
      };
    }
    removeQueuedSession(session);
    session.loadedArtifact = undefined;
    session.targetId = undefined;
    session.behaviorId = undefined;
    session.policyApproval = undefined;
    session.program = undefined;
    session.policyEvaluation = undefined;
    session.dispatchedCommandCount = 0;
    return undefined;
  }

  return {
    listTargets,
    listCapabilities,
    listSimulatorIntegrations() {
      return config.simulators;
    },
    inspectRuntime() {
      const sessionSnapshots = Array.from(sessions.values()).map(snapshot);

      return {
        generatedAt: now(),
        targets: listTargets(),
        capabilities: listCapabilities(),
        simulators: config.simulators,
        sessions: sessionSnapshots,
        activeSessionCount: sessionSnapshots.filter((session) =>
          [
            'created',
            'queued',
            'ready',
            'awaiting-confirmation',
            'running',
            'paused',
          ].includes(session.state),
        ).length,
        queue: queueSnapshot(),
        diagnostics: sessionSnapshots.flatMap((session) => session.diagnostics),
        recentEvents: events.slice(-25),
      };
    },
    inspectTarget(targetId) {
      const target = listTargets().find(
        (candidate) => candidate.id === targetId,
      );
      const targetSessions = Array.from(sessions.values()).filter(
        (session) => session.targetId === targetId,
      );

      return {
        targetId,
        health: resolveTargetHealth(target, targetSessions),
        messages: target
          ? [
              `${target.name} is registered through ${target.adapterId}.`,
              `${targetSessions.length} runtime session(s) reference this target.`,
            ]
          : ['Target is not registered in this runtime session.'],
      };
    },
    inspectQueue() {
      return queueSnapshot();
    },
    createSession(options = {}) {
      if (options.id !== undefined && sessions.has(options.id)) {
        throw new Error(`Runtime session ${options.id} is already registered.`);
      }
      do {
        sessionCounter += 1;
      } while (sessions.has(`runtime-session-${sessionCounter}`));

      const session: RuntimeSession = {
        id: options.id ?? `runtime-session-${sessionCounter}`,
        state: 'created',
        dispatchedCommandCount: 0,
        trace: [],
        diagnostics: [],
        messages: [],
      };

      sessions.set(session.id, session);
      appendTrace(
        session,
        'lifecycle',
        `Runtime session ${session.id} created.`,
      );
      emit(
        'session-created',
        `Runtime session ${session.id} created.`,
        session.id,
      );

      return snapshot(session);
    },
    loadBehavior(sessionId, behavior) {
      const session = getSession(sessionId);
      const blocked = prepareLoad(session);
      if (blocked) return blocked;
      const validation = validateBehaviorDefinition(behavior, {
        skills: config.skills ?? [],
        schedulers: config.schedulers ?? [],
        arbitrationStrategies: config.arbitrationStrategies ?? [],
      });

      if (!validation.valid) {
        session.state = 'error';
        recordDiagnostic(
          session,
          'validation',
          'behavior-validation-failed',
          `Behavior ${behavior.id} failed validation.`,
        );

        return {
          snapshot: snapshot(session),
          validation,
        };
      }

      session.behaviorId = behavior.id;
      session.state = 'ready';
      appendTrace(session, 'load', `Behavior ${behavior.id} loaded.`);
      emit('artifact-loaded', `Behavior ${behavior.id} loaded.`, session.id);

      return {
        snapshot: snapshot(session),
        validation,
      };
    },
    loadCompiledBehavior(sessionId, artifact) {
      const session = getSession(sessionId);
      const blocked = prepareLoad(session);
      if (blocked) return blocked;
      const validation = validateCompiledBehaviorArtifact(artifact, {
        behaviors: config.behaviors ?? [],
        adapters: config.adapters,
        policies: config.policies ?? [],
      });

      if (!validation.valid) {
        session.state = 'error';
        recordDiagnostic(
          session,
          'validation',
          'compiled-artifact-validation-failed',
          `Compiled artifact ${artifact.id} failed validation.`,
        );

        return {
          snapshot: snapshot(session),
          validation,
        };
      }

      // Own the loaded plan: caller mutation must not change an approved run.
      session.loadedArtifact = JSON.parse(JSON.stringify(artifact));
      session.program = identifyCompiledProgram(artifact);
      session.targetId = artifact.targetId;
      session.behaviorId = artifact.behaviorId;
      session.state = 'ready';
      appendTrace(session, 'load', `Compiled artifact ${artifact.id} loaded.`);
      applyPolicyEvaluation(session, evaluatePolicies(artifact));
      emit(
        'artifact-loaded',
        `Compiled artifact ${artifact.id} loaded.`,
        session.id,
      );

      return {
        snapshot: snapshot(session),
        validation,
      };
    },
    confirmPolicy(sessionId) {
      const session = getSession(sessionId);

      if (session.state !== 'awaiting-confirmation') {
        return snapshot(session);
      }

      session.policyApproval = session.program && { ...session.program };
      session.state = 'ready';
      appendTrace(
        session,
        'policy',
        `Policy confirmed for session ${session.id}.`,
      );
      emit(
        'policy-confirmed',
        `Policy confirmed for session ${session.id}.`,
        session.id,
      );

      return snapshot(session);
    },
    queueSession(sessionId, options = {}) {
      const session = getSession(sessionId);

      if (session.activeRun) {
        recordDiagnostic(
          session,
          'scheduler',
          'session-already-running',
          `Runtime session ${session.id} is already running.`,
        );

        return queueSnapshot();
      }

      if (
        !session.loadedArtifact ||
        !['ready', 'queued', 'awaiting-confirmation'].includes(session.state)
      ) {
        recordDiagnostic(
          session,
          'scheduler',
          'queued-session-not-ready',
          `Runtime session ${session.id} is not ready to queue.`,
          undefined,
          'warning',
        );

        return queueSnapshot();
      }

      const existingEntry = queue.find(
        (entry) => entry.sessionId === session.id,
      );

      if (existingEntry) {
        existingEntry.priority = options.priority ?? existingEntry.priority;
        sortQueue();
        appendTrace(
          session,
          'scheduler',
          `Runtime session ${session.id} queue priority updated.`,
        );
        return queueSnapshot();
      }

      queueCounter += 1;
      const entry: RuntimeQueueEntry = {
        id: `runtime-queue-${queueCounter}`,
        sessionId: session.id,
        priority: options.priority ?? 0,
        enqueuedAt: now(),
        targetId: session.targetId,
        behaviorId: session.behaviorId,
      };

      queue.push(entry);
      sortQueue();
      session.state = 'queued';
      appendTrace(
        session,
        'scheduler',
        `Runtime session ${session.id} queued with priority ${entry.priority}.`,
      );
      emit(
        'session-queued',
        `Runtime session ${session.id} queued.`,
        session.id,
      );

      return queueSnapshot();
    },
    async runNextQueuedSession() {
      let entry = queue.shift();
      while (entry && getSession(entry.sessionId).state !== 'queued') {
        entry = queue.shift();
      }

      if (!entry) {
        return {
          outcome: {
            executionId: `runtime-${runtimeId}-empty-${++runCounter}`,
            status: 'no-work',
            evidence: 'none',
            diagnostic: { code: 'no-queued-work' },
          },
          dispatchResults: [],
        };
      }

      const session = getSession(entry.sessionId);
      session.state = 'ready';
      appendTrace(
        session,
        'scheduler',
        `Runtime session ${session.id} dequeued.`,
      );
      emit(
        'session-dequeued',
        `Runtime session ${session.id} dequeued.`,
        session.id,
      );

      return this.startSession(session.id);
    },
    async startSession(sessionId) {
      const session = getSession(sessionId);
      const lifecycle = createExecutionLifecycle(
        `runtime-${runtimeId}-${session.id}-${++runCounter}`,
        session.program,
      );
      const finish = (
        status: ExecutionStatus,
        dispatchResults: RuntimeCommandDispatchResult[] = [],
        code?: ExecutionDiagnosticCode,
      ): RuntimeRunResult => {
        lifecycle.update({
          ...lifecycle.snapshot(),
          status,
          evidence:
            status === 'dispatched'
              ? 'dispatch'
              : status === 'completed'
                ? dispatchResults.every(
                    (result) =>
                      result.status === 'completed' &&
                      result.evidence === 'hardware',
                  )
                  ? 'hardware'
                  : 'simulator'
                : 'none',
          diagnostic: code
            ? {
                code,
                message: session.diagnostics
                  .slice()
                  .reverse()
                  .find((d) => d.code === code)?.message,
              }
            : undefined,
        });
        return {
          snapshot: snapshot(session),
          dispatchResults,
          outcome: lifecycle.snapshot(),
        };
      };

      if (
        session.activeRun ||
        ['disposed', 'stopped', 'error'].includes(session.state)
      ) {
        recordDiagnostic(
          session,
          'lifecycle',
          'invalid-session-transition',
          `Session ${session.id} cannot start from ${session.state} or while dispatch is unsettled.`,
        );
        return finish('failed', [], 'invalid-session-transition');
      }

      if (!session.loadedArtifact) {
        session.state = 'error';
        recordDiagnostic(
          session,
          'lifecycle',
          'missing-compiled-artifact',
          `Runtime session ${session.id} has no loaded artifact.`,
        );

        return finish('failed', [], 'missing-compiled-artifact');
      }

      const target = listTargets().find(
        (candidate) => candidate.id === session.loadedArtifact?.targetId,
      );
      if (target?.status !== 'available') {
        session.state = 'error';
        recordDiagnostic(
          session,
          'adapter',
          'target-unavailable',
          'The execution target is unavailable.',
        );
        return finish('failed', [], 'target-unavailable');
      }
      const currentValidation = validateCompiledBehaviorArtifact(
        session.loadedArtifact,
        {
          behaviors: config.behaviors ?? [],
          adapters: config.adapters,
          policies: config.policies ?? [],
        },
      );
      if (!currentValidation.valid) {
        session.state = 'error';
        recordDiagnostic(
          session,
          'validation',
          'compiled-artifact-validation-failed',
          currentValidation.errors.join(' '),
        );
        return finish('failed', [], 'compiled-artifact-validation-failed');
      }
      session.policyEvaluation = evaluatePolicies(session.loadedArtifact);

      if (
        session.policyEvaluation?.decision === 'require-confirmation' &&
        !sameProgram(session.policyApproval, session.program)
      ) {
        session.state = 'awaiting-confirmation';
        recordDiagnostic(
          session,
          'policy',
          'policy-confirmation-required',
          `Runtime session ${session.id} requires policy confirmation before start.`,
          undefined,
          'warning',
        );

        return finish(
          'confirmation-required',
          [],
          'policy-confirmation-required',
        );
      }

      if (session.policyEvaluation?.decision === 'deny') {
        session.state = 'error';
        recordDiagnostic(
          session,
          'policy',
          'policy-denied',
          `Runtime session ${session.id} cannot start because policy denied it.`,
        );

        return finish('failed', [], 'policy-denied');
      }

      if (session.loadedArtifact.commands.length === 0) {
        session.state = 'stopped';
        return finish('no-work');
      }

      if (!acquireCapabilityLocks(session, session.loadedArtifact)) {
        return finish('failed', [], 'capability-lock-conflict');
      }

      removeQueuedSession(session);
      const artifact = session.loadedArtifact;
      const run: RuntimeActiveRun = { controller: new AbortController() };
      session.activeRun = run;
      session.state = 'running';
      lifecycle.update({ ...lifecycle.snapshot(), status: 'running' });
      const dispatchResults: RuntimeCommandDispatchResult[] = [];
      let failureCode: ExecutionDiagnosticCode | undefined;

      // Lifecycle methods may change the session while dispatch or listeners run.
      const isPaused = () => session.state === 'paused';
      async function waitForResume() {
        while (isPaused() && !run.controller.signal.aborted) {
          await new Promise<void>((resolve) => {
            run.wake = resolve;
          });
          run.wake = undefined;
        }
      }

      try {
        appendTrace(
          session,
          'lifecycle',
          `Runtime session ${session.id} started.`,
        );
        emit(
          'session-started',
          `Runtime session ${session.id} started.`,
          session.id,
        );
        let instruction = 0;
        const falseChecks = new Map<number, number>();
        const boundedFlow = artifact.commands.some((c) => c.flow !== undefined);
        for (; instruction < artifact.commands.length;) {
          if (boundedFlow && dispatchResults.length >= 256) {
            failureCode = 'dispatcher-failed';
            recordDiagnostic(
              session,
              'adapter',
              failureCode,
              'El programa alcanzó el límite de 256 evaluaciones/acciones. Revisa la condición y el avance.',
            );
            break;
          }
          const command = artifact.commands[instruction];
          if (isPaused()) await waitForResume();
          if (run.controller.signal.aborted || session.state !== 'running')
            break;
          if (
            listTargets().find((target) => target.id === artifact.targetId)
              ?.status !== 'available'
          ) {
            failureCode = 'target-unavailable';
            recordDiagnostic(
              session,
              'adapter',
              failureCode,
              'Target became unavailable during execution.',
            );
            break;
          }
          const dispatcher = config.dispatchers?.find(
            (candidate) => candidate.targetId === command.targetId,
          );

          if (!dispatcher) {
            failureCode = 'missing-dispatcher';
            const result = {
              commandId: command.id,
              status: 'failed' as const,
              message: `No dispatcher registered for target ${command.targetId}.`,
            };

            dispatchResults.push(result);
            recordDiagnostic(
              session,
              'adapter',
              'missing-dispatcher',
              result.message,
              command.id,
            );
            break;
          }

          try {
            const result = await dispatcher.dispatch(command, {
              signal: run.controller.signal,
            });
            if (result.commandId !== command.id)
              throw new Error(
                'Dispatcher returned a different command identity.',
              );
            dispatchResults.push(result);

            if (
              result.status === 'completed' &&
              result.evidence !==
                (target.kind === 'robot' ? 'hardware' : 'simulator')
            ) {
              throw new Error(
                'Completion requires evidence from the selected target kind.',
              );
            }
            if (
              result.status === 'dispatched' ||
              result.status === 'completed'
            ) {
              session.dispatchedCommandCount += 1;
              appendTrace(session, 'dispatch', result.message, command.id);
              emit('command-dispatched', result.message, session.id);
              const flow = command.flow;
              if (
                flow &&
                'whenTrue' in flow &&
                (result.status !== 'completed' ||
                  typeof result.condition !== 'boolean')
              )
                throw new Error(
                  'La condición requiere una lectura confirmada.',
                );
              if (flow && 'whenTrue' in flow && flow.maxFalseChecks) {
                if (result.condition) falseChecks.delete(instruction);
                else {
                  const count = (falseChecks.get(instruction) ?? 0) + 1;
                  falseChecks.set(instruction, count);
                  if (count >= flow.maxFalseChecks)
                    throw new Error(
                      'La condición no se cumplió dentro del tiempo máximo de espera.',
                    );
                }
              }
              instruction = !flow
                ? instruction + 1
                : 'next' in flow
                  ? flow.next
                  : result.condition
                    ? flow.whenTrue
                    : flow.whenFalse;
            } else {
              failureCode = 'dispatcher-failed';
              recordDiagnostic(
                session,
                'transport',
                'dispatcher-failed',
                result.message,
                command.id,
              );
              break;
            }
          } catch (error) {
            failureCode = 'dispatcher-threw';
            const result = {
              commandId: command.id,
              status: 'failed' as const,
              message:
                error instanceof Error
                  ? error.message
                  : 'Unknown dispatch error.',
            };

            dispatchResults.push(result);
            recordDiagnostic(
              session,
              'transport',
              'dispatcher-threw',
              result.message,
              command.id,
            );
            break;
          }
        }

        if (
          isPaused() &&
          dispatchResults.every((result) => result.status !== 'failed')
        ) {
          await waitForResume();
        }
        if (run.controller.signal.aborted) {
          return finish('cancelled', dispatchResults, 'execution-cancelled');
        }
        session.state =
          instruction === artifact.commands.length &&
          dispatchResults.every((result) => result.status !== 'failed')
            ? 'stopped'
            : 'error';
        appendTrace(
          session,
          'lifecycle',
          `Runtime session ${session.id} ${
            session.state === 'stopped' ? 'dispatch finished' : 'failed'
          }.`,
        );
        emit(
          session.state === 'stopped' ? 'session-stopped' : 'runtime-error',
          `Runtime session ${session.id} ${
            session.state === 'stopped' ? 'dispatch finished' : 'failed'
          }.`,
          session.id,
        );
      } finally {
        session.activeRun = undefined;
        releaseCapabilityLocks(session);
      }

      return finish(
        session.state === 'stopped'
          ? dispatchResults.every((result) => result.status === 'completed')
            ? 'completed'
            : 'dispatched'
          : 'failed',
        dispatchResults,
        session.state === 'stopped'
          ? undefined
          : (failureCode ?? 'dispatcher-failed'),
      );
    },
    pauseSession(sessionId) {
      return transition(
        sessionId,
        'paused',
        `Runtime session ${sessionId} paused.`,
        'session-paused',
      );
    },
    resumeSession(sessionId) {
      return transition(
        sessionId,
        'running',
        `Runtime session ${sessionId} resumed.`,
        'session-resumed',
      );
    },
    stopSession(sessionId) {
      return transition(
        sessionId,
        'stopped',
        `Runtime session ${sessionId} stopped.`,
        'session-stopped',
      );
    },
    disposeSession(sessionId) {
      return transition(
        sessionId,
        'disposed',
        `Runtime session ${sessionId} disposed.`,
        'session-disposed',
      );
    },
    inspectSession(sessionId) {
      return snapshot(getSession(sessionId));
    },
    getSessionTrace(sessionId) {
      const session = getSession(sessionId);

      return {
        id: `${session.id}-trace-artifact`,
        kind: 'trace',
        label: `Trace for ${session.id}`,
        createdAt: now(),
        sessionId: session.id,
        targetId: session.targetId,
        behaviorId: session.behaviorId,
        entries: session.trace.map((entry) => ({
          ...entry,
          program: entry.program && { ...entry.program },
        })),
      };
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function resolveTargetHealth(
  target: Target | undefined,
  sessions: RuntimeSession[],
): IntrospectionSnapshot['health'] {
  if (!target) {
    return 'unknown';
  }

  if (sessions.some((session) => session.state === 'error')) {
    return 'degraded';
  }

  return target.status === 'available' ? 'nominal' : 'unknown';
}

function traceCategoryForDiagnostic(
  category: RuntimeErrorCategory,
): RuntimeTraceCategory {
  if (category === 'validation') {
    return 'validation';
  }

  if (category === 'policy') {
    return 'policy';
  }

  if (category === 'scheduler') {
    return 'scheduler';
  }

  if (category === 'arbitration') {
    return 'arbitration';
  }

  return 'error';
}
