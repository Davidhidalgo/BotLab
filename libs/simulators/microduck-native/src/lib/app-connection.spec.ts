import {
  createNativeAppConnection,
  createNativeProgram,
} from './app-connection';
import { describe, it, expect, vi } from 'vitest';

describe('native app boundary', () => {
  it('preserves sensor navigation intents and source blocks', () => {
    expect(
      createNativeProgram({
        commands: [
          {
            commandId: 'navigate-by-depth',
            sourceBlockId: 'wall',
            inputs: { action: 'walk-until-obstacle' },
          },
          {
            commandId: 'navigate-by-depth',
            sourceBlockId: 'turn',
            inputs: { action: 'turn-until-clear', direction: 'left' },
          },
        ],
      }),
    ).toEqual([
      { kind: 'walk-until-obstacle', value: 1, sourceBlockId: 'wall' },
      { kind: 'turn-until-clear', value: -1, sourceBlockId: 'turn' },
    ]);
  });
  it('keeps the last snapshot during a skill download instead of filling the gateway queue', async () => {
    const payload = {
      protocolVersion: 1,
      simulatorId: 'microduck',
      presentation: 'embedded',
      frameTime: 0,
      postureBusy: false,
      capabilities: { skills: [], postures: [] },
    };
    let finishImport: ((value: Response) => void) | undefined;
    const paths: string[] = [];
    const fetcher = vi.fn(async (url) => {
      const path = String(url);
      paths.push(path);
      if (path.endsWith('/import-skill'))
        return new Promise<Response>((resolve) => {
          finishImport = resolve;
        });
      return { ok: true, json: async () => payload } as Response;
    }) as unknown as typeof fetch;
    const connection = createNativeAppConnection('http://local', fetcher);
    await connection.snapshot();
    const importing = connection.importSkill({
      repo: 'owner/model',
      name: 'bow',
      duration: 4,
    });
    await connection.snapshot();
    expect(paths).toEqual(['http://local/state', 'http://local/import-skill']);
    finishImport?.({ ok: true, json: async () => payload } as Response);
    await importing;
    connection.dispose();
  });
  it('runs only discovered kicks and retains the source block', () => {
    const artifact = {
      commands: [
        {
          commandId: 'run-skill',
          sourceBlockId: 'kick',
          inputs: { skill: 'kick_left' },
        },
      ],
    };
    expect(
      createNativeProgram(artifact, { skills: ['kick_left'], postures: [] }),
    ).toEqual([{ kind: 'skill', value: 'kick_left', sourceBlockId: 'kick' }]);
    expect(() =>
      createNativeProgram(artifact, { skills: [], postures: [] }),
    ).toThrow('unavailable');
  });
  it('accepts an imported skill only when the gateway marks it executable', () => {
    const artifact = {
      commands: [{ commandId: 'run-skill', inputs: { skill: 'polite-bow' } }],
    };
    expect(() =>
      createNativeProgram(artifact, {
        skills: ['polite-bow'],
        executableSkills: [],
        postures: [],
      }),
    ).toThrow('unavailable');
    expect(
      createNativeProgram(artifact, {
        skills: ['polite-bow'],
        executableSkills: ['polite-bow'],
        postures: [],
      }),
    ).toMatchObject([{ kind: 'skill', value: 'polite-bow' }]);
  });
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
      }),
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
      }),
    ).toThrow('LED');
    expect(() =>
      createNativeProgram({
        commands: [
          {
            commandId: 'drive-differential',
            inputs: { leftPower: 1, rightPower: 1, distanceMeters: Infinity },
          },
        ],
      }),
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
      fetcher,
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
      'closed',
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
    const artifact = {
      commands: [
        {
          commandId: 'set-posture',
          inputs: { posture: 'sit' },
          sourceBlockId: 'sit-1',
        },
      ],
    };
    expect(() => createNativeProgram(artifact)).toThrow('capability');
    expect(
      createNativeProgram(artifact, {
        skills: ['sit_toggle'],
        postures: ['sit', 'stand'],
      }),
    ).toEqual([{ kind: 'posture', value: 'sit', sourceBlockId: 'sit-1' }]);
  });
});

it('requires advertised conditions and validates even the unselected branch', () => {
  const artifact = {
    commands: [
      {
        commandId: 'if-posture',
        sourceBlockId: 'if',
        inputs: {
          condition: {
            type: 'posture',
            posture: 'sit',
            sourceBlockId: 'predicate',
          },
          then: [{ commandId: 'set-posture', inputs: { posture: 'stand' } }],
          else: [],
        },
      },
    ],
  };
  const capabilities = {
    skills: ['sit_toggle'],
    postures: ['sit', 'stand'],
    postureConditions: ['sit', 'stand', 'transitioning'],
  };
  expect(() => createNativeProgram(artifact)).toThrow('conditions unavailable');
  expect(createNativeProgram(artifact, capabilities)).toMatchObject([
    {
      kind: 'if',
      sourceBlockId: 'if',
      condition: { posture: 'sit', sourceBlockId: 'predicate' },
      then: [{ kind: 'posture', value: 'stand' }],
      else: [],
    },
  ]);
  expect(() =>
    createNativeProgram(artifact, { ...capabilities, postures: [] }),
  ).toThrow('capability');
});

it('preserves repeated command source and iteration metadata through native lowering', () => {
  const iterations = [{ sourceBlockId: 'loop', iteration: 2, count: 3 }];
  expect(
    createNativeProgram({
      commands: [
        {
          commandId: 'drive-differential',
          sourceBlockId: 'wait',
          iterations,
          inputs: { leftPower: 0, rightPower: 0, durationMs: 100 },
        },
      ],
    }),
  ).toEqual([{ kind: 'wait', value: 0.1, sourceBlockId: 'wait', iterations }]);
});
