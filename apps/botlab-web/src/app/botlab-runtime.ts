import { createMicroDuckAdapter } from '@botlab/adapters-microduck';
import { createStackChanAdapter } from '@botlab/adapters-stackchan';
import {
  sampleArbitrationStrategies,
  sampleMicroDuckLedBehavior,
  samplePolicies,
  sampleSchedulers,
  sampleSkills,
} from '@botlab/model';
import { createBotLabRuntime, type BotLabRuntime } from '@botlab/runtime';
import { microDuckSimulatorIntegrations } from '@botlab/simulators-microduck';

/**
 * Composition root for the workbench: the only place that decides which
 * adapters, simulators, policies and dispatchers the web app runs with.
 */
export function createBotLabWorkbenchRuntime(): BotLabRuntime {
  return createBotLabRuntime({
    adapters: [createMicroDuckAdapter(), createStackChanAdapter()],
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
