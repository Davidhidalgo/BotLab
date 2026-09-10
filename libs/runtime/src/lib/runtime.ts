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
  validateBehaviorDefinition,
  validateCompiledBehaviorArtifact,
} from '@botlab/model';

export type RuntimeSessionState =
  | 'created'
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
  | 'dispatch'
  | 'validation'
  | 'error';

export type RuntimeErrorCategory =
  | 'validation'
  | 'policy'
  | 'adapter'
  | 'transport'
  | 'scheduler'
  | 'simulator'
  | 'lifecycle';

export type RuntimeErrorCode =
  | 'behavior-validation-failed'
  | 'compiled-artifact-validation-failed'
  | 'policy-denied'
  | 'policy-confirmation-required'
  | 'missing-compiled-artifact'
  | 'missing-dispatcher'
  | 'dispatcher-failed'
  | 'dispatcher-threw'
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

export interface RuntimeSessionSnapshot {
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
  diagnostics: RuntimeDiagnostic[];
  recentEvents: RuntimeEvent[];
}

export type RuntimeCommandDispatchStatus = 'dispatched' | 'failed';

export interface RuntimeCommandDispatchResult {
  commandId: string;
  status: RuntimeCommandDispatchStatus;
  message: string;
}

export interface RuntimeCommandDispatcher {
  targetId: string;
  dispatch(
    command: CompiledCommand,
  ): RuntimeCommandDispatchResult | Promise<RuntimeCommandDispatchResult>;
}

export interface RuntimeLoadResult {
  snapshot: RuntimeSessionSnapshot;
  validation: ValidationResult;
}

export interface RuntimeRunResult {
  snapshot: RuntimeSessionSnapshot;
  dispatchResults: RuntimeCommandDispatchResult[];
}

export type RuntimeEventType =
  | 'session-created'
  | 'artifact-loaded'
  | 'policy-evaluated'
  | 'policy-confirmed'
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
  createSession(options?: RuntimeSessionOptions): RuntimeSessionSnapshot;
  loadBehavior(sessionId: string, behavior: Behavior): RuntimeLoadResult;
  loadCompiledBehavior(
    sessionId: string,
    artifact: CompiledBehaviorArtifact,
  ): RuntimeLoadResult;
  confirmPolicy(sessionId: string): RuntimeSessionSnapshot;
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
  policyConfirmed: boolean;
  messages: string[];
}

