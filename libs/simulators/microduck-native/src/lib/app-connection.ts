import { createNativeMicroDuckClient } from './native-client';

export type NativeProgramStep = { sourceBlockId?: string } & (
  | { kind: 'walk' | 'turn' | 'wait'; value: number }
  | { kind: 'posture'; value: 'sit' | 'stand' }
  | {
      kind: 'if';
      condition: {
        posture: 'sit' | 'stand' | 'transitioning';
        sourceBlockId?: string;
      };
      then: NativeProgramStep[];
      else: NativeProgramStep[];
    }
);
export interface NativeCapabilities {
  skills: string[];
  postures: string[];
  postureConditions?: string[];
}
export interface NativeAppSnapshot {
  protocolVersion: 1;
  simulatorId: 'microduck';
  presentation: 'embedded' | 'external';
  frameTime: number;
  state: {
    policy: string;
    odom: { position: number[]; yaw: number };
    safety: { fallen: boolean };
    loop: { hz: number };
  } | null;
  depth: { distance_mm: number[]; status: number[] } | null;
  postureBusy: boolean;
  observedPosture?: 'sit' | 'stand' | 'transitioning' | 'unknown';
  capabilities: NativeCapabilities;
  program: {
    runId: string;
    status: 'running' | 'completed' | 'stopped' | 'failed';
    index: number;
    count: number;
    step: NativeProgramStep;
    progress: number;
    error: string | null;
    errorCode?: string | null;
    decisions?: {
      sourceBlockId?: string;
      posture: string;
      observed: string;
      result: boolean;
    }[];
  } | null;
}

interface NativeCompiledCommand {
  commandId: string;
  inputs: Record<string, unknown>;
  sourceBlockId?: string;
}

export function createNativeProgram(
  artifact: { commands: readonly NativeCompiledCommand[] },
  capabilities?: NativeCapabilities
): NativeProgramStep[] {
  let count = 0;
  function lower(
    commands: readonly NativeCompiledCommand[],
    depth = 0
  ): NativeProgramStep[] {
    if (!Array.isArray(commands) || depth > 16)
      throw new Error('Invalid native branch or nesting limit.');
    return commands.map((command) => {
      if (++count > 256)
        throw new Error('Native programs support at most 256 steps.');
      if (
        !command ||
        typeof command.commandId !== 'string' ||
        !command.inputs ||
        typeof command.inputs !== 'object'
      )
        throw new Error('Invalid native command.');
      const input = command.inputs;
      if (command.commandId === 'if-posture') {
        const condition = input['condition'] as
          | { type?: string; posture?: string; sourceBlockId?: string }
          | undefined;
        if (
          condition?.type !== 'posture' ||
          !['sit', 'stand', 'transitioning'].includes(
            condition.posture ?? ''
          ) ||
          !capabilities?.postureConditions?.includes(condition.posture ?? '')
        ) {
          throw new Error(
            'Native posture conditions unavailable. Update BotLab Simulator and reconnect.'
          );
        }
        return {
          kind: 'if',
          sourceBlockId: command.sourceBlockId,
          condition: {
            posture: condition.posture as 'sit' | 'stand' | 'transitioning',
            sourceBlockId: condition.sourceBlockId,
          },
          then: lower(input['then'] as NativeCompiledCommand[], depth + 1),
          else: lower(input['else'] as NativeCompiledCommand[], depth + 1),
        };
      }
      if (command.commandId === 'set-posture') {
        const value = input['posture'];
        if (
          (value !== 'sit' && value !== 'stand') ||
          !capabilities?.skills.includes('sit_toggle') ||
          !capabilities.postures.includes(value)
        )
          throw new Error(
            'Native posture capability is unavailable. Connect a compatible simulator.'
          );
        return { kind: 'posture', value, sourceBlockId: command.sourceBlockId };
      }
      if (command.commandId !== 'drive-differential') {
        throw new Error(
          'MuJoCo native supports movement, posture, conditions and waits. Remove LED blocks before running.'
        );
      }
      const left = input['leftPower'];
      const right = input['rightPower'];
      let step: NativeProgramStep;
      if (
        typeof input['distanceMeters'] === 'number' &&
        left === right &&
        (left === 1 || left === -1)
      ) {
        step = { kind: 'walk', value: input['distanceMeters'] * left };
      } else if (
        typeof input['angleDegrees'] === 'number' &&
        left === -Number(right)
      ) {
        step = { kind: 'turn', value: input['angleDegrees'] };
      } else if (
        typeof input['durationMs'] === 'number' &&
        left === 0 &&
        right === 0
      ) {
        step = { kind: 'wait', value: input['durationMs'] / 1000 };
      } else {
        throw new Error('Unsupported native motion command.');
      }
      const limit = { walk: 5, turn: 360, wait: 60 }[step.kind];
      if (
        !Number.isFinite(step.value) ||
        Math.abs(step.value) > limit ||
        (step.kind === 'wait' ? step.value < 0 : step.value === 0)
      ) {
        throw new Error(
          'Native limits: 5 m per walk, 360° per turn and 60 s per wait.'
        );
      }
      return { ...step, sourceBlockId: command.sourceBlockId };
    });
  }
  return lower(artifact.commands);
}

