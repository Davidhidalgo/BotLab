import type {
  Artifact,
  Behavior,
  BotLabAdapter,
  Capability,
  CompiledBehaviorArtifact,
  CompiledCommand,
  IntrospectionSnapshot,
  Policy,
  SimulatorIntegration,
  Target,
  ValidationResult,
} from '@botlab/model';
import { validateCompiledBehaviorArtifact } from '@botlab/model';

export type RuntimeSessionState =
  | 'created'
  | 'ready'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'error'
  | 'disposed';

export type RuntimeTraceCategory =
  | 'lifecycle'
  | 'load'
  | 'dispatch'
  | 'error';

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
  messages: string[];
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
  policies?: Policy[];
  dispatchers?: RuntimeCommandDispatcher[];
  now?: () => string;
}

export interface BotLabRuntime {
  listTargets(): Target[];
  listCapabilities(): Capability[];
  listSimulatorIntegrations(): SimulatorIntegration[];
  inspectTarget(targetId: string): IntrospectionSnapshot;
  createSession(options?: RuntimeSessionOptions): RuntimeSessionSnapshot;
  loadCompiledBehavior(
    sessionId: string,
    artifact: CompiledBehaviorArtifact,
  ): RuntimeLoadResult;
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
  messages: string[];
}

export function createBotLabRuntime(config: RuntimeConfig): BotLabRuntime {
  const sessions = new Map<string, RuntimeSession>();
  const listeners = new Set<RuntimeEventListener>();
  const now = config.now ?? (() => new Date().toISOString());
  let sessionCounter = 0;
  let eventCounter = 0;

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

  function emit(type: RuntimeEventType, message: string, sessionId?: string) {
    const event: RuntimeEvent = {
      id: `runtime-event-${eventCounter + 1}`,
      timestamp: now(),
      type,
      sessionId,
      message,
    };

    eventCounter += 1;
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
      messages: [...session.messages],
    };
  }

  function transition(
    sessionId: string,
    state: RuntimeSessionState,
    message: string,
    eventType: RuntimeEventType,
  ): RuntimeSessionSnapshot {
    const session = getSession(sessionId);

    if (session.state === 'disposed') {
      appendTrace(session, 'error', `Disposed session ${session.id} cannot transition.`);
      emit('runtime-error', `Disposed session ${session.id} cannot transition.`, session.id);
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
    inspectTarget(targetId) {
      const target = listTargets().find((candidate) => candidate.id === targetId);

      return {
        targetId,
        health: target?.status === 'available' ? 'nominal' : 'unknown',
        messages: target
          ? [`${target.name} is registered through ${target.adapterId}.`]
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
        messages: [],
      };

      sessions.set(session.id, session);
      appendTrace(session, 'lifecycle', `Runtime session ${session.id} created.`);
      emit('session-created', `Runtime session ${session.id} created.`, session.id);

      return snapshot(session);
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
        appendTrace(
          session,
          'error',
          `Compiled artifact ${artifact.id} failed validation.`,
        );
        emit(
          'runtime-error',
          `Compiled artifact ${artifact.id} failed validation.`,
          session.id,
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

      return {
        snapshot: snapshot(session),
        validation,
      };
    },
    async startSession(sessionId) {
      const session = getSession(sessionId);

      if (!session.loadedArtifact) {
        session.state = 'error';
        appendTrace(session, 'error', `Runtime session ${session.id} has no loaded artifact.`);
        emit('runtime-error', `Runtime session ${session.id} has no loaded artifact.`, session.id);

        return {
          snapshot: snapshot(session),
          dispatchResults: [],
        };
      }

      if (session.state === 'disposed') {
        appendTrace(session, 'error', `Runtime session ${session.id} is disposed.`);
        emit('runtime-error', `Runtime session ${session.id} is disposed.`, session.id);

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
          appendTrace(session, 'error', result.message, command.id);
          emit('runtime-error', result.message, session.id);
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
            appendTrace(session, 'error', result.message, command.id);
            emit('runtime-error', result.message, session.id);
          }
        } catch (error) {
          const result = {
            commandId: command.id,
            status: 'failed' as const,
            message: error instanceof Error ? error.message : 'Unknown dispatch error.',
          };

          dispatchResults.push(result);
          appendTrace(session, 'error', result.message, command.id);
          emit('runtime-error', result.message, session.id);
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
