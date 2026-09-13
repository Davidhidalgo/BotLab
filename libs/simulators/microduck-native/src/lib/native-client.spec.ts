import {
  createNativeMicroDuckClient,
  type NativeMicroDuckTransport,
} from './native-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

function fixture() {
  let callbacks: Parameters<NativeMicroDuckTransport['subscribe']>[0];
  const unsubscribe = vi.fn();
  const transport: NativeMicroDuckTransport = {
    send: vi.fn(),
    close: vi.fn(),
    subscribe: (listener) => {
      callbacks = listener;
      return unsubscribe;
    },
  };
  const notification = vi.fn();
  const client = createNativeMicroDuckClient(transport, {
    timeoutMs: 100,
    onNotification: notification,
  });
  return {
    client,
    transport,
    unsubscribe,
    notification,
    data: (chunk: string) => callbacks.data(chunk),
    disconnect: () => callbacks.closed(),
    reply: (id: number, result: unknown) =>
      callbacks.data(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('native MicroDuck daemon protocol', () => {
  it('correlates fragmented and out-of-order responses alongside telemetry', async () => {
    const f = fixture();
    const health = f.client.health();
    const subscribed = f.client.subscribeRobot();
    f.data('{"jsonrpc":"2.0","method":"robot.state",');
    f.data(
      '"params":{"policy":"stand"}}\n{"jsonrpc":"2.0","id":2,"result":{"accepted":true}}\n'
    );
    f.reply(1, { healthy: true });
    await expect(health).resolves.toEqual({ healthy: true });
    await expect(subscribed).resolves.toEqual({ accepted: true });
    expect(f.notification).toHaveBeenCalledWith({
      method: 'robot.state',
      params: { policy: 'stand' },
    });
    f.client.dispose();
  });

  it('sends native velocity, stop, posture and stream commands', async () => {
    const f = fixture();
    const calls = [
      f.client.move({ vx: 0.25, vyaw: -2 }),
      f.client.stop(),
      f.client.togglePosture(),
      f.client.subscribeDepth(),
      f.client.enable(true),
    ];
    const sent = vi
      .mocked(f.transport.send)
      .mock.calls.map(([line]) => JSON.parse(line));
    expect(sent.map(({ method, params }) => ({ method, params }))).toEqual([
      { method: 'robot.move', params: { vx: 0.25, vy: 0, vyaw: -2 } },
      { method: 'robot.stop', params: {} },
      { method: 'robot.do', params: { skill: 'sit_toggle' } },
      { method: 'tof.stream', params: {} },
      { method: 'robot.enable', params: { on: true } },
    ]);
    sent.forEach(({ id }) => f.reply(id, { accepted: true }));
    await Promise.all(calls);
    f.client.dispose();
  });

  it('rejects non-finite motion before touching the transport', async () => {
    const f = fixture();
    await expect(f.client.move({ vx: NaN })).rejects.toThrow('finite');
    await expect(f.client.move({ vyaw: Infinity })).rejects.toThrow('finite');
    expect(f.transport.send).not.toHaveBeenCalled();
    f.client.dispose();
  });

  it('reports daemon rejection instead of treating it as success', async () => {
    const f = fixture();
    const response = f.client.togglePosture();
    f.data(
      '{"jsonrpc":"2.0","id":1,"error":{"code":-1,"message":"policy disabled"}}\n'
    );
    await expect(response).rejects.toThrow('policy disabled');
    f.client.dispose();
  });

  it('times out without retries and ignores late replies', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const response = expect(f.client.move({ vx: 0.25 })).rejects.toThrow(
      'timed out'
    );
    await vi.advanceTimersByTimeAsync(101);
    await response;
    f.reply(1, {});
    expect(f.transport.send).toHaveBeenCalledTimes(1);
    const stop = f.client.stop();
    f.reply(2, {});
    await stop;
    f.client.dispose();
  });

  it('rejects all pending calls on disconnect and never reconnects implicitly', async () => {
    const f = fixture();
    const first = f.client.health();
    const second = f.client.stop();
    f.disconnect();
    await expect(first).rejects.toThrow('closed');
    await expect(second).rejects.toThrow('closed');
    await expect(f.client.move({ vx: 1 })).rejects.toThrow('closed');
    f.client.dispose();
    expect(f.unsubscribe).toHaveBeenCalledTimes(1);
    expect(f.transport.close).toHaveBeenCalledTimes(1);
  });

  it.each(['not-json\n', '{"result":true}\n', 'x'.repeat(2 * 1024 * 1024 + 1)])(
    'closes on malformed or unbounded input (%#)',
    async (data) => {
      const f = fixture();
      const response = f.client.health();
      f.data(data);
      await expect(response).rejects.toThrow();
      expect(f.transport.close).toHaveBeenCalledTimes(1);
    }
  );

  it('cleans up pending requests when sending fails', async () => {
    const f = fixture();
    vi.mocked(f.transport.send).mockImplementation(() => {
      throw new Error('socket lost');
    });
    await expect(f.client.stop()).rejects.toThrow('socket lost');
    expect(f.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
