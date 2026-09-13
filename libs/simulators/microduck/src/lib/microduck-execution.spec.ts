import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';
import { createMicroDuckBotLabPostMessageSourceModule, createMicroDuckOfficialSimulatorPatchInstructions } from './microduck-simulator';

const toolSource = ts.createSourceFile(
  'prepare.mjs',
  readFileSync(
    resolve(
      __dirname,
      '../../../../../tools/microduck/prepare-official-simulator.mjs'
    ),
    'utf8'
  ),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS
);
const declaration = toolSource.statements.find(
  (node) =>
    ts.isFunctionDeclaration(node) &&
    node.name?.text === 'createBotLabSourceModule'
)!;
const toolGenerator = new Function(
  'MESSAGE_TYPE',
  declaration.getText(toolSource) + ';return createBotLabSourceModule;'
)('botlab.microduck.control-source.v1');

describe.each([
  ['library', createMicroDuckBotLabPostMessageSourceModule],
  ['setup tool', toolGenerator],
] as const)('%s simulator execution protocol', (_, generate) => {
  function fixture(withPostures = false) {
    const parent = { postMessage: vi.fn() };
    const receiver = Object.assign(new EventTarget(), { parent });
    const Source = new Function(
      'window',
      generate({ allowedOrigins: ['https://botlab.test'] }).replace(
        'export class BotLabSource',
        'class BotLabSource'
      ) + ';return BotLabSource;'
    )(receiver);
    let locked = true;
    let position: number[] = [0, 0];
    let heading = 0;
    const postureState = { supported: true, posture: 'stand', height: .116, gyro: [0, 0, 0], time: 0, fallen: false };
    const requestPosture = vi.fn(() => { postureState.posture = 'transitioning'; return true; });
    const source = new Source({
      ...(withPostures ? { getPostureState: () => postureState, requestPosture } : {}),
      getVelocityLimits: () => [2, -1, 3],
      isInputLocked: () => locked,
      getPosition: () => position,
      getHeading: () => heading,
    });
    const control = {
      type: 'botlab.microduck.control-source.v1',
      version: 1,
      simulatorId: 'microduck-official-sim',
      executionId: 'run-1',
      source: {
        artifactId: 'plan',
        targetId: 'microduck-sim',
        errors: [],
        messages: [],
        frames: [
          {
            id: 'walk',
            type: 'differential-drive',
            leftPower: 1,
            rightPower: 1,
            durationMs: 1000,
          },
          {
            id: 'wait',
            type: 'differential-drive',
            leftPower: 0,
            rightPower: 0,
            durationMs: 5000,
          },
          {
            id: 'walk2',
            type: 'differential-drive',
            leftPower: 1,
            rightPower: 1,
            durationMs: 1000,
          },
        ],
      },
    };
    const send = (
      data = control,
      origin = 'https://botlab.test',
      sender = parent
    ) =>
      receiver.dispatchEvent(
        Object.assign(new Event('message'), { data, origin, source: sender })
      );
    const stop = () =>
      send({
        ...control,
        type: 'botlab.microduck.stop.v1',
        artifactId: 'plan',
      } as typeof control);
    return {
      source, postureState, requestPosture,
      tick: (seconds: number) => { for (let i = 0; i < Math.ceil(seconds / .02); i++) { postureState.time += .02; source.poll(.02); } },
      control,
      send,
      stop,
      parent,
      turnTo: (degrees: number) => { heading = -degrees * Math.PI / 180; },
      moveTo: (x: number, y = 0) => {
        position = [x, y];
      },
      unlock: () => {
        locked = false;
      },
      statuses: () =>
        parent.postMessage.mock.calls.map(([data]) => data.status),
    };
  }

  it('sends one posture action and waits for physical completion', () => {
    const f = fixture(true); f.source.init(); f.unlock(); f.tick(.8);
    f.control.source.frames = [{ id: 'sit', type: 'posture', posture: 'sit' }] as never;
    f.send(); f.tick(.2);
    expect(f.requestPosture).toHaveBeenCalledTimes(1);
    expect(f.statuses().at(-1)).toBe('running');
    f.postureState.posture = 'sit'; f.postureState.height = .06;
    f.tick(.4); expect(f.statuses().at(-1)).toBe('running');
    f.tick(.4); expect(f.statuses().at(-1)).toBe('completed');
    expect(f.parent.postMessage.mock.calls.some(([m]) => m.postureCompleted === true)).toBe(true);
    f.source.dispose();
  });
  it('fails a repeated posture at its block without issuing a toggle', () => {
    const f = fixture(true); f.source.init(); f.unlock(); f.tick(.8);
    f.control.source.frames = [{ id: 'stand', type: 'posture', posture: 'stand' }] as never;
    f.send(); f.tick(.1);
    expect(f.requestPosture).not.toHaveBeenCalled();
    expect(f.parent.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'failed', frameIndex: 0, errorCode: 'posture-already-stand' });
    f.source.dispose();
  });
  it.each([true, false])('selects exactly one branch (standing condition %s)', (result) => {
    const f = fixture(true); f.source.init(); f.unlock(); f.tick(.8);
    f.control.source.frames = [
      { id: 'if', type: 'posture-condition', posture: result ? 'stand' : 'sit', thenIndex: 1, elseIndex: 3, endIndex: 4 },
      { id: 'then', type: 'differential-drive', leftPower: 0, rightPower: 0, durationMs: 100 },
      { id: 'jump', type: 'jump', nextIndex: 4 },
      { id: 'else', type: 'differential-drive', leftPower: 0, rightPower: 0, durationMs: 100 },
    ] as never;
    f.send(); f.tick(.5);
    const updates = f.parent.postMessage.mock.calls.map(([m]) => m);
    expect(updates.some(m => m.frameIndex === (result ? 3 : 1))).toBe(false);
    expect(updates.find(m => m.conditionResult !== undefined)).toMatchObject({ conditionResult: result, observedPosture: 'stand' });
    expect(f.statuses().at(-1)).toBe('completed'); f.source.dispose();
  });
  it('stops a latched posture sequence without dispatching its next action', () => {
    const f = fixture(true); f.source.init(); f.unlock(); f.tick(.8);
    f.control.source.frames = [{ id: 'sit', type: 'posture', posture: 'sit' }, { id: 'stand', type: 'posture', posture: 'stand' }] as never;
    f.send(); f.tick(.1); f.stop();
    f.postureState.posture = 'sit'; f.postureState.height = .06; f.tick(1);
    expect(f.requestPosture).toHaveBeenCalledTimes(1);
    expect(f.statuses().at(-1)).toBe('stopped');
    expect(Array.from(f.source.command)).toEqual([0, 0, 0]); f.source.dispose();
  });
  it('fails unknown posture and rejected actions rather than guessing or retrying', () => {
    const f = fixture(true); f.source.init(); f.unlock();
    f.control.source.frames = [{ id: 'if', type: 'posture-condition', posture: 'sit', thenIndex: 1, elseIndex: 1, endIndex: 1 }] as never;
    f.send(); f.tick(.02);
    expect(f.parent.postMessage.mock.calls.at(-1)?.[0].errorCode).toBe('posture-unknown');
    f.tick(1); f.control.executionId = 'refused'; f.requestPosture.mockReturnValue(false);
    f.control.source.frames = [{ id: 'sit', type: 'posture', posture: 'sit' }] as never;
    f.send(); f.tick(.1);
    expect(f.parent.postMessage.mock.calls.at(-1)?.[0].errorCode).toBe('posture-refused');
    expect(f.requestPosture).toHaveBeenCalledTimes(1); f.source.dispose();
  });

  it.each([-90, 90, 180])('measures a %s degree turn, waits, reverses, then accepts a new run', (angle) => {
    const f = fixture();
    const first = f.control.source.frames[0];
    Reflect.deleteProperty(first, 'durationMs');
    Object.assign(first, { angleDegrees: angle, leftPower: Math.sign(angle), rightPower: -Math.sign(angle) });
    Object.assign(f.control.source.frames[2], { leftPower: -1, rightPower: -1 });
    f.send(); f.source.init(); f.unlock(); f.source.poll(0.02);
    expect(Math.sign(f.source.command[2])).toBe(-Math.sign(angle));
    expect(f.source.cursor).toBe(0);
    f.turnTo(angle / 2); f.source.poll(1);
    expect(f.source.cursor).toBe(0);
    f.turnTo(angle * 1.001); f.source.poll(1);
    expect(f.source.cursor).toBe(0);
    f.source.poll(0.75);
    expect(f.source.cursor).toBe(1);
    expect(f.parent.postMessage.mock.calls.some(([message]) => message.turnedDegrees >= Math.abs(angle))).toBe(true);
    f.source.poll(5);
    expect(Array.from(f.source.command)).toEqual([0, 0, 0]);
    f.source.poll(1);
    expect(f.source.command[0]).toBe(-1);
    f.source.poll(0.02);
    expect(f.statuses().at(-1)).toBe('completed');
    f.send({ ...f.control, executionId: 'run-2' });
    f.source.poll(0.02);
    expect(f.source.cursor).toBe(0);
    expect(Math.sign(f.source.command[2])).toBe(-Math.sign(angle));
    f.source.dispose();
  });

  it.each([-90, 15, 90, 180])('keeps a %s degree turn above the observed Feet policy dead zone', (angle) => {
    const f = fixture();
    f.source.getVelocityLimits = () => [0.25, -0.4, 2];
    Reflect.deleteProperty(f.control.source.frames[0], 'durationMs');
    Object.assign(f.control.source.frames[0], { angleDegrees: angle, leftPower: Math.sign(angle), rightPower: -Math.sign(angle) });
    f.send(); f.source.init(); f.unlock();
    let turned = 0;
    // Controlled transport regression: a policy that will not keep stepping at or below 1.
    // Actual physics and settled heading are checked by the browser test separately.
    for (let tick = 0; tick < 2000 && f.source.cursor === 0; tick++) {
      f.source.poll(0.02);
      const angular = f.source.command[2];
      if (angular) expect(Math.abs(angular)).toBeGreaterThanOrEqual(1.5 - 1e-6);
      if (Math.abs(angular) > 1) turned -= angular * 0.02 * 180 / Math.PI;
      f.turnTo(turned);
    }
    expect(f.source.cursor).toBe(1);
    expect(f.statuses()).not.toContain('failed');
    expect(Array.from(f.source.command)).toEqual([0, 0, 0]);
    f.source.dispose();
  });

  it('reports the first crossing between heartbeats and keeps correcting until settled', () => {
    const f = fixture();
    Reflect.deleteProperty(f.control.source.frames[0], 'durationMs');
    Object.assign(f.control.source.frames[0], { angleDegrees: 15, leftPower: 1, rightPower: -1 });
    f.send(); f.source.init(); f.unlock(); f.source.poll(0.02);
    f.turnTo(16); f.source.poll(0.02);
    expect(f.parent.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'running', turnedDegrees: 16 });
    expect(f.source.cursor).toBe(0);
    expect(f.source.pressed.turnRight).toBe(false);
    f.turnTo(25); f.source.poll(0.3); f.source.poll(0.75);
    expect(f.source.command[2]).toBeGreaterThan(0);
    expect(f.source.pressed.turnLeft).toBe(true);
    expect(f.source.pressed.turnRight).toBe(false);
    f.stop(); f.source.poll(0.02);
    expect(f.statuses().at(-1)).toBe('stopped');
    expect(Array.from(f.source.command)).toEqual([0, 0, 0]);
    f.source.dispose();
  });

  it('stops a stalled turn and accepts another run without recreating the source', () => {
    const f = fixture();
    Reflect.deleteProperty(f.control.source.frames[0], 'durationMs');
    Object.assign(f.control.source.frames[0], { angleDegrees: 90, leftPower: 1, rightPower: -1 });
    f.send(); f.source.init(); f.unlock();
    for (let i = 0; i < 110; i++) f.source.poll(0.1);
    expect(f.parent.postMessage.mock.calls.at(-1)![0]).toMatchObject({
      status: 'failed', frameIndex: 0, errorCode: 'motion-stalled',
    });
    expect(Array.from(f.source.command)).toEqual([0, 0, 0]);
    expect(f.source.frames).toHaveLength(0);
    f.send({ ...f.control, executionId: 'run-2' });
    f.source.poll(0.02);
    expect(f.source.command[2]).toBeLessThan(0);
    f.turnTo(91); f.source.poll(1); f.source.poll(0.75);
    expect(f.source.cursor).toBe(1);
    f.source.dispose();
  });

  it('cancels a measured turn without dispatching the next frame', () => {
    const f = fixture();
    Reflect.deleteProperty(f.control.source.frames[0], 'durationMs');
    Object.assign(f.control.source.frames[0], { angleDegrees: -90, leftPower: -1, rightPower: 1 });
    f.send(); f.source.init(); f.unlock(); f.source.poll(0.02);
    f.stop(); f.source.poll(1);
    expect(f.statuses().at(-1)).toBe('stopped');
    expect(Array.from(f.source.command)).toEqual([0, 0, 0]);
    expect(f.source.frames).toHaveLength(0);
    f.source.dispose();
  });

  it('acknowledges buffering, starts only after unlock, and confirms consumption once', () => {
    const f = fixture();
    f.send();
    expect(f.statuses()).toEqual(['accepted']);
    f.source.init();
    f.source.poll(10);
    expect(f.statuses()).toEqual(['accepted']);
    f.unlock();
    f.source.poll(1);
    f.source.poll(5);
    f.source.poll(1);
    expect(f.statuses()).not.toContain('completed');
    f.source.poll(0.02);
    expect(f.statuses().at(-1)).toBe('completed');
    f.send();
    f.source.poll(1);
    expect(Array.from(f.source.command)).toEqual([0, 0, 0]);
    expect(f.parent.postMessage.mock.calls.at(-1)![1]).toBe(
      'https://botlab.test'
    );
    f.source.dispose();
  });

  it.each(['buffered', 'moving', 'waiting'])(
    'stops while %s and rejects delayed delivery retries',
    (phase) => {
      const f = fixture();
      f.send();
      if (phase !== 'buffered') {
        f.source.init();
        f.unlock();
        f.source.poll(1);
        if (phase === 'waiting') f.source.poll(1);
      }
      f.stop();
      expect(f.statuses().at(-1)).toBe('stopped');
      if (phase === 'buffered') {
        f.source.init();
        f.unlock();
      }
      f.send();
      f.source.poll(100);
      expect(Array.from(f.source.command)).toEqual([0, 0, 0]);
      expect(f.statuses()).not.toContain('completed');
      f.source.dispose();
    }
  );

  it('accepts stop before delivery and does not revive that run', () => {
    const f = fixture();
    f.stop();
    f.send();
    f.source.init();
    f.unlock();
    f.source.poll(10);
    expect(f.statuses()).toEqual(['stopped', 'stopped']);
    expect(Array.from(f.source.command)).toEqual([0, 0, 0]);
    f.send({ ...f.control, executionId: 'run-2' });
    f.source.poll(0.02);
    expect(f.source.command[0]).toBe(2);
    f.source.dispose();
  });

  it('rejects foreign windows and origins and reports polling failures', () => {
    const f = fixture();
    f.send(f.control, 'https://foreign.test');
    f.send(f.control, undefined, { postMessage: vi.fn() });
    expect(f.statuses()).toEqual([]);
    f.source.init();
    f.unlock();
    f.send();
    f.source.getVelocityLimits = () => {
      throw new Error('Engine failure');
    };
    f.source.poll(0.02);
    expect(f.statuses().at(-1)).toBe('failed');
    expect(Array.from(f.source.command)).toEqual([0, 0, 0]);
    f.source.dispose();
  });

  it('uses measured distance, ignores the old duration estimate, then waits before the next walk', () => {
    const f = fixture();
    Object.assign(f.control.source.frames[0], {
      distanceMeters: 2,
      durationMs: 1,
    });
    Object.assign(f.control.source.frames[2], { distanceMeters: 2 });
    f.send();
    f.source.init();
    f.unlock();
    f.source.poll(1);
    f.source.poll(2);
    expect(f.source.cursor).toBe(0);
    expect(f.source.command[0]).toBe(2);
    f.moveTo(1);
    f.source.poll(1);
    expect(f.parent.postMessage.mock.calls.at(-1)![0]).toMatchObject({
      status: 'running',
      frameIndex: 0,
      distanceMeters: 1,
    });
    f.moveTo(2);
    f.source.poll(1);
    expect(f.source.cursor).toBe(1);
    expect(f.source.command[0]).toBe(0);
    for (let i = 0; i < 5; i++) {
      f.source.poll(1);
      expect(f.source.command[0]).toBe(0);
      expect(f.source.isActive()).toBe(true);
    }
    f.source.poll(1);
    expect(f.source.command[0]).toBe(2);
    f.moveTo(3);
    f.source.poll(1);
    expect(f.source.cursor).toBe(2);
    f.moveTo(4);
    f.source.poll(1);
    f.source.poll(0.02);
    expect(f.statuses().at(-1)).toBe('completed');
    f.source.dispose();
  });

  it.each(['telemetry-unavailable', 'position-reset', 'motion-stalled'])(
    'stops instead of claiming arrival on %s',
    (reason) => {
      const f = fixture();
      Object.assign(f.control.source.frames[0], { distanceMeters: 5 });
      f.send();
      f.source.init();
      f.unlock();
      f.source.poll(0.02);
      if (reason === 'telemetry-unavailable') f.moveTo(NaN);
      if (reason === 'position-reset') f.moveTo(20);
      if (reason === 'motion-stalled')
        for (let i = 0; i < 100; i++) f.source.poll(0.1);
      else f.source.poll(0.02);
      expect(f.parent.postMessage.mock.calls.at(-1)![0]).toMatchObject({
        status: 'failed',
        frameIndex: 0,
        errorCode: reason,
      });
      expect(Array.from(f.source.command)).toEqual([0, 0, 0]);
      expect(f.statuses()).not.toContain('completed');
      f.source.dispose();
    }
  );

  it('treats zero distance as a no-op even without position telemetry', () => {
    const f = fixture();
    Object.assign(f.control.source.frames[0], { distanceMeters: 0 });
    f.source.getPosition = undefined;
    f.send();
    f.source.init();
    f.unlock();
    f.source.poll(0.02);
    expect(f.source.command[0]).toBe(0);
    expect(f.source.cursor).toBe(1);
    f.source.dispose();
  });

  it('fails an active run when the scene locks again', () => {
    const f = fixture();
    f.send();
    f.source.init();
    f.unlock();
    f.source.poll(0.02);
    f.source.isInputLocked = () => true;
    f.source.poll(0.02);
    expect(f.parent.postMessage.mock.calls.at(-1)![0]).toMatchObject({
      status: 'failed',
      errorCode: 'scene-interrupted',
    });
    expect(f.source.command[0]).toBe(0);
    f.source.dispose();
  });

  it('does not replay consumed buffered work when the source is remounted', () => {
    const f = fixture();
    f.send(); f.source.init(); f.unlock();
    f.source.poll(1); f.source.poll(5); f.source.poll(1); f.source.poll(0.02);
    expect(f.statuses().at(-1)).toBe('completed');
    f.source.dispose();
    const remounted = new f.source.constructor({ getVelocityLimits: () => [2, -1, 3] });
    remounted.init(); remounted.poll(1);
    expect(remounted.command[0]).toBe(0);
    expect(remounted.frames).toHaveLength(0);
    remounted.dispose();
  });
});

