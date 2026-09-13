import {
  createNativeAppConnection,
  createNativeProgram,
} from './app-connection';
import { describe, it, expect, vi } from 'vitest';

describe('native app boundary', () => {
  it('maps signed distance, degrees and wait while retaining block IDs', () => {
    expect(
      createNativeProgram({
        commands: [
          {
            commandId: 'drive-differential',
            sourceBlockId: 'back',
            inputs: { leftPower: -1, rightPower: -1, distanceMeters: 0.5 },
          },
          {
            commandId: 'drive-differential',
            inputs: { leftPower: -1, rightPower: 1, angleDegrees: -90 },
          },
          {
            commandId: 'drive-differential',
            inputs: { leftPower: 0, rightPower: 0, durationMs: 250 },
          },
        ],
      })
    ).toEqual([
      { kind: 'walk', value: -0.5, sourceBlockId: 'back' },
      { kind: 'turn', value: -90 },
      { kind: 'wait', value: 0.25 },
    ]);
  });
  it('rejects unsupported blocks and invalid motion before execution', () => {
    expect(() =>
      createNativeProgram({
        commands: [{ commandId: 'set-led-pattern', inputs: {} }],
      })
    ).toThrow('LED');
    expect(() =>
      createNativeProgram({
        commands: [
          {
            commandId: 'drive-differential',
            inputs: { leftPower: 1, rightPower: 1, distanceMeters: Infinity },
          },
        ],
      })
    ).toThrow('limits');
  });
  it('numbers writes monotonically and releases the same token on disposal', async () => {
    const requests: {
      path: string;
      body: { token: string; sequence: number };
    }[] = [];
    const fetcher = vi.fn(async (url, options) => {
      requests.push({
        path: String(url),
        body: JSON.parse(String(options?.body)),
      });
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;
    const connection = createNativeAppConnection(
      'http://127.0.0.1:4401',
      fetcher
    );
    await connection.connect();
    await connection.run([{ kind: 'wait', value: 1 }]);
    await connection.stop();
    connection.dispose();
    connection.dispose();
    expect(requests.map((r) => r.body.sequence)).toEqual([1, 2, 3, 4]);
    expect(new Set(requests.map((r) => r.body.token)).size).toBe(1);
    expect(requests[3].path).toMatch('/release');
    await expect(connection.run([{ kind: 'wait', value: 1 }])).rejects.toThrow(
      'closed'
    );
  });
  it('accepts external presentation and rejects incompatible gateways', async () => {
    let payload = {
      protocolVersion: 1,
      simulatorId: 'microduck',
      presentation: 'external',
      frameTime: 0,
      postureBusy: false,
    capabilities: { skills: ['sit_toggle'], postures: ['sit', 'stand'] },
    };
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => payload,
    })) as unknown as typeof fetch;
    const connection = createNativeAppConnection('http://local', fetcher);
    expect((await connection.snapshot()).presentation).toBe('external');
    payload = { ...payload, protocolVersion: 2 };
    await expect(connection.snapshot()).rejects.toThrow('Incompatible');
    payload = { ...payload, protocolVersion: 1, presentation: 'unknown' };
    await expect(connection.snapshot()).rejects.toThrow('Incompatible');
    connection.dispose();
  });
  it('maps posture only when the connected target advertises it', () => {
    const artifact = { commands: [{ commandId: 'set-posture', inputs: { posture: 'sit' }, sourceBlockId: 'sit-1' }] };
    expect(() => createNativeProgram(artifact)).toThrow('capability');
    expect(createNativeProgram(artifact, { skills: ['sit_toggle'], postures: ['sit', 'stand'] })).toEqual([{ kind: 'posture', value: 'sit', sourceBlockId: 'sit-1' }]);
  });

});

it('requires advertised conditions and validates even the unselected branch', () => {
  const artifact = { commands: [{ commandId: 'if-posture', sourceBlockId: 'if', inputs: { condition: { type: 'posture', posture: 'sit', sourceBlockId: 'predicate' }, then: [{ commandId: 'set-posture', inputs: { posture: 'stand' } }], else: [] } }] };
  const capabilities = { skills: ['sit_toggle'], postures: ['sit', 'stand'], postureConditions: ['sit', 'stand', 'transitioning'] };
  expect(() => createNativeProgram(artifact)).toThrow('conditions unavailable');
  expect(createNativeProgram(artifact, capabilities)).toMatchObject([{ kind: 'if', sourceBlockId: 'if', condition: { posture: 'sit', sourceBlockId: 'predicate' }, then: [{ kind: 'posture', value: 'stand' }], else: [] }]);
  expect(() => createNativeProgram(artifact, { ...capabilities, postures: [] })).toThrow('capability');
});