export function createBotLabRuntime(config: RuntimeConfig): BotLabRuntime {
  const sessions = new Map<string, RuntimeSession>();
  const listeners = new Set<RuntimeEventListener>();
  const events: RuntimeEvent[] = [];
  const now = config.now ?? (() => new Date().toISOString());
  let sessionCounter = 0;
  let eventCounter = 0;
  let diagnosticCounter = 0;

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
      category === 'validation'
        ? 'validation'
        : category === 'policy'
          ? 'policy'
          : 'error',
      message,
      commandId,
    );
    emit(severity === 'error' ? 'runtime-error' : 'policy-evaluated', message, session.id);
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
      dispatchedCommandCount: session.dispatchedCommandCount,
      trace: [...session.trace],
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

  function evaluatePolicies(artifact: CompiledBehaviorArtifact): RuntimePolicyEvaluation {
    const matches: Array<{ policy: Policy; rule: PolicyRule; commandId?: string }> = [];

    for (const policy of config.policies ?? []) {
      for (const rule of policy.rules) {
        for (const command of artifact.commands) {
          const targetMatches = !rule.targetIds?.length || rule.targetIds.includes(command.targetId);
          const capabilityMatches =
            !rule.capabilityIds?.length || rule.capabilityIds.includes(command.capabilityId);

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
          `Policy rule ${rule.id} ${rule.effect} for ${commandId ?? artifact.id}.`,
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
      emit('policy-evaluated', `Policy allowed session ${session.id}.`, session.id);
      return;
    }

    if (evaluation.decision === 'warn') {
      recordDiagnostic(
        session,
        'policy',
        'policy-confirmation-required',
        `Policy warning for session ${session.id}: ${evaluation.messages.join(' ')}`,
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

    session.state = state;
    appendTrace(session, 'lifecycle', message);
    emit(eventType, message, session.id);

    return snapshot(session);
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
          ['created', 'ready', 'awaiting-confirmation', 'running', 'paused'].includes(
            session.state,
          ),
        ).length,
        diagnostics: sessionSnapshots.flatMap((session) => session.diagnostics),
        recentEvents: events.slice(-25),
      };
    },
    inspectTarget(targetId) {
      const target = listTargets().find((candidate) => candidate.id === targetId);
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
    createSession(options = {}) {
      sessionCounter += 1;

      const session: RuntimeSession = {
        id: options.id ?? `runtime-session-${sessionCounter}`,
        state: 'created',
        dispatchedCommandCount: 0,
        trace: [],
        diagnostics: [],
        policyConfirmed: false,
        messages: [],
      };

      sessions.set(session.id, session);
      appendTrace(session, 'lifecycle', `Runtime session ${session.id} created.`);
      emit('session-created', `Runtime session ${session.id} created.`, session.id);

      return snapshot(session);
    },
    loadBehavior(sessionId, behavior) {
      const session = getSession(sessionId);
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

      session.loadedArtifact = artifact;
      session.targetId = artifact.targetId;
      session.behaviorId = artifact.behaviorId;
      session.state = 'ready';
      appendTrace(session, 'load', `Compiled artifact ${artifact.id} loaded.`);
      emit('artifact-loaded', `Compiled artifact ${artifact.id} loaded.`, session.id);
      applyPolicyEvaluation(session, evaluatePolicies(artifact));

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

      session.policyConfirmed = true;
      session.state = 'ready';
      appendTrace(session, 'policy', `Policy confirmed for session ${session.id}.`);
      emit('policy-confirmed', `Policy confirmed for session ${session.id}.`, session.id);

      return snapshot(session);
    },
    async startSession(sessionId) {
      const session = getSession(sessionId);

      if (!session.loadedArtifact) {
        session.state = 'error';
        recordDiagnostic(
          session,
          'lifecycle',
          'missing-compiled-artifact',
          `Runtime session ${session.id} has no loaded artifact.`,
        );

        return {
          snapshot: snapshot(session),
          dispatchResults: [],
        };
      }

      if (session.state === 'disposed') {
        recordDiagnostic(
          session,
          'lifecycle',
          'disposed-session-transition',
          `Runtime session ${session.id} is disposed.`,
        );

        return {
          snapshot: snapshot(session),
          dispatchResults: [],
        };
      }

      if (
        session.policyEvaluation?.decision === 'require-confirmation' &&
        !session.policyConfirmed
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

        return {
          snapshot: snapshot(session),
          dispatchResults: [],
        };
      }

      if (session.policyEvaluation?.decision === 'deny') {
        session.state = 'error';
        recordDiagnostic(
          session,
          'policy',
          'policy-denied',
          `Runtime session ${session.id} cannot start because policy denied it.`,
        );

        return {
          snapshot: snapshot(session),
          dispatchResults: [],
        };
      }

      session.state = 'running';
      appendTrace(session, 'lifecycle', `Runtime session ${session.id} started.`);
      emit('session-started', `Runtime session ${session.id} started.`, session.id);

      const dispatchResults: RuntimeCommandDispatchResult[] = [];

      for (const command of session.loadedArtifact.commands) {
        const dispatcher = config.dispatchers?.find(
          (candidate) => candidate.targetId === command.targetId,
        );

        if (!dispatcher) {
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
          continue;
        }

        try {
          const result = await dispatcher.dispatch(command);
          dispatchResults.push(result);

          if (result.status === 'dispatched') {
            session.dispatchedCommandCount += 1;
            appendTrace(session, 'dispatch', result.message, command.id);
            emit('command-dispatched', result.message, session.id);
          } else {
            recordDiagnostic(
              session,
              'transport',
              'dispatcher-failed',
              result.message,
              command.id,
            );
          }
        } catch (error) {
          const result = {
            commandId: command.id,
            status: 'failed' as const,
            message: error instanceof Error ? error.message : 'Unknown dispatch error.',
          };

          dispatchResults.push(result);
          recordDiagnostic(
            session,
            'transport',
            'dispatcher-threw',
            result.message,
            command.id,
          );
        }
      }

      session.state = dispatchResults.every((result) => result.status === 'dispatched')
        ? 'stopped'
        : 'error';
      appendTrace(
        session,
        'lifecycle',
        `Runtime session ${session.id} ${session.state === 'stopped' ? 'completed' : 'failed'}.`,
      );
      emit(
        session.state === 'stopped' ? 'session-stopped' : 'runtime-error',
        `Runtime session ${session.id} ${session.state === 'stopped' ? 'completed' : 'failed'}.`,
        session.id,
      );

      return {
        snapshot: snapshot(session),
        dispatchResults,
      };
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
        entries: [...session.trace],
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