it('upgrades the tool factory without duplicating the source and expands only known arena declarations', () => {
  const functions = [
    'patchGameSource',
    'insertAfterLastImport',
    'insertBeforeControllerConstruction',
    'controllerSourcesInclude',
    'insertControllerSource',
    'readControllerSourcesArray',
    'patchBotLabArena',
  ];
  const text = toolSource.statements
    .filter(
      (node) =>
        ts.isFunctionDeclaration(node) &&
        functions.includes(node.name?.text ?? '')
    )
    .map((node) => node.getText(toolSource))
    .join('\n');
  const { patchGameSource, patchBotLabArena } = new Function(
    text + ';return { patchGameSource, patchBotLabArena };'
  )();
  const old =
    'import { BotLabSource } from "./controls/botlab.js";\nconst botLabSource = new BotLabSource({ getVelocityLimits: () => velLims(), isInputLocked: () => inputLocked });\nconst controller = new Controller({ sources: [botLabSource] });';
  const patched = patchGameSource(old);
  expect(patched.source.match(/new BotLabSource/g)).toHaveLength(1);
  expect(patched.source).toContain(
    'getPosition: () => [data.qpos[0], data.qpos[1]]'
  );
  expect(patchGameSource(patched.source).changed).toBe(false);
  const headingFactory = old.replace('isInputLocked: () => inputLocked',
    'isInputLocked: () => inputLocked, getPosition: () => [data.qpos[0], data.qpos[1]], getHeading: () => duckYaw(data.qpos)');
  const upgraded = patchGameSource(headingFactory);
  expect(upgraded.source.match(/new BotLabSource/g)).toHaveLength(1);
  expect(upgraded.source).toContain(createMicroDuckOfficialSimulatorPatchInstructions().sourceFactoryLine);
  expect(patchGameSource(upgraded.source).changed).toBe(false);
  const reverseCalibrated = headingFactory.replace('velLims()', '(loco === "legs" ? [VEL_FWD, -0.4, VEL_ANG] : velLims())');
  const recalibrated = patchGameSource(reverseCalibrated);
  expect(recalibrated.source.match(/new BotLabSource/g)).toHaveLength(1);
  expect(recalibrated.source).toContain(createMicroDuckOfficialSimulatorPatchInstructions().sourceFactoryLine);
  expect(patchGameSource(recalibrated.source).changed).toBe(false);
  expect(patchBotLabArena('export const ARENA_HALF = 1.5;')).toBe(
    'export const ARENA_HALF = 6;'
  );
  expect(patchBotLabArena('export const ARENA_HALF = 6;')).toBe(
    'export const ARENA_HALF = 6;'
  );
  expect(() => patchBotLabArena('unknown')).toThrow('Unknown official arena');
});
