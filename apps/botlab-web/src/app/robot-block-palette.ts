import { microDuckRobotModule } from '@botlab/adapters-microduck';
import { stackChanRobotModule } from '@botlab/adapters-stackchan';

/** Blocks with implemented simulator execution, plus robot-independent program structure.
 * Planned capabilities do not expose executable robot blocks.
 */
export function robotBlockPalette(
  simulator: boolean,
  capabilityIds: readonly string[],
): string[] {
  const common = ['event_whenflagclicked', 'control_wait', 'control_repeat'];
  const module = simulator ? microDuckRobotModule : stackChanRobotModule;
  return [...common, ...module.blockTypes(capabilityIds)];
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
