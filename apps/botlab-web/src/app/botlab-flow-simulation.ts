import { createBotLabMessage, toBotLabMessage } from '@botlab/model';
import { botLabFlowSetup } from './botlab-flow-setup';

/** `simulation` region of the parallel BotLab flow machine. */
export const simulationRegion = botLabFlowSetup.createStateConfig({
  initial: 'idle',
  on: {
    'target.selected': {
      target: '.idle',
    },
    'workspace.changed': {
      target: '.stale',
      actions: [{ type: 'clearSimulationResult' }],
    },
    'build.compile': {
      target: '.stale',
      actions: [{ type: 'clearSimulationResult' }],
    },
  },
  states: {
    idle: {
      on: {
        'simulation.run': {
          guard: { type: 'hasCompiledArtifact' },
          target: 'simulating',
        },
      },
    },
    stale: {
      tags: ['dirty'],
      on: {
        'simulation.run': {
          guard: { type: 'hasCompiledArtifact' },
          target: 'simulating',
        },
      },
    },
    simulating: {
      tags: ['simulation-busy'],
      invoke: {
        src: 'simulatePlan',
        input: ({ context }) => ({
          artifact: context.compiledArtifact,
          target: context.runtime
            .listTargets()
            .find((target) => target.id === context.selectedTargetId),
        }),
        onDone: {
          target: 'passed',
          actions: [
            {
              type: 'setSimulationResult',
              params: ({ event }) => event.output,
            },
            {
              type: 'appendFlowLog',
              params: {
                category: 'simulation',
                message: createBotLabMessage(
                  'flow.log.simulation-completed',
                  'Simulation completed successfully.',
                ),
              },
            },
          ],
        },
        onError: {
          target: 'failed',
          actions: [
            {
              type: 'setSimulationError',
              params: ({ event }) => ({
                message: toBotLabMessage(
                  event.error,
                  'Unknown error in the demo flow.',
                ),
              }),
            },
            {
              type: 'appendFlowLog',
              params: {
                category: 'error',
                message: createBotLabMessage(
                  'flow.log.simulation-failed',
                  'Simulation failed.',
                ),
              },
            },
          ],
        },
      },
    },
    passed: {
      tags: ['simulation-ready'],
      on: {
        'simulation.run': {
          guard: { type: 'hasCompiledArtifact' },
          target: 'simulating',
        },
      },
    },
    failed: {
      tags: ['error'],
      on: {
        'simulation.run': {
          guard: { type: 'hasCompiledArtifact' },
          target: 'simulating',
        },
      },
    },
  },
});
