import { installSimulationWorker } from '@botlab/simulators-mujoco/worker';
import { createWalkingController } from './controller';
installSimulationWorker(createWalkingController);
