import { describe, it, expect } from 'vitest';
import { jumperJointExample, readJumperJointProgram } from './jumper-blocks';
import {
  microduckWalkingExample,
  readMicroduckWalkingProgram,
  readJumperWalkingProgram,
} from './microduck-mujoco-blocks';
describe('MuJoCo blocks', () => {
  it('reads both Jumper turn directions while retaining the MicroDuck restriction', () => {
    const right = {
      ...microduckWalkingExample,
      content: microduckWalkingExample.content.replace(
        'botlab_microduck_turn_left',
        'botlab_microduck_turn_right',
      ),
    };
    expect(readJumperWalkingProgram(right)[1]).toMatchObject({
      kind: 'turn',
      angleRadians: -Math.PI / 2,
    });
    expect(readJumperWalkingProgram(microduckWalkingExample)[1]).toMatchObject({
      kind: 'turn',
      angleRadians: Math.PI / 2,
    });
    expect(() => readMicroduckWalkingProgram(right)).toThrow(/compatible/);
  });
  it('parses example programs without changing units', () => {
    expect(
      readJumperJointProgram(jumperJointExample).map((s) => s.positionRadians),
    ).toEqual([0.2, 0.0012]);
    expect(readMicroduckWalkingProgram(microduckWalkingExample)).toEqual([
      { sourceBlockId: 'walk', kind: 'distance', distanceMeters: 0.5 },
      { sourceBlockId: 'turn', kind: 'turn', angleRadians: Math.PI / 2 },
      { sourceBlockId: 'wait', kind: 'wait', durationSeconds: 1 },
    ]);
  });
  it('rejects disabled entry points, unsupported nested blocks and disconnected scripts', () => {
    for (const [example, read] of [
      [jumperJointExample, readJumperJointProgram],
      [microduckWalkingExample, readMicroduckWalkingProgram],
    ] as const) {
      expect(() =>
        read({
          ...example,
          content: example.content.replace(
            '<block type="event_whenflagclicked"',
            '<block disabled="true" type="event_whenflagclicked"',
          ),
        }),
      ).toThrow();
      expect(() =>
        read({
          ...example,
          content: example.content.replace(
            '</xml>',
            '<block type="event_whenflagclicked"/></xml>',
          ),
        }),
      ).toThrow();
      expect(() =>
        read({
          ...example,
          content: example.content.replace(
            '</xml>',
            '<value name="hidden"/></xml>',
          ),
        }),
      ).toThrow();
    }
  });
});

it('preserves old timed velocity projects and rejects hidden wait expressions', () => {
  const content =
    '<xml><block type="event_whenflagclicked"><next><block type="botlab_web_velocity" id="v"><field name="FORWARD">0.24</field><field name="YAW">0</field><field name="SECONDS">3</field></block></next></block></xml>';
  expect(
    readMicroduckWalkingProgram({ ...microduckWalkingExample, content }),
  ).toEqual([
    { sourceBlockId: 'v', forward: 0.24, yaw: 0, durationSeconds: 3 },
  ]);
  expect(() =>
    readMicroduckWalkingProgram({
      ...microduckWalkingExample,
      content: microduckWalkingExample.content.replace(
        'math_positive_number',
        'operator_add',
      ),
    }),
  ).toThrow();
});

const loop = (count: string, body = '', id = 'repeat') =>
  `<block type="control_repeat" id="${id}"><value name="TIMES"><shadow type="math_whole_number"><field name="NUM">${count}</field></shadow></value><statement name="SUBSTACK">${body}</statement></block>`;
const readLoop = (body: string) =>
  readMicroduckWalkingProgram({
    ...microduckWalkingExample,
    content: `<xml><block type="event_whenflagclicked" id="start"><next>${body}</next></block></xml>`,
  });
const walk =
  '<block type="botlab_microduck_walk_steps" id="walk"><field name="STEPS">1</field></block>';

