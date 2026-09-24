// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readStackChanProgramFromWorkspace } from './stackchan-workspace';

const scratchWorkspace = { format: 'scratch-xml' as const, content: '' };
const parse = (body: string) =>
  readStackChanProgramFromWorkspace({
    ...scratchWorkspace,
    content: `<xml><block type="event_whenflagclicked" id="start"><next>${body}</next></block></xml>`,
  });
const yaw =
  '<block type="botlab_stackchan_yaw" id="yaw"><field name="ANGLE">10</field></block>';
describe('StackChan Scratch programs', () => {
  it('reads yaw and side LED fields preserving source IDs', () => {
    expect(parse(yaw)).toEqual([
      { type: 'yaw', degrees: 10, sourceBlockId: 'yaw' },
    ]);
    expect(
      parse(
        '<block type="botlab_stackchan_leds" id="led"><field name="SIDE">right</field><field name="COLOR">#00ff00</field><field name="BRIGHTNESS">15</field></block>',
      ),
    ).toEqual([
      {
        type: 'led',
        side: 'right',
        color: '#00ff00',
        brightness: 15,
        sourceBlockId: 'led',
      },
    ]);
  });
  it('expands bounded literal repeats and skips explicitly disabled actions', () => {
    const repeat = (count: string, body: string) =>
      `<block type="control_repeat" id="repeat"><value name="TIMES"><shadow type="math_whole_number"><field name="NUM">${count}</field></shadow></value><statement name="SUBSTACK">${body}</statement></block>`;
    expect(parse(repeat('2', yaw))).toHaveLength(2);
    expect(parse(yaw.replace('id="yaw"', 'id="yaw" disabled="true"'))).toEqual(
      [],
    );
    expect(() => parse(repeat('11', yaw))).toThrow();
    expect(() => parse(repeat('10', repeat('10', yaw)))).toThrow('40');
    expect(() =>
      parse(
        repeat('2', yaw)
          .replace('<shadow', '<block')
          .replace('</shadow>', '</block>'),
      ),
    ).toThrow();
  });
  it('rejects unsupported, malformed and multiple start scripts', () => {
    expect(() =>
      parse('<block type="botlab_microduck_walk_steps" id="walk"/>'),
    ).toThrow('incompatible');
    expect(() => parse('<bad')).toThrow();
    expect(() =>
      readStackChanProgramFromWorkspace({
        ...scratchWorkspace,
        content:
          '<xml><block type="event_whenflagclicked"/><block type="event_whenflagclicked"/></xml>',
      }),
    ).toThrow('exactly one');
  });
});
