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
  elapsedMs?: number;
  distanceMeters?: number;
  turnedDegrees?: number;
  errorCode?: string;
  failureOrigin?: 'simulator' | 'transport';
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
  const reachedDistanceFrames = new Set<number>();
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
      onUpdate({ ...base, status: 'failed', failureOrigin: 'transport' });
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
    if (
      [data.elapsedMs, data.distanceMeters, data.turnedDegrees].some(
        (value) =>
          value !== undefined &&
          (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      )
    )
      return;
    if (
      data.errorCode !== undefined &&
      ![
        'invalid-frame',
        'telemetry-unavailable',
        'position-reset',
        'motion-stalled',
        'motion-timeout',
        'scene-interrupted',
      ].includes(data.errorCode)
    )
      return;
    const frame = source.frames[data.frameIndex];
    if (
      data.status === 'running' &&
      frame?.type === 'differential-drive' &&
      ((frame.distanceMeters !== undefined && data.distanceMeters >= frame.distanceMeters) ||
        (frame.angleDegrees !== undefined && data.turnedDegrees >= Math.abs(frame.angleDegrees)))
    ) {
      reachedDistanceFrames.add(data.frameIndex);
    }
    if (stopping && (data.status === 'accepted' || data.status === 'running'))
      return;
    const missingArrival =
      data.status === 'completed'
        ? source.frames.findIndex(
            (frame, index) =>
              frame.type === 'differential-drive' &&
              (frame.distanceMeters !== undefined || frame.angleDegrees !== undefined) &&
              !reachedDistanceFrames.has(index)
          )
        : -1;
    terminal = ['completed', 'stopped', 'failed'].includes(data.status);
    clearTimers();
    if (missingArrival >= 0) {
      onUpdate({
        ...base,
        status: 'failed',
        frameIndex: missingArrival,
        errorCode: 'telemetry-unavailable',
        failureOrigin: 'transport',
      });
      return;
    }
    onUpdate({
      ...base,
      status: data.status,
      frameIndex: data.frameIndex,
      elapsedMs: data.elapsedMs,
      distanceMeters: data.distanceMeters,
      turnedDegrees: data.turnedDegrees,
      errorCode: data.errorCode,
      failureOrigin: data.status === 'failed' ? 'simulator' : undefined,
    });
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
