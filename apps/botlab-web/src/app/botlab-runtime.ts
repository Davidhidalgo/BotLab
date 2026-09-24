import { microDuckRobotModule } from '@botlab/adapters-microduck';
import { createStackChanAdapter } from '@botlab/adapters-stackchan';
import {
  compileRobotWorkspace,
  sampleArbitrationStrategies,
  sampleMicroDuckLedBehavior,
  samplePolicies,
  sampleSchedulers,
  sampleSkills,
  type CompiledBehaviorArtifact,
  type RobotModule,
  type RobotProgramSource,
} from '@botlab/model';
import { createBotLabRuntime, type BotLabRuntime } from '@botlab/runtime';
import { microDuckSimulatorIntegrations } from '@botlab/simulators-microduck';

/** Robot modules the workbench compiles for; StackChan still uses its panel-specific path. */
export const workbenchRobotModules: readonly RobotModule[] = [
  microDuckRobotModule as RobotModule,
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
    adapters: [
      ...workbenchRobotModules.map((module) => module.createAdapter()),
      createStackChanAdapter(),
    ],
    simulators: microDuckSimulatorIntegrations,
    behaviors: [sampleMicroDuckLedBehavior],
    skills: sampleSkills,
    schedulers: sampleSchedulers,
    arbitrationStrategies: sampleArbitrationStrategies,
    policies: samplePolicies.map((policy) => ({
      ...policy,
      rules: policy.rules.map((rule) =>
        rule.effect === 'require-confirmation'
          ? { ...rule, targetIds: ['microduck-usb'] }
          : rule,
      ),
    })),
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
