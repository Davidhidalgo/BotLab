import type { RobotModule, StackChanProgramStep } from '@botlab/model';
import { createStackChanAdapter } from './stackchan';
import { readStackChanProgramFromWorkspace } from './stackchan-workspace';

/**
 * StackChan robot module. Programs run as typed steps over Bluetooth
 * (`runStackChanProgram`), so the module has no runtime-plan compiler.
 */
export const stackChanRobotModule: RobotModule<StackChanProgramStep> = {
  id: 'stackchan',
  createAdapter: createStackChanAdapter,
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