/** Local gateway connection; monotonic operation numbers fence off late runs after stop. */
export function createNativeAppConnection(
  baseUrl: string,
  fetcher: typeof fetch = fetch
) {
  const token = crypto.randomUUID();
  let sequence = 0;
  let disposed = false;
  async function post(
    path: string,
    body: object = {},
    keepalive = false
  ): Promise<unknown> {
    if (disposed && path !== '/release')
      throw new Error('Native connection closed.');
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      path === '/reset' ? 20000 : 5000
    );
    try {
      const response = await fetcher(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, sequence: ++sequence, ...body }),
        signal: controller.signal,
        keepalive,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? 'Native gateway failed.');
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }
  // This transport carries the existing daemon client through the allowlisted gateway.
  let callbacks:
    | { data(chunk: string): void; closed(reason?: Error): void }
    | undefined;
  const rpc = createNativeMicroDuckClient({
    subscribe: (listener) => {
      callbacks = listener;
      return () => {
        callbacks = undefined;
      };
    },
    send: (line) => {
      void post('/rpc', { message: JSON.parse(line) }).then(
        (reply) => callbacks?.data(JSON.stringify(reply) + '\n'),
        (error) =>
          callbacks?.closed(
            error instanceof Error ? error : new Error(String(error))
          )
      );
    },
    close: () => {
      callbacks = undefined;
    },
  });
  return {
    videoUrl: `${baseUrl}/video?token=${encodeURIComponent(token)}`,
    async connect() {
      await post('/claim');
    },
    async snapshot(): Promise<NativeAppSnapshot> {
      const result = (await post('/state')) as NativeAppSnapshot;
      if (
        !result ||
        result.protocolVersion !== 1 ||
        result.simulatorId !== 'microduck' ||
        !['embedded', 'external'].includes(result.presentation) ||
        typeof result.frameTime !== 'number' ||
        typeof result.postureBusy !== 'boolean' ||
        !Array.isArray(result.capabilities?.skills) ||
        !result.capabilities.skills.every((s) => typeof s === 'string') ||
        !Array.isArray(result.capabilities?.postures) ||
        !result.capabilities.postures.every(
          (s) => s === 'sit' || s === 'stand'
        ) ||
        (result.capabilities.postureConditions !== undefined &&
          (!Array.isArray(result.capabilities.postureConditions) ||
            !result.capabilities.postureConditions.every((s) =>
              ['sit', 'stand', 'transitioning'].includes(s)
            )))
      ) {
        throw new Error(
          'Incompatible native simulator. Update BotLab Simulator and reconnect.'
        );
      }
      return result;
    },
    async run(steps: NativeProgramStep[]) {
      const runId = crypto.randomUUID();
      await post('/run', { runId, steps });
      return runId;
    },
    async stop() {
      await post('/stop');
    },
    async reset() {
      await post('/reset');
    },
    async togglePosture() {
      await rpc.togglePosture();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      rpc.dispose();
      void post('/release', {}, true).catch(() => {
        /* Server lease expires without heartbeats. */
      });
    },
  };
}
export type NativeAppConnection = ReturnType<typeof createNativeAppConnection>;
