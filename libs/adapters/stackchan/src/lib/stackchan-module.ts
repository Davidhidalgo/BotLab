import type { RobotModule } from '@botlab/model';
import type { StackChanProgramStep } from './stackchan-steps';
import { stackChanBlockSet } from './stackchan-blocks';
import { createStackChanAdapter } from './stackchan';
import { readStackChanProgramFromWorkspace } from './stackchan-workspace';
import { stackChanCatalog } from './stackchan-catalog';

/**
 * StackChan robot module. Programs run as typed steps over Bluetooth
 * (`runStackChanProgram`), so the module has no runtime-plan compiler.
 */
export const stackChanRobotModule: RobotModule<StackChanProgramStep> = {
  id: 'stackchan',
  createAdapter: createStackChanAdapter,
  catalog: stackChanCatalog,
  blocks: stackChanBlockSet,
  blockTypes(capabilityIds) {
    return [
      ...(capabilityIds.includes('stackchan-yaw')
        ? ['botlab_stackchan_yaw', 'botlab_stackchan_center']
        : []),
      ...(capabilityIds.includes('stackchan-leds')
        ? ['botlab_stackchan_leds', 'botlab_stackchan_leds_off']
        : []),
    ];
  },
  readProgram: readStackChanProgramFromWorkspace,
};
