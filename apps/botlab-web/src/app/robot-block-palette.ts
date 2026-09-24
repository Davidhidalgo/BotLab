import { microDuckRobotModule } from '@botlab/adapters-microduck';
import { stackChanRobotModule } from '@botlab/adapters-stackchan';
import { robotPaletteBlockTypes } from '@botlab/model';

/** Blocks with implemented execution for the selected robot, plus shared program structure.
 * Planned capabilities do not expose executable robot blocks.
 */
export function robotBlockPalette(
  simulator: boolean,
  capabilityIds: readonly string[],
): string[] {
  return robotPaletteBlockTypes(
    simulator ? microDuckRobotModule : stackChanRobotModule,
    capabilityIds,
  );
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
