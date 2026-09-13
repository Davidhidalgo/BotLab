import { compileMicroDuckProgram } from './microduck-program';
import { nativeMicroDuckCapabilities } from './microduck-capabilities';

describe('native posture capability and lowering', () => {
  it('does not expose posture when only a configured or unrelated skill exists', () => {
    expect(nativeMicroDuckCapabilities(undefined, 'native')).toEqual([]);
    expect(
      nativeMicroDuckCapabilities(
        { skills: ['kick_left'], postures: ['sit', 'stand'] },
        'native'
      )
    ).toEqual([]);
    expect(
      nativeMicroDuckCapabilities(
        { skills: ['sit_toggle'], postures: [] },
        'native'
      )
    ).toEqual([]);
  });
  it('binds discovered posture commands to the connected target only', () => {
    const capabilities = nativeMicroDuckCapabilities(
      { skills: ['sit_toggle'], postures: ['sit', 'stand'] },
      'native'
    );
    expect(capabilities[0].targetIds).toEqual(['native']);
    expect(capabilities[0].schema?.commands[0]).toMatchObject({
      id: 'set-posture',
      inputs: [{ enumValues: ['sit', 'stand'] }],
    });
  });
  it('lowers explicit posture actions without converting them to toggles', () => {
    const plan = compileMicroDuckProgram(
      { behaviorId: 'posture' },
      [
        { type: 'posture', posture: 'stand', sourceBlockId: 'a' },
        { type: 'posture', posture: 'stand', sourceBlockId: 'b' },
        { type: 'posture', posture: 'sit', sourceBlockId: 'c' },
      ],
      'native'
    );
    expect(
      plan.commands
        .slice(0, 3)
        .map((c) => [c.commandId, c.inputs['posture'], c.sourceBlockId])
    ).toEqual([
      ['set-posture', 'stand', 'a'],
      ['set-posture', 'stand', 'b'],
      ['set-posture', 'sit', 'c'],
    ]);
  });
});

it('lowers branches with globally distinct command IDs and one final stop', () => {
  const compiled = compileMicroDuckProgram({ behaviorId: 'if' }, [{ type: 'if', sourceBlockId: 'if', condition: { type: 'posture', posture: 'sit', sourceBlockId: 'predicate' }, then: [{ type: 'posture', posture: 'stand' }], else: [{ type: 'posture', posture: 'sit' }] }], 'native');
  expect(compiled.commands).toHaveLength(2);
  expect(compiled.commands[0]).toMatchObject({ commandId: 'if-posture', sourceBlockId: 'if', inputs: { condition: { posture: 'sit', sourceBlockId: 'predicate' }, then: [{ id: 'command-microduck-posture-0-then-0', commandId: 'set-posture', targetId: 'native' }], else: [{ id: 'command-microduck-posture-0-else-0', commandId: 'set-posture' }] } });
  expect(compiled.commands[1].id).toBe('command-microduck-stop');
});
