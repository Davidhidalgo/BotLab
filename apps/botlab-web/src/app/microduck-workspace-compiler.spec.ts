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
    'text/xml'
  );
  let previous = xml.documentElement.firstElementChild!;
  for (const text of blocks) {
    const block = xml.importNode(
      new DOMParser().parseFromString(text, 'text/xml').documentElement,
      true
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
        true
      )
    );
  return compileMicroDuckWorkspaceArtifact(
    {
      ...sampleScratchBlocksWorkspaceArtifact,
      content: new XMLSerializer().serializeToString(xml),
    },
    'microduck-sim'
  );
}

describe('sequential MicroDuck compilation', () => {
  it('compiles walk, wait, walk in connection order, with unique command IDs', () => {
    const artifact = compile([walk(2), wait('2.5'), walk(2)]);
    expect(artifact.commands.map(({ inputs }) => inputs)).toEqual([
      { leftPower: 1, rightPower: 1, durationMs: 1000, distanceMeters: 2 },
      { leftPower: 0, rightPower: 0, durationMs: 2500 },
      { leftPower: 1, rightPower: 1, durationMs: 1000, distanceMeters: 2 },
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

  it.each(['-1', 'NaN', 'Infinity', '', '2x', '1e309'])(
    'rejects invalid wait duration %s',
    (seconds) => {
      expect(() => compile([wait(seconds)])).toThrow('Wait duration must be');
    }
  );

  it('does not silently skip unsupported connected blocks or expressions', () => {
    expect(() => compile(['<block type="control_repeat"/>', walk(2)])).toThrow(
      'Unsupported connected block'
    );
    expect(() =>
      compile([
        '<block type="control_wait"><value name="DURATION"><block type="operator_add"/></value></block>',
      ])
    ).toThrow('Wait requires a numeric duration');
    expect(() => compile([])).toThrow('Connect at least one block');
    expect(() =>
      compile([walk(2)], '<block type="event_whenflagclicked"/>')
    ).toThrow('Use one green flag script');
  });

  it.each(['native', 'generated'])(
    'stops throughout the wait and resumes in the %s receiver',
    (receiver) => {
      const controlSource = createMicroDuckSimulatorControlSource(
        compile([walk(2), wait('2.5'), walk(2)])
      );
      expect(controlSource.errors).toEqual([]);
      const source =
        receiver === 'native'
          ? createMicroDuckBotLabOfficialSource({
              getVelocityLimits: () => [2, -1, 3],
            })
          : new (new Function(
              'window',
              createMicroDuckBotLabPostMessageSourceModule({
                allowedOrigins: ['http://localhost'],
              }).replace('export class BotLabSource', 'class BotLabSource') +
                '\nreturn BotLabSource;'
            )(new EventTarget()))({ getVelocityLimits: () => [2, -1, 3] });
      source.load(controlSource);
      source.poll(1);
      expect(source.command[0]).toBe(2);
      for (let i = 0; i < 5; i++) {
        source.poll(0.5);
        expect(Array.from(source.command)).toEqual([0, 0, 0]);
      }
      source.poll(1);
      expect(source.command[0]).toBe(2);
      source.poll(0.25);
      expect(Array.from(source.command)).toEqual([0, 0, 0]);
      source.dispose();
    }
  );
});
