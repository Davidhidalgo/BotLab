import {
  postMicroDuckSimulatorControlSource,
  type MicroDuckSimulatorControlSource,
} from './microduck-simulator';

export type MicroDuckExecutionStatus =
  | 'accepted'
  | 'running'
  | 'completed'
  | 'stopped'
  | 'failed';
export interface MicroDuckExecutionUpdate {
  executionId: string;
  artifactId: string;
  status: MicroDuckExecutionStatus;
  frameIndex?: number;
}
export interface MicroDuckExecutionRequest {
  targetWindow: Window;
  targetOrigin: string;
  source: MicroDuckSimulatorControlSource;
}

export function observeMicroDuckExecution(
  request: MicroDuckExecutionRequest,
  onUpdate: (update: MicroDuckExecutionUpdate) => void,
  hostWindow: Window = window
) {
  const executionId = Array.from(
    hostWindow.crypto.getRandomValues(new Uint32Array(4)),
    (n) => n.toString(16)
  ).join('-');
  const { targetWindow, targetOrigin, source } = request;
  const origin = new URL(targetOrigin).origin;
  let stopping = false;
  let terminal = false;
  let disposed = false;
  let timers: number[] = [];
  const base = { executionId, artifactId: source.artifactId };
  const clearTimers = () => {
    timers.forEach((timer) => hostWindow.clearTimeout(timer));
    timers = [];
  };
  function post(stop = false) {
    if (disposed || terminal) return;
    try {
      if (stop)
        targetWindow.postMessage(
          {
            type: 'botlab.microduck.stop.v1',
            version: 1,
            simulatorId: 'microduck-official-sim',
            ...base,
          },
          origin
        );
      else
        postMicroDuckSimulatorControlSource(
          targetWindow,
          source,
          origin,
          executionId
        );
    } catch {
      terminal = true;
      clearTimers();
      onUpdate({ ...base, status: 'failed' });
    }
  }
  function receive(event: MessageEvent) {
    if (
      disposed ||
      terminal ||
      event.source !== targetWindow ||
      event.origin !== origin
    )
      return;
    const data = event.data;
    if (
      !data ||
      data.type !== 'botlab.microduck.execution.v1' ||
      data.version !== 1 ||
      data.simulatorId !== 'microduck-official-sim' ||
      data.executionId !== executionId ||
      data.artifactId !== source.artifactId ||
      !['accepted', 'running', 'completed', 'stopped', 'failed'].includes(
        data.status
      )
    )
      return;
    if (
      data.frameIndex !== undefined &&
      (!Number.isInteger(data.frameIndex) ||
        data.frameIndex < 0 ||
        data.frameIndex >= source.frames.length)
    )
      return;
    if (stopping && (data.status === 'accepted' || data.status === 'running'))
      return;
    terminal = ['completed', 'stopped', 'failed'].includes(data.status);
    clearTimers();
    onUpdate({ ...base, status: data.status, frameIndex: data.frameIndex });
  }
  hostWindow.addEventListener('message', receive);
  timers = [1000, 3000, 8000, 15000].map((delay) =>
    hostWindow.setTimeout(() => post(), delay)
  );
  post();
  return {
    executionId,
    stop() {
      if (disposed || terminal || stopping) return;
      stopping = true;
      clearTimers();
      timers = [250, 750, 1500].map((delay) =>
        hostWindow.setTimeout(() => post(true), delay)
      );
      post(true);
    },
    dispose() {
      if (disposed) return;
      // Stop before detaching; callers remove the iframe if no acknowledgment arrives.
      post(true);
      disposed = true;
      clearTimers();
      hostWindow.removeEventListener('message', receive);
    },
  };
}