it('reads literal nested repeats, zero counts and empty bodies as structured source', () => {
  expect(readLoop(loop('3', loop('2', walk, 'inner')))).toEqual([
    {
      sourceBlockId: 'repeat',
      kind: 'repeat',
      count: 3,
      body: [
        {
          sourceBlockId: 'inner',
          kind: 'repeat',
          count: 2,
          body: [
            { sourceBlockId: 'walk', kind: 'distance', distanceMeters: 0.5 },
          ],
        },
      ],
    },
  ]);
  expect(readLoop(loop('0'))[0]).toMatchObject({ count: 0, body: [] });
  expect(
    readLoop(
      loop('2').replace('<statement name="SUBSTACK"></statement>', ''),
    )[0],
  ).toMatchObject({ count: 2, body: [] });
});

it('rejects invalid counts, expressions, hidden structures and deep zero-count bodies', () => {
  for (const count of ['-1', '1.5', '101', 'NaN', 'Infinity', ''])
    expect(() => readLoop(loop(count))).toThrow();
  for (const xml of [
    loop('0', walk.replace('botlab_microduck_walk_steps', 'control_forever')),
    loop('2', walk).replace('math_whole_number', 'operator_add'),
    loop('2', walk).replace('name="SUBSTACK"', 'name="UNKNOWN"'),
    loop('2', walk).replace('</statement>', `${walk}</statement>`),
    loop('2', walk).replace(
      '</statement>',
      '</statement><statement name="SUBSTACK"/>',
    ),
    loop('2', walk).replace('<shadow', '<shadow disabled="true"'),
    walk.replace(
      '</block>',
      `<statement name="SUBSTACK">${walk}</statement></block>`,
    ),
  ])
    expect(() => readLoop(xml)).toThrow();
  let nested = walk;
  for (let i = 0; i < 17; i++) nested = loop('0', nested, `r-${i}`);
  expect(() => readLoop(nested)).toThrow(/16 niveles/);
});

describe('shared proximity blocks', () => {
  const sensor =
    '<value name="CONDITION"><block type="botlab_web_obstacle" id="sensor"><field name="CM">30</field></block></value>';
  const advance =
    '<block type="botlab_web_advance_cm" id="advance"><field name="CM">15</field></block>';
  const make = (body: string) => ({
    ...microduckWalkingExample,
    content: `<xml><block type="event_whenflagclicked" id="start"><next>${body}</next></block></xml>`,
  });
  it('reads the same condition and centimetre advance for either robot', () => {
    const a = make(
      `<block type="control_repeat_until" id="loop">${sensor}<statement name="SUBSTACK">${advance}</statement></block>`,
    );
    for (const read of [readMicroduckWalkingProgram, readJumperWalkingProgram])
      expect(read(a)).toEqual([
        {
          sourceBlockId: 'loop',
          kind: 'until',
          condition: { sourceBlockId: 'sensor', thresholdMeters: 0.3 },
          body: [
            {
              sourceBlockId: 'advance',
              kind: 'distance',
              distanceMeters: 0.15,
            },
          ],
        },
      ]);
  });
  it('keeps both branches for validation and rejects missing or malformed conditions', () => {
    const a = make(
      `<block type="control_if_else" id="choice">${sensor}<statement name="SUBSTACK">${advance}</statement><statement name="SUBSTACK2">${advance.replace('id="advance"', 'id="other"')}</statement></block>`,
    );
    expect(readMicroduckWalkingProgram(a)[0]).toMatchObject({
      kind: 'if',
      otherwise: [{ sourceBlockId: 'other', distanceMeters: 0.15 }],
    });
    for (const bad of [
      sensor.replace('botlab_web_obstacle', 'math_number'),
      sensor.replace('id="sensor"', 'id="sensor" disabled="true"'),
      '',
    ])
      expect(() =>
        readMicroduckWalkingProgram(
          make(`<block type="control_repeat_until" id="loop">${bad}</block>`),
        ),
      ).toThrow('condición');
  });
});

