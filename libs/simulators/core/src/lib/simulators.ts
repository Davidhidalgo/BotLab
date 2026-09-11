import type { SimulatorIntegration } from '@botlab/model';

export type BotLabSimulatorIntegration = SimulatorIntegration;

export function defineSimulatorIntegration(
  integration: SimulatorIntegration
): SimulatorIntegration {
  return integration;
}

export function defineSimulatorIntegrations(
  integrations: SimulatorIntegration[]
): SimulatorIntegration[] {
  return integrations;
}
