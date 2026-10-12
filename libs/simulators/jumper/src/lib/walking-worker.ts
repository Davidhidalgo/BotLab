import { installSimulationWorker } from '@botlab/simulators-mujoco/worker';
import { createJumperWalkingController } from './walking-controller';
installSimulationWorker(createJumperWalkingController);
