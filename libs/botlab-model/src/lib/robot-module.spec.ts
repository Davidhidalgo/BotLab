import type { RobotBlockSet } from './robot-blocks';
import { robotPaletteBlockTypes } from './robot-module';

const blocks = (
  shapes: Record<string, 'statement' | 'boolean'>,
): RobotBlockSet => ({
  messages: {
    schemaVersion: 1,
    namespace: 'test.robot',
    revision: '1',
    sourceLocale: 'en',
    messages: { text: 'text' },
    translations: {},
  },
  blocks: Object.entries(shapes).map(([type, shape]) => ({
    type,
    shape,
    message: 'text',
    tooltip: 'text',
    style: 'motion',
  })),
  categories: [],
});

describe('robotPaletteBlockTypes', () => {
  const module = {
    blocks: blocks({ test_move: 'statement', test_is_near: 'boolean' }),
    blockTypes: (capabilities: readonly string[]) =>
      capabilities.includes('sensor')
        ? ['test_move', 'test_is_near']
        : ['test_move'],
  };

  it('adds conditionals when an executable condition is available', () => {
    expect(robotPaletteBlockTypes(module, ['sensor'])).toEqual([
      'event_whenflagclicked',
      'control_wait',
      'control_repeat',
      'test_move',
      'test_is_near',
      'control_if',
      'control_if_else',
    ]);
  });

  it('keeps only shared structure and actions without conditions', () => {
    expect(robotPaletteBlockTypes(module, [])).toEqual([
      'event_whenflagclicked',
      'control_wait',
      'control_repeat',
      'test_move',
    ]);
  });
});
