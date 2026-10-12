import type { BotLabAdapter } from '@botlab/model';
import {
  jumperJointExample,
  jumperWalkingExample,
  microduckWalkingExample,
  jumperJointBlockTypes,
  microduckWalkingBlockTypes,
  jumperWalkingBlockTypes,
} from '@botlab/blocks';

export const mujocoTargets = {
  'jumper-web-joint-probe': {
    robot: 'jumper',
    name: 'Jumper · articulaciones',
    example: jumperJointExample,
    blocks: jumperJointBlockTypes,
  },
  'jumper-web-walking': {
    robot: 'jumper-walking',
    name: 'Jumper · marcha',
    example: jumperWalkingExample,
    blocks: jumperWalkingBlockTypes,
  },
  'microduck-mujoco-web': {
    robot: 'microduck',
    name: 'MicroDuck · marcha',
    example: microduckWalkingExample,
    blocks: microduckWalkingBlockTypes,
  },
} as const;
export type MujocoTargetId = keyof typeof mujocoTargets;
export type MujocoRobot = (typeof mujocoTargets)[MujocoTargetId]['robot'];
export function isMujocoTarget(id: string): id is MujocoTargetId {
  return Object.prototype.hasOwnProperty.call(mujocoTargets, id);
}

// Discovery only. Executable capabilities are negotiated by the loaded panel.
export const mujocoCatalogAdapter: BotLabAdapter = {
  id: 'mujoco-web',
  name: 'MuJoCo web',
  status: 'available',
  capabilities: [],
  targets: Object.entries(mujocoTargets).map(([id, target]) => ({
    id,
    name: target.name,
    adapterId: 'mujoco-web',
    kind: 'simulator',
    status: 'available',
  })),
};
