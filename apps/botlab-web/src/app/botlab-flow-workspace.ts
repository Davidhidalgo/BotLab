import { createBotLabMessage, toBotLabMessage } from '@botlab/model';
import { botLabFlowSetup } from './botlab-flow-setup';

/** `workspace` region of the parallel BotLab flow machine. */
export const workspaceRegion = botLabFlowSetup.createStateConfig({
  initial: 'loaded',
  states: {
    loaded: {
      tags: ['workspace-ready'],
      on: {
        'workspace.changed': {
          target: 'dirty',
          actions: [
            {
              type: 'setWorkspaceArtifact',
              params: ({ event }) => ({ artifact: event.artifact }),
            },
            {
              type: 'appendFlowLog',
              params: {
                category: 'workspace',
                message: createBotLabMessage(
                  'flow.log.workspace-edited-recompile',
                  'Workspace edited. The plan must be recompiled.',
                ),
              },
            },
          ],
        },
        'workspace.validate': {
          target: 'validating',
        },
      },
    },
    dirty: {
      tags: ['dirty'],
      on: {
        'workspace.changed': {
          actions: [
            {
              type: 'setWorkspaceArtifact',
              params: ({ event }) => ({ artifact: event.artifact }),
            },
            {
              type: 'appendFlowLog',
              params: {
                category: 'workspace',
                message: createBotLabMessage(
                  'flow.log.workspace-edited',
                  'Workspace edited.',
                ),
              },
            },
          ],
        },
        'workspace.validate': {
          target: 'validating',
        },
      },
    },
    validating: {
      tags: ['workspace-busy'],
      invoke: {
        src: 'validateWorkspace',
        input: ({ context }) => ({
          artifact: context.workspaceArtifact,
        }),
        onDone: [
          {
            guard: {
              type: 'workspaceIsValid',
              params: ({ event }) => event.output.validation,
            },
            target: 'valid',
            actions: [
              {
                type: 'setWorkspaceValidation',
                params: ({ event }) => event.output,
              },
              {
                type: 'appendFlowLog',
                params: {
                  category: 'workspace',
                  message: createBotLabMessage(
                    'flow.log.workspace-validated',
                    'Workspace validated successfully.',
                  ),
                },
              },
            ],
          },
          {
            target: 'invalid',
            actions: [
              {
                type: 'setWorkspaceValidation',
                params: ({ event }) => event.output,
              },
              {
                type: 'appendFlowLog',
                params: {
                  category: 'error',
                  message: createBotLabMessage(
                    'flow.log.workspace-invalid',
                    'Workspace invalid.',
                  ),
                },
              },
            ],
          },
        ],
        onError: {
          target: 'invalid',
          actions: [
            {
              type: 'setError',
              params: ({ event }) => ({
                message: toBotLabMessage(
                  event.error,
                  'Unknown error in the demo flow.',
                ),
              }),
            },
          ],
        },
      },
    },
    valid: {
      tags: ['workspace-ready'],
      on: {
        'workspace.changed': {
          target: 'dirty',
          actions: [
            {
              type: 'setWorkspaceArtifact',
              params: ({ event }) => ({ artifact: event.artifact }),
            },
            {
              type: 'appendFlowLog',
              params: {
                category: 'workspace',
                message: createBotLabMessage(
                  'flow.log.workspace-edited-after-validation',
                  'Workspace edited after validation.',
                ),
              },
            },
          ],
        },
        'workspace.validate': {
          target: 'validating',
        },
      },
    },
    invalid: {
      tags: ['error'],
      on: {
        'workspace.changed': {
          target: 'dirty',
          actions: [
            {
              type: 'setWorkspaceArtifact',
              params: ({ event }) => ({ artifact: event.artifact }),
            },
            {
              type: 'appendFlowLog',
              params: {
                category: 'workspace',
                message: createBotLabMessage(
                  'flow.log.workspace-fixed',
                  'Workspace fixed; validate again.',
                ),
              },
            },
          ],
        },
        'workspace.validate': {
          target: 'validating',
        },
      },
    },
  },
});
