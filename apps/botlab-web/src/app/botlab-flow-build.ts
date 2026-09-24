import { createBotLabMessage, toBotLabMessage } from '@botlab/model';
import { botLabFlowSetup } from './botlab-flow-setup';

/** `build` region of the parallel BotLab flow machine. */
export const buildRegion = botLabFlowSetup.createStateConfig({
  initial: 'draft',
  on: {
    'target.selected': {
      target: '.stale',
      actions: [
        {
          type: 'selectTarget',
          params: ({ event }) => ({ targetId: event.targetId }),
        },
        {
          type: 'appendFlowLog',
          params: ({ event }) => ({
            category: 'target',
            message: createBotLabMessage(
              'flow.log.target-selected',
              `Target selected: ${event.targetId}.`,
              { target: event.targetId },
            ),
          }),
        },
      ],
    },
    'workspace.changed': {
      target: '.stale',
      actions: [
        { type: 'clearCompiledArtifact' },
        { type: 'clearSimulationResult' },
      ],
    },
  },
  states: {
    draft: {
      on: {
        'build.compile': {
          guard: { type: 'buildCanCompile' },
          target: 'compiling',
        },
      },
    },
    stale: {
      tags: ['dirty'],
      on: {
        'build.compile': {
          guard: { type: 'buildCanCompile' },
          target: 'compiling',
        },
      },
    },
    compiling: {
      tags: ['build-busy'],
      invoke: {
        src: 'compileWorkspace',
        input: ({ context }) => ({
          runtime: context.runtime,
          demoSessionId: context.demoSessionId,
          artifact: context.workspaceArtifact,
          targetId: context.selectedTargetId,
        }),
        onDone: {
          target: 'compiled',
          actions: [
            {
              type: 'setCompiledArtifact',
              params: ({ event }) => event.output,
            },
            {
              type: 'appendFlowLog',
              params: {
                category: 'build',
                message: createBotLabMessage(
                  'flow.log.plan-compiled',
                  'Plan compiled for MicroDuck.',
                ),
              },
            },
          ],
        },
        onError: {
          target: 'failed',
          actions: [
            {
              type: 'setBuildError',
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
                  'flow.log.compilation-failed',
                  'Compilation failed.',
                ),
              },
            },
          ],
        },
      },
    },
    compiled: {
      tags: ['build-ready'],
      on: {
        'build.compile': {
          guard: { type: 'buildCanCompile' },
          target: 'compiling',
        },
      },
    },
    failed: {
      tags: ['error'],
      on: {
        'build.compile': {
          guard: { type: 'buildCanCompile' },
          target: 'compiling',
        },
      },
    },
  },
});
