import { assign, fromPromise, setup, waitFor, type ActorRefFrom } from 'xstate';
import type { CompiledBehaviorArtifact } from '@botlab/model';
import { botLabFlowMachine } from './botlab-flow-machine';

interface LaunchRequest {
  type: 'run';
  flow: ActorRefFrom<typeof botLabFlowMachine>;
  launch: (
    artifact: CompiledBehaviorArtifact,
    signal: AbortSignal
  ) => Promise<void>;
}

export const simulatorLaunchMachine = setup({
  types: {} as {
    context: { error?: string };
    events: LaunchRequest | { type: 'cancel' };
  },
  actors: {
    prepareAndLaunch: fromPromise(
      async ({
        input,
        signal,
      }: {
        input: LaunchRequest;
        signal: AbortSignal;
      }) => {
        const { flow } = input;
        const initial = flow.getSnapshot().context;
        const stages = [
          { event: 'build.compile', region: 'build', success: 'compiled' },
          { event: 'simulation.run', region: 'simulation', success: 'passed' },
          { event: 'demo.run', region: 'execution', success: 'completed' },
        ] as const;

        for (const stage of stages) {
          if (signal.aborted) throw new Error('Launch cancelled.');
          if (!flow.getSnapshot().can({ type: stage.event })) {
            throw new Error(`Cannot start ${stage.event}.`);
          }
          flow.send({ type: stage.event });
          const snapshot = await waitFor(
            flow,
            (state) =>
              state.matches({ [stage.region]: stage.success }) ||
              state.matches({ [stage.region]: 'failed' }) ||
              state.context.workspaceArtifact !== initial.workspaceArtifact ||
              state.context.selectedTargetId !== initial.selectedTargetId,
            { signal, timeout: 30000 }
          );
          if (
            snapshot.context.workspaceArtifact !== initial.workspaceArtifact ||
            snapshot.context.selectedTargetId !== initial.selectedTargetId
          ) {
            throw new Error('Program changed during preparation.');
          }
          if (!snapshot.matches({ [stage.region]: stage.success })) {
            throw new Error(
              snapshot.context.errorMessage ?? `${stage.event} failed.`
            );
          }
        }

        if (signal.aborted) throw new Error('Launch cancelled.');
        const artifact = flow.getSnapshot().context.compiledArtifact;
        if (!artifact) throw new Error('No compiled program to launch.');
        await input.launch(artifact, signal);
      }
    ),
  },
}).createMachine({
  id: 'simulatorLaunch',
  initial: 'idle',
  context: {},
  on: { cancel: { target: '.idle' } },
  states: {
    idle: { on: { run: { target: 'preparing' } } },
    preparing: {
      entry: assign({ error: undefined }),
      tags: ['busy'],
      invoke: {
        src: 'prepareAndLaunch',
        input: ({ event }) => {
          if (event.type !== 'run')
            throw new Error('Expected a launch request.');
          return event;
        },
        onDone: { target: 'idle' },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error
                ? event.error.message
                : String(event.error),
          }),
        },
      },
    },
    failed: { on: { run: { target: 'preparing' } } },
  },
});
