import type { CompilingRobotModule, MicroDuckProgramStep } from '@botlab/model';
import { createMicroDuckAdapter } from './microduck';
import { compileMicroDuckProgram } from './microduck-program';
import { readMicroDuckProgramFromWorkspace } from './microduck-workspace';

const motionBlockTypes = [
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
].map((type) => `botlab_microduck_${type}`);

/** MicroDuck robot module: adapter metadata, executable blocks, reader and compiler. */
export const microDuckRobotModule: CompilingRobotModule<MicroDuckProgramStep> =
  {
    id: 'microduck',
    createAdapter: createMicroDuckAdapter,
    blockTypes(capabilityIds) {
      const blocks: string[] = [];
      if (capabilityIds.includes('microduck-motion'))
        // Posture conditions make branching meaningful only with motion.
        blocks.push(...motionBlockTypes, 'control_if', 'control_if_else');
      if (capabilityIds.includes('microduck-leds'))
        blocks.push('botlab_microduck_set_leds');
      return blocks;
    },
    readProgram: readMicroDuckProgramFromWorkspace,
    compile: compileMicroDuckProgram,
  };
