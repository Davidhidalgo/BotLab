import { walkingSkillTimeouts } from '@botlab/model';
import type {
  SimulationFrame,
  SimulationSession,
} from '@botlab/simulators-core';
import type { WorkerRequest, WorkerResponse } from './protocol';

export function createMujocoSession(
  factory = () =>
    new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
): SimulationSession {
  const sessionId = crypto.randomUUID();
  const worker = factory();
  const listeners = new Set<(frame: SimulationFrame) => void>();
  const pending = new Map<
    number,
    {
      resolve: (reply: WorkerResponse) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  let generation = 0;
  let nextId = 0;
  let disposed = false;
  let lastFrame: SimulationFrame | undefined;
  function failAll(error: Error) {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    worker.terminate();
    failAll(new Error('Simulation disposed.'));
    listeners.clear();
  }
  function fatal(error: Error) {
    failAll(error);
    if (lastFrame)
      for (const listener of listeners)
        listener({ ...lastFrame, state: 'error' });
    dispose();
  }
  worker.onmessage = ({ data: reply }: MessageEvent<WorkerResponse>) => {
    if (
      disposed ||
      reply.sessionId !== sessionId ||
      reply.generation !== generation
    )
      return;
    if (reply.frame) {
      lastFrame = reply.frame;
      for (const listener of listeners) listener(reply.frame);
    }
    if (reply.id === undefined) {
      if (reply.error) failAll(new Error(reply.error));
      return;
    }
    const p = pending.get(reply.id);
    if (!p) return;
    pending.delete(reply.id);
    clearTimeout(p.timer);
    if (reply.error) p.reject(new Error(reply.error));
    else p.resolve(reply);
  };
  worker.onerror = (event) => fatal(new Error(event.message));
  worker.onmessageerror = () => fatal(new Error('Invalid worker message.'));
  function request(
    operation: WorkerRequest['operation'],
    extra: Partial<WorkerRequest> = {},
    timeout = 15000,
  ) {
    if (disposed) return Promise.reject(new Error('Simulation disposed.'));
    const id = ++nextId;
    return new Promise<WorkerResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Termination prevents a timed-out command from continuing to actuate.
        fatal(new Error('Simulation worker timed out.'));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ ...extra, operation, sessionId, generation, id });
    });
  }
  async function control(operation: WorkerRequest['operation']) {
    const reply = await request(operation);
    if (!reply.frame) throw new Error('Worker omitted the simulation frame.');
    return reply.frame;
  }
  const session: SimulationSession = {
    sessionId,
    async load(manifest) {
      const reply = await request('load', { manifest }, 120000);
      if (!reply.geometry || !reply.frame)
        throw new Error('Incomplete scene response.');
      return { geometry: reply.geometry, frame: reply.frame };
    },
    start: () => control('start'),
    pause: () => control('pause'),
    step: () => control('step'),
    stop: () => control('stop'),
    reset() {
      generation++;
      failAll(new Error('Command invalidated by reset.'));
      return control('reset');
    },
    async command(command, signal) {
      if (signal?.aborted)
        throw new Error('Command cancelled before dispatch.');
      let stopped: Promise<SimulationFrame> | undefined;
      const abort = () => {
        stopped ??= session.stop();
        void stopped.catch(() => undefined);
      };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        const timeout =
          'kind' in command &&
          (command.kind === 'distance' || command.kind === 'turn')
            ? Math.max(
                120000,
                Math.min(600, command.timeoutSeconds) * 2000 + 15000,
              )
            : 'kind' in command && command.kind === 'skill'
              ? Math.max(
                  120000,
                  walkingSkillTimeouts[command.name] * 2000 + 15000,
                )
              : 120000;
        const reply = await request('command', { command }, timeout);
        if (signal?.aborted) throw new Error('Command cancelled.');
        if (!reply.result) throw new Error('Worker omitted command evidence.');
        return reply.result;
      } finally {
        signal?.removeEventListener('abort', abort);
        // Runtime ownership remains locked until the stop acknowledgement or termination.
        if (stopped) await stopped;
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose,
  };
  return session;
}