it('reads connected numeric expressions over fallback shadows for both robots', () => {
  const content =
    '<xml><block type="event_whenflagclicked" id="flag"><next><block type="botlab_web_advance_value" id="move"><value name="CM"><shadow type="math_number"><field name="NUM">10</field></shadow><block type="operator_add" id="sum"><value name="NUM1"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="NUM2"><block type="botlab_web_number" id="v"><field name="NAME">extra</field></block></value></block></value></block></next></block></xml>';
  for (const read of [readMicroduckWalkingProgram, readJumperWalkingProgram]) {
    expect(read({ ...microduckWalkingExample, content })).toEqual([
      {
        sourceBlockId: 'move',
        kind: 'distance-value',
        expression: {
          kind: 'add',
          left: { kind: 'literal', value: 10 },
          right: { kind: 'variable', name: 'extra' },
        },
      },
    ]);
    expect(() =>
      read({
        ...microduckWalkingExample,
        content: content.replace('name="NUM1"', 'name="NUM2"'),
      }),
    ).toThrow();
  }
});

it('allows verified skills only in the MicroDuck walking palette', () => {
  for (const type of [
    'botlab_microduck_kick_left',
    'botlab_microduck_kick_right',
    'botlab_web_ground_pick',
  ]) {
    const artifact = {
      ...microduckWalkingExample,
      content: `<xml><block type="event_whenflagclicked" id="start"><next><block type="${type}" id="skill"/></next></block></xml>`,
    };
    expect(readMicroduckWalkingProgram(artifact)[0]).toMatchObject({
      kind: 'skill',
    });
    expect(() => readJumperWalkingProgram(artifact)).toThrow(/compatible/);
  }
});

it('offers the fixed jump only for Jumper', () => {
  const artifact = {
    ...microduckWalkingExample,
    content:
      '<xml><block type="event_whenflagclicked" id="start"><next><block type="botlab_jumper_jump" id="jump"/></next></block></xml>',
  };
  expect(readJumperWalkingProgram(artifact)).toEqual([
    { sourceBlockId: 'jump', kind: 'skill', skill: 'jump' },
  ]);
  expect(() => readMicroduckWalkingProgram(artifact)).toThrow(/compatible/);
});

it('keeps body tilt distinct from head orientation and robot capability', () => {
  for (const [direction, angle] of [
    ['level', 0],
    ['back', -0.1],
  ] as const) {
    const artifact = {
      ...microduckWalkingExample,
      content: `<xml><block type="event_whenflagclicked" id="start"><next><block type="botlab_web_body_pitch" id="tilt"><field name="DIRECTION">${direction}</field></block></next></block></xml>`,
    };
    expect(readJumperWalkingProgram(artifact)).toEqual([
      { sourceBlockId: 'tilt', kind: 'body-pitch', angleRadians: angle },
    ]);
    expect(() => readMicroduckWalkingProgram(artifact)).toThrow(/compatible/);
  }
});

it('keeps gestures and dances exclusive to Jumper and rejects mismatched selections', () => {
  for (const skill of [
    'gesture-hello',
    'gesture-bow',
    'gesture-paw',
    'gesture-salute',
    'dance-brazilian',
    'dance-crab',
    'dance-maze',
    'dance-dream-wings',
  ]) {
    const doc = {
      ...microduckWalkingExample,
      content: `<xml><block type="event_whenflagclicked" id="start"><next><block type="botlab_jumper_${skill.split('-')[0]}" id="skill"><field name="SKILL">${skill}</field></block></next></block></xml>`,
    };
    expect(readJumperWalkingProgram(doc)).toEqual([
      { sourceBlockId: 'skill', kind: 'skill', skill },
    ]);
    expect(() => readMicroduckWalkingProgram(doc)).toThrow(/compatible/);
    expect(() =>
      readJumperWalkingProgram({
        ...doc,
        content: doc.content.replace(`>${skill}<`, '>jump<'),
      }),
    ).toThrow();
  }
});
