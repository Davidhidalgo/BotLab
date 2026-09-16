import { createNativeProgram } from '@botlab/simulators-microduck-native';
import { sampleScratchBlocksWorkspaceArtifact } from '@botlab/blocks';
import {
  createMicroDuckBotLabOfficialSource,
  createMicroDuckBotLabPostMessageSourceModule,
  createMicroDuckSimulatorControlSource,
} from '@botlab/simulators-microduck';
import { compileMicroDuckWorkspaceArtifact } from './botlab-flow-machine';

const walk = (distance: number) =>
  `<block type="botlab_microduck_walk_distance"><field name="DISTANCE">${distance}</field></block>`;
const wait = (seconds: string) =>
  `<block type="control_wait"><value name="DURATION"><shadow type="math_positive_number"><field name="NUM">${seconds}</field></shadow></value></block>`;

function compile(blocks: string[], detached = '') {
  const xml = new DOMParser().parseFromString(
    '<xml><block type="event_whenflagclicked"/></xml>',
    'text/xml',
  );
  let previous = xml.documentElement.firstElementChild!;
  for (const text of blocks) {
    const block = xml.importNode(
      new DOMParser().parseFromString(text, 'text/xml').documentElement,
      true,
    );
    const next = xml.createElement('next');
    next.appendChild(block);
    previous.appendChild(next);
    previous = block;
  }
  if (detached)
    xml.documentElement.appendChild(
      xml.importNode(
        new DOMParser().parseFromString(detached, 'text/xml').documentElement,
        true,
      ),
    );
  return compileMicroDuckWorkspaceArtifact(
    {
      ...sampleScratchBlocksWorkspaceArtifact,
      content: new XMLSerializer().serializeToString(xml),
    },
    'microduck-sim',
  );
}

