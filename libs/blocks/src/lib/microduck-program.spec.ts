import { readMicroDuckProgramFromWorkspace } from './microduck-program';
import { sampleScratchBlocksWorkspaceArtifact } from './blocks-contract';

describe('MicroDuck posture parsing', () => {
  it('preserves explicit repeated postures and source IDs in connection order', () => {
    const steps = readMicroDuckProgramFromWorkspace({
      ...sampleScratchBlocksWorkspaceArtifact,
      content:
        '<xml><block type="event_whenflagclicked"><next><block type="botlab_microduck_stand" id="a"><next><block type="botlab_microduck_stand" id="b"><next><block type="botlab_microduck_sit" id="c"/></next></block></next></block></next></block><block type="botlab_microduck_sit" id="detached"/></xml>',
    });
    expect(steps).toEqual([
      { type: 'posture', posture: 'stand', sourceBlockId: 'a' },
      { type: 'posture', posture: 'stand', sourceBlockId: 'b' },
      { type: 'posture', posture: 'sit', sourceBlockId: 'c' },
    ]);
  });
  it('rejects unsupported connected skills instead of silently skipping them', () => {
    expect(() =>
      readMicroDuckProgramFromWorkspace({
        ...sampleScratchBlocksWorkspaceArtifact,
        content:
          '<xml><block type="event_whenflagclicked"><next><block type="botlab_microduck_kick"/></next></block></xml>',
      })
    ).toThrow('Unsupported connected block');
  });
});

describe('posture control flow', () => {
  const read = (body: string) => readMicroDuckProgramFromWorkspace({ ...sampleScratchBlocksWorkspaceArtifact, content: `<xml><block type="event_whenflagclicked"><next>${body}</next></block></xml>` });
  it('preserves nested branches and subsequent blocks without flattening them', () => {
    const steps = read('<block type="control_if_else" id="outer"><value name="CONDITION"><block type="botlab_microduck_is_sit" id="sensor"/></value><statement name="SUBSTACK"><block type="control_if" id="inner"><value name="CONDITION"><block type="botlab_microduck_is_transitioning"/></value></block></statement><statement name="SUBSTACK2"><block type="botlab_microduck_sit" id="else"/></statement><next><block type="botlab_microduck_stand" id="after"/></next></block>');
    expect(steps).toMatchObject([{ type: 'if', sourceBlockId: 'outer', condition: { posture: 'sit', sourceBlockId: 'sensor' }, then: [{ type: 'if', sourceBlockId: 'inner', condition: { posture: 'transitioning' }, then: [], else: [] }], else: [{ type: 'posture', posture: 'sit', sourceBlockId: 'else' }] }, { type: 'posture', sourceBlockId: 'after' }]);
  });
  it.each(['', '<block type="operator_equals"/>', '<block type="botlab_microduck_is_sit" disabled="true"/>'])('rejects missing or unsupported conditions: %s', (condition) => {
    expect(() => read(`<block type="control_if"><value name="CONDITION">${condition}</value></block>`)).toThrow('connected posture condition');
  });
  it('validates both branches before any execution', () => {
    expect(() => read('<block type="control_if_else"><value name="CONDITION"><block type="botlab_microduck_is_sit"/></value><statement name="SUBSTACK2"><block type="unsupported"/></statement></block>')).toThrow('Unsupported connected block');
  });
});

describe('repeat parsing', () => {
  const read = (value: string, body = '') => readMicroDuckProgramFromWorkspace({ ...sampleScratchBlocksWorkspaceArtifact, content: `<xml><block type="event_whenflagclicked"><next><block type="control_repeat" id="repeat"><value name="TIMES">${value}</value><statement name="SUBSTACK">${body}</statement></block></next></block></xml>` });
  const number = (text: string) => `<shadow type="math_whole_number"><field name="NUM">${text}</field></shadow>`;
  it('preserves a repeat node and its source block instead of copying XML', () => {
    expect(read(number('2'), '<block type="botlab_microduck_sit" id="sit"/>')).toEqual([{ type: 'repeat', count: 2, sourceBlockId: 'repeat', body: [{ type: 'posture', posture: 'sit', sourceBlockId: 'sit' }] }]);
  });
  it.each(['0', '100'])('accepts boundary count %s', count => expect(read(number(count))[0]).toMatchObject({ count: Number(count), body: [] }));
  it.each(['-1', '0.5', '101', '', 'NaN', 'Infinity'])('rejects invalid count %s', count => expect(() => read(number(count))).toThrow('whole number'));
  it('rejects a connected expression even when a valid shadow is present', () => expect(() => read(number('2') + '<block type="operator_add"/>')).toThrow('Expressions'));
  it('validates the body of a zero repeat', () => expect(() => read(number('0'), '<block type="unknown"/>')).toThrow('Unsupported connected block'));
});
