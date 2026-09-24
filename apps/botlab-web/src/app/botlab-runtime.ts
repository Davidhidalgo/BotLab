import { microDuckRobotModule } from '@botlab/adapters-microduck';
import { stackChanRobotModule } from '@botlab/adapters-stackchan';
import {
  compileRobotWorkspace,
  type ArbitrationStrategy,
  type CompiledBehaviorArtifact,
  type RobotProgramSource,
  type SchedulerProfile,
} from '@botlab/model';
import { createBotLabRuntime, type BotLabRuntime } from '@botlab/runtime';
import { microDuckSimulatorIntegrations } from '@botlab/simulators-microduck';

/** Robot modules registered in the workbench; order sets the adapter order. */
export const workbenchRobotModules = [
  microDuckRobotModule,
  stackChanRobotModule,
] as const;

/** Editor blocks of every registered robot, in toolbox order. */
export const workbenchBlockSets = workbenchRobotModules.map(
  (module) => module.blocks,
);

const workbenchSchedulers: SchedulerProfile[] = [
  { id: 'manual', name: 'Manual start', mode: 'manual' },
];

const workbenchArbitrationStrategies: ArbitrationStrategy[] = [
  {
    id: 'exclusive-led-lock',
    name: 'Exclusive capability lock',
    strategy: 'exclusive-lock',
  },
];

export function compileMicroDuckWorkspaceArtifact(
  source: RobotProgramSource,
  targetId: string,
): CompiledBehaviorArtifact {
  return compileRobotWorkspace(microDuckRobotModule, source, targetId);
}

/**
 * Composition root for the workbench: the only place that decides which
 * adapters, simulators, policies and dispatchers the web app runs with.
 */
export function createBotLabWorkbenchRuntime(): BotLabRuntime {
  return createBotLabRuntime({
    adapters: workbenchRobotModules.map((module) => module.createAdapter()),
    simulators: microDuckSimulatorIntegrations,
    behaviors: workbenchRobotModules.flatMap((module) => [
      ...module.catalog.behaviors,
    ]),
    skills: workbenchRobotModules.flatMap((module) => [
      ...module.catalog.skills,
    ]),
    policies: workbenchRobotModules.flatMap((module) => [
      ...module.catalog.policies,
    ]),
    schedulers: workbenchSchedulers,
    arbitrationStrategies: workbenchArbitrationStrategies,
    dispatchers: [
      {
        targetId: 'microduck-sim',
        async dispatch(command) {
          await new Promise((resolve) => {
            globalThis.setTimeout(resolve, 120);
          });

          return {
            commandId: command.id,
            status: 'dispatched',
            message: `Simulated dispatch ${command.commandId}.`,
          };
        },
      },
    ],
  });
}
