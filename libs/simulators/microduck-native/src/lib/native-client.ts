/** A connected, UTF-8 decoded JSON-RPC stream (Unix socket or a local gateway).
 * subscribe must install callbacks synchronously; close/error is terminal.
 */
export interface NativeMicroDuckTransport {
  send(line: string): void;
  subscribe(callbacks: {
    data(chunk: string): void;
    closed(reason?: Error): void;
  }): () => void;
  close(): void;
}

export interface NativeMicroDuckNotification {
  method: string;
  params: unknown;
}

export interface NativeMicroDuckClientOptions {
  timeoutMs?: number;
  onNotification?: (notification: NativeMicroDuckNotification) => void;
}

export interface NativeMicroDuckVelocity {
  /** Metres per second, forward positive. */
  vx?: number;
  vy?: number;
  /** Radians per second, left positive (opposite BotLab's angle convention). */
  vyaw?: number;
}

type Pending = {
  resolve(value: unknown): void;
  reject(reason: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Native daemon client. Acceptance of a command is not motion completion.
 * This does not own a motion heartbeat, angle controller or automatic reconnection.
 */
export function createNativeMicroDuckClient(
  transport: NativeMicroDuckTransport,
  { timeoutMs = 3000, onNotification }: NativeMicroDuckClientOptions = {}
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Native RPC timeout must be positive.');
  }
  const pending = new Map<number, Pending>();
  let sequence = 0;
  let buffer = '';
  let closed = false;
  let unsubscribe: (() => void) | undefined = undefined;

  function close(reason = new Error('Native transport closed.')) {
    if (closed) return;
    closed = true;
    buffer = '';
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(reason);
    }
    pending.clear();
    unsubscribe?.();
    transport.close();
  }

  function receive(chunk: string) {
    if (closed) return;
    buffer += chunk;
    let boundary: number;
    while ((boundary = buffer.indexOf('\n')) >= 0) {
      if (boundary > 2 * 1024 * 1024) {
        close(new Error('Native JSON-RPC frame exceeds 2 MB.'));
        return;
      }
      const line = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 1);
      if (!line.trim()) continue;
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        close(new Error('Malformed native JSON-RPC message.'));
        return;
      }
      if (!record(message) || message['jsonrpc'] !== '2.0') {
        close(new Error('Invalid native JSON-RPC envelope.'));
        return;
      }
      if (typeof message['id'] === 'number') {
        const request = pending.get(message['id']);
        if (!request) continue; // Late replies to timed-out requests are harmless.
        pending.delete(message['id']);
        clearTimeout(request.timer);
        if ('error' in message) {
          const error = message['error'];
          request.reject(
            new Error(
              record(error) && typeof error['message'] === 'string'
                ? error['message']
                : 'Native RPC failed.'
            )
          );
        } else if ('result' in message) {
          request.resolve(message['result']);
        } else {
          request.reject(new Error('Native RPC response has no result.'));
        }
      } else if (typeof message['method'] === 'string') {
        onNotification?.({
          method: message['method'],
          params: message['params'],
        });
      }
      if (closed) return;
    }
    if (buffer.length > 2 * 1024 * 1024) {
      close(new Error('Native JSON-RPC frame exceeds 2 MB.'));
    }
  }

  unsubscribe = transport.subscribe({ data: receive, closed: close });
  if (closed) unsubscribe();

  function call(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<unknown> {
    if (closed) return Promise.reject(new Error('Native transport closed.'));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Native RPC timed out: ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        transport.send(
          JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
        );
      } catch (error) {
        close(
          error instanceof Error ? error : new Error('Native send failed.')
        );
      }
    });
  }

  return {
    subscribeRobot: () => call('robot.subscribe', { hz: 50 }),
    subscribeDepth: () => call('tof.stream'),
    enable: (on: boolean) => call('robot.enable', { on }),
    move(velocity: NativeMicroDuckVelocity) {
      const { vx = 0, vy = 0, vyaw = 0 } = velocity;
      if (![vx, vy, vyaw].every(Number.isFinite)) {
        return Promise.reject(new Error('Native velocity must be finite.'));
      }
      return call('robot.move', { vx, vy, vyaw });
    },
    stop: () => call('robot.stop'),
    togglePosture: () => call('robot.do', { skill: 'sit_toggle' }),
    health: () => call('robot.health'),
    /** Dispose communication only. Await stop() first when the connection is healthy. */
    dispose: close,
  };
}
