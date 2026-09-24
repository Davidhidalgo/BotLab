import { validateRobotBlockSet, type RobotBlockSet } from './robot-blocks';

const set: RobotBlockSet = {
  messages: {
    schemaVersion: 1,
    namespace: 'test.robot',
    revision: '1',
    sourceLocale: 'en',
    messages: { move: 'move %1 m', help: 'Moves.', group: 'Group' },
    translations: { ca: { move: 'avança %1 m' } },
  },
  blocks: [
    {
      type: 'test_move',
      message: 'move',
      tooltip: 'help',
      shape: 'statement',
      style: 'motion',
      args: [
        {
          kind: 'number',
          name: 'DISTANCE',
          value: 1,
          min: 0,
          max: 5,
          precision: 1,
        },
        { kind: 'icon', name: 'ICON', icon: 'forward', alt: 'help' },
      ],
    },
  ],
  categories: [
    { name: { message: 'group' }, style: 'motion', blockTypes: ['test_move'] },
  ],
};

describe('validateRobotBlockSet', () => {
  it('accepts a consistent set and shared control blocks', () => {
    expect(validateRobotBlockSet(set, ['test_move', 'control_wait'])).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('reports unknown messages, blocks, placeholders and translations', () => {
    const broken: RobotBlockSet = {
      ...set,
      messages: {
        ...set.messages,
        translations: { ca: { move: 'avança' } },
      },
      blocks: [{ ...set.blocks[0], tooltip: 'missing', args: [] }],
      categories: [
        { name: { message: 'nope' }, style: 'motion', blockTypes: ['x'] },
      ],
    };
    expect(validateRobotBlockSet(broken, ['test_other']).errors).toEqual([
      'test_move: unknown message missing.',
      'test_move: message placeholders do not match arguments.',
      'Category: unknown message nope.',
      'Category: unknown block x.',
      'ca: invalid translation move.',
      'Executable block test_other has no definition.',
    ]);
  });
});
