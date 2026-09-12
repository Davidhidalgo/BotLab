import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { createMicroDuckBotLabPostMessageSourceModule } from './microduck-simulator';

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
  function fixture() {
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
    const source = new Source({
      getVelocityLimits: () => [2, -1, 3],
      isInputLocked: () => locked,
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
      source,
      control,
      send,
      stop,
      parent,
      unlock: () => {
        locked = false;
      },
      statuses: () =>
        parent.postMessage.mock.calls.map(([data]) => data.status),
    };
  }

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
});
