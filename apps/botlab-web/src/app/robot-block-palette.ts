/** Blocks with implemented simulator execution, plus robot-independent program structure.
 * Planned capabilities do not expose executable robot blocks.
 */
export function robotBlockPalette(
  simulator: boolean,
  capabilityIds: readonly string[],
): string[] {
  const common = ['event_whenflagclicked', 'control_wait', 'control_repeat'];
  if (!simulator)
    return [
      ...common,
      ...(capabilityIds.includes('stackchan-yaw')
        ? ['botlab_stackchan_yaw', 'botlab_stackchan_center']
        : []),
      ...(capabilityIds.includes('stackchan-leds')
        ? ['botlab_stackchan_leds', 'botlab_stackchan_leds_off']
        : []),
    ];
  const blocks = [...common];
  if (capabilityIds.includes('microduck-motion')) {
    blocks.push(
      ...[
        'walk_steps',
        'back_steps',
        'turn_left',
        'turn_right',
        'turn_around',
        'walk_distance',
        'back_distance',
        'turn_degrees',
        'sit',
        'stand',
        'is_sit',
        'is_stand',
        'is_transitioning',
      ].map((type) => `botlab_microduck_${type}`),
      'control_if',
      'control_if_else',
    );
  }
  if (capabilityIds.includes('microduck-leds'))
    blocks.push('botlab_microduck_set_leds');
  return blocks;
}

export function hasUnavailableBlocks(
  xml: string,
  available: readonly string[],
): boolean {
  const document = new DOMParser().parseFromString(xml, 'text/xml');
  return Array.from(document.querySelectorAll('block')).some(
    (block) => !available.includes(block.getAttribute('type') ?? ''),
  );
}
