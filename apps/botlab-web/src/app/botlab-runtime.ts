import { microDuckRobotModule } from '@botlab/adapters-microduck';
import { stackChanRobotModule } from '@botlab/adapters-stackchan';
import {
  compileRobotWorkspace,
  sampleArbitrationStrategies,
  sampleMicroDuckLedBehavior,
  samplePolicies,
  sampleSchedulers,
  sampleSkills,
  type CompiledBehaviorArtifact,
  type RobotProgramSource,
} from '@botlab/model';
import { createBotLabRuntime, type BotLabRuntime } from '@botlab/runtime';
import { microDuckSimulatorIntegrations } from '@botlab/simulators-microduck';

/** Robot modules registered in the workbench; order sets the adapter order. */
export const workbenchRobotModules = [
  microDuckRobotModule,
  stackChanRobotModule,
] as const;

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
