import { hasUnavailableBlocks, robotBlockPalette } from './robot-block-palette';

describe('robot block palette', () => {
  it('keeps only common program structure for a robot without executable block capabilities', () => {
    expect(
      robotBlockPalette(false, ['stackchan-expression', 'stackchan-sound']),
    ).toEqual(['event_whenflagclicked', 'control_wait', 'control_repeat']);
  });
  it('requires the matching capability and an implemented simulator route', () => {
    expect(robotBlockPalette(true, ['microduck-leds'])).toContain(
      'botlab_microduck_set_leds',
    );
    expect(robotBlockPalette(true, ['microduck-leds'])).not.toContain(
      'botlab_microduck_walk_distance',
    );
    expect(robotBlockPalette(true, ['microduck-motion'])).toContain(
      'botlab_microduck_walk_distance',
    );
    expect(robotBlockPalette(false, ['microduck-motion'])).not.toContain(
      'botlab_microduck_walk_distance',
    );
  });
  it('detects preserved incompatible blocks, including nested ones, without treating numeric shadows as commands', () => {
    const allowed = robotBlockPalette(false, []);
    expect(
      hasUnavailableBlocks(
        '<xml><block type="control_wait"><value><shadow type="math_positive_number"/></value></block></xml>',
        allowed,
      ),
    ).toBe(false);
    expect(
      hasUnavailableBlocks(
        '<xml><block type="event_whenflagclicked"><next><block type="botlab_microduck_walk_distance"/></next></block></xml>',
        allowed,
      ),
    ).toBe(true);
  });
});

it('exposes only implemented StackChan movement and LED blocks', () => {
  expect(
    robotBlockPalette(false, [
      'stackchan-yaw',
      'stackchan-leds',
      'stackchan-sound',
    ]),
  ).toEqual([
    'event_whenflagclicked',
    'control_wait',
    'control_repeat',
    'botlab_stackchan_yaw',
    'botlab_stackchan_center',
    'botlab_stackchan_leds',
    'botlab_stackchan_leds_off',
  ]);
});