describe('sequential MicroDuck compilation', () => {
  it('keeps posture compilation in libraries and maps it to the iframe backend', () => {
    const artifact = compile(['<block type="botlab_microduck_sit" id="sit"/>']);
    expect(artifact.commands[0]).toMatchObject({
      commandId: 'set-posture',
      inputs: { posture: 'sit' },
      sourceBlockId: 'sit',
    });
    expect(
      createMicroDuckSimulatorControlSource(artifact).frames[0],
    ).toMatchObject({ type: 'posture', posture: 'sit' });
  });
  it('compiles all eight movement blocks with stable IDs, units and clockwise positive angles', () => {
    const blocks = [
      'walk_steps',
      'back_steps',
      'turn_left',
      'turn_right',
      'turn_around',
      'walk_distance',
      'back_distance',
      'turn_degrees',
    ];
    const artifact = compile(
      blocks.map(
        (type) => `<block type="botlab_microduck_${type}" id="${type}"/>`,
      ),
    );
    expect(artifact.commands.slice(0, -1).map(({ inputs }) => inputs)).toEqual([
      { leftPower: 1, rightPower: 1, distanceMeters: 0.5 },
      { leftPower: -1, rightPower: -1, distanceMeters: 0.5 },
      { leftPower: -1, rightPower: 1, angleDegrees: -90 },
      { leftPower: 1, rightPower: -1, angleDegrees: 90 },
      { leftPower: 1, rightPower: -1, angleDegrees: 180 },
      { leftPower: 1, rightPower: 1, distanceMeters: 5 },
      { leftPower: -1, rightPower: -1, distanceMeters: 1 },
      { leftPower: 1, rightPower: -1, angleDegrees: 90 },
    ]);
    const source = createMicroDuckSimulatorControlSource(artifact);
    expect(source.errors).toEqual([]);
    expect(
      source.frames.slice(0, -1).map(({ sourceBlockId }) => sourceBlockId),
    ).toEqual(blocks);
  });
  it.each([-360, -90, 0, 90, 360])(
    'preserves a signed turn of %s degrees',
    (angle) => {
      const artifact = compile([
        `<block type="botlab_microduck_turn_degrees"><field name="ANGLE">${angle}</field></block>`,
      ]);
      expect(artifact.commands[0].inputs).toMatchObject({
        angleDegrees: angle,
        leftPower: Math.sign(angle),
        rightPower: -Math.sign(angle),
      });
    },
  );
  it.each(['-1', '41', '0.5', 'NaN', ''])(
    'rejects invalid step counts %s',
    (value) => {
      expect(() =>
        compile([
          `<block type="botlab_microduck_walk_steps"><field name="STEPS">${value}</field></block>`,
        ]),
      ).toThrow();
    },
  );
  it.each(['-361', '361', 'Infinity', '90x', ''])(
    'rejects invalid angles %s',
    (value) => {
      expect(() =>
        compile([
          `<block type="botlab_microduck_turn_degrees"><field name="ANGLE">${value}</field></block>`,
        ]),
      ).toThrow('Invalid motion ANGLE');
    },
  );
  it('compiles walk, wait, walk in connection order, with unique command IDs', () => {
    const artifact = compile([walk(2), wait('2.5'), walk(2)]);
    expect(artifact.commands.map(({ inputs }) => inputs)).toEqual([
      { leftPower: 1, rightPower: 1, distanceMeters: 2 },
      { leftPower: 0, rightPower: 0, durationMs: 2500 },
      { leftPower: 1, rightPower: 1, distanceMeters: 2 },
      { leftPower: 0, rightPower: 0, durationMs: 250 },
    ]);
    expect(new Set(artifact.commands.map(({ id }) => id)).size).toBe(4);
  });

  it('ignores detached blocks and preserves repeated LED blocks', () => {
    const leds =
      '<block type="botlab_microduck_set_leds"><field name="PATTERN">off</field></block>';
    const artifact = compile([leds, wait('0'), leds], walk(20));
    expect(artifact.commands.map(({ commandId }) => commandId)).toEqual([
      'set-led-pattern',
      'drive-differential',
      'set-led-pattern',
      'drive-differential',
    ]);
    expect(artifact.commands[1].inputs.durationMs).toBe(0);
  });

  it('preserves zero distance and source block identities without inventing a duration', () => {
    const artifact = compile([
      '<block type="botlab_microduck_walk_distance" id="walk-zero"><field name="DISTANCE">0</field></block>',
    ]);
    expect(artifact.commands[0]).toMatchObject({
      sourceBlockId: 'walk-zero',
      inputs: { distanceMeters: 0 },
    });
    expect(artifact.commands[0].inputs.durationMs).toBeUndefined();
    expect(
      createMicroDuckSimulatorControlSource(artifact).frames[0].sourceBlockId,
    ).toBe('walk-zero');
  });

  it.each(['5x', '', '-1', '21', 'Infinity'])(
    'rejects invalid walk distance %s instead of truncating or clamping it',
    (distance) => {
      expect(() =>
        compile([
          `<block type="botlab_microduck_walk_distance"><field name="DISTANCE">${distance}</field></block>`,
        ]),
      ).toThrow('Unsupported walk distance');
    },
  );

  it.each(['-1', 'NaN', 'Infinity', '', '2x', '1e309'])(
    'rejects invalid wait duration %s',
    (seconds) => {
      expect(() => compile([wait(seconds)])).toThrow('Wait duration must be');
    },
  );

  it('does not silently skip unsupported connected blocks or expressions', () => {
    expect(() => compile(['<block type="control_forever"/>', walk(2)])).toThrow(
      'Unsupported connected block',
    );
    expect(() =>
      compile([
        '<block type="control_wait"><value name="DURATION"><block type="operator_add"/></value></block>',
      ]),
    ).toThrow('Wait requires a numeric duration');
    expect(() => compile([])).toThrow('Connect at least one block');
    expect(() =>
      compile([walk(2)], '<block type="event_whenflagclicked"/>'),
    ).toThrow('Use one green flag script');
  });

  it.each(['native', 'generated'])(
    'stops throughout the wait and resumes in the %s receiver',
    (receiver) => {
      const controlSource = createMicroDuckSimulatorControlSource(
        compile([walk(2), wait('2.5'), walk(2)]),
      );
      expect(controlSource.errors).toEqual([]);
      let x = 0;
      const getPosition = () => [x, 0];
      const source =
        receiver === 'native'
          ? createMicroDuckBotLabOfficialSource({
              getVelocityLimits: () => [2, -1, 3],
              getPosition,
            })
          : new (new Function(
              'window',
              createMicroDuckBotLabPostMessageSourceModule({
                allowedOrigins: ['http://localhost'],
              }).replace('export class BotLabSource', 'class BotLabSource') +
                '\nreturn BotLabSource;',
            )(new EventTarget()))({
              getVelocityLimits: () => [2, -1, 3],
              getPosition,
            });
      source.load(controlSource);
      source.poll(1);
      expect(source.command[0]).toBe(2);
      x = 2;
      source.poll(1);
      expect(Array.from(source.command)).toEqual([0, 0, 0]);
      for (let i = 0; i < 5; i++) {
        source.poll(0.5);
        expect(Array.from(source.command)).toEqual([0, 0, 0]);
      }
      source.poll(1);
      expect(source.command[0]).toBe(2);
      x = 4;
      source.poll(1);
      source.poll(0.25);
      expect(Array.from(source.command)).toEqual([0, 0, 0]);
      source.dispose();
    },
  );
});

it('compiles a repeated workspace into both transports with the same iteration sources', () => {
  const plan = compile([
    '<block type="control_repeat" id="loop"><value name="TIMES"><shadow type="math_whole_number"><field name="NUM">2</field></shadow></value><statement name="SUBSTACK"><block type="control_wait" id="body"><value name="DURATION"><shadow type="math_positive_number"><field name="NUM">0.2</field></shadow></value></block></statement></block>',
  ]);
  const iframe = createMicroDuckSimulatorControlSource(plan);
  const native = createNativeProgram(plan);
  expect(iframe.errors).toEqual([]);
  expect(
    iframe.frames
      .filter((f) => f.sourceBlockId === 'body')
      .map((f) => f.iterations),
  ).toEqual(
    native.filter((s) => s.sourceBlockId === 'body').map((s) => s.iterations),
  );
  expect(
    native
      .filter((s) => s.sourceBlockId === 'body')
      .map((s) => s.iterations?.[0].iteration),
  ).toEqual([1, 2]);
});
