import { assign, fromCallback, sendTo, setup } from 'xstate';
import { createMujocoSession } from '@botlab/simulators-mujoco';
import {
  createMicroduckMujocoSession,
  loadMicroduckMujocoManifest,
} from '@botlab/simulators-microduck-mujoco';
import {
  loadJumperJointManifest,
  loadJumperWalkingManifest,
  createJumperWalkingSession,
} from '@botlab/simulators-jumper';
import type {
  RenderGeometry,
  SimulationFrame,
  SimulationManifest,
  SimulationSession,
} from '@botlab/simulators-core';

type Event =
  | { type: 'load'; scene?: 'flat' | 'obstacles' }
  | { type: 'close' | 'start' | 'pause' | 'step' | 'reset' | 'stop' }
  | {
      type: 'loaded';
      manifest: SimulationManifest;
      geometry: RenderGeometry[];
      frame: SimulationFrame;
    }
  | { type: 'frame'; frame: SimulationFrame }
  | { type: 'failure'; error: string };

/** One callback actor owns the worker across load, pause, reset and commands. */
export const mujocoSessionMachine = setup({
  types: {} as {
    input: { robot: 'jumper' | 'jumper-walking' | 'microduck' };
    context: {
      robot: 'jumper' | 'jumper-walking' | 'microduck';
      scene?: 'flat' | 'obstacles';
      session?: SimulationSession;
      manifest?: SimulationManifest;
      geometry?: RenderGeometry[];
      frame?: SimulationFrame;
      error?: string;
    };
    events: Event;
  },
  actors: {
    session: fromCallback<
      Event,
      {
        scene?: 'flat' | 'obstacles';
        session: SimulationSession;
        robot: 'jumper' | 'jumper-walking' | 'microduck';
      }
    >(({ input, sendBack, receive }) => {
      const session = input.session;
      const abort = new AbortController();
      let active = true;
      let controlling = false;
      const fail = (error: unknown) => {
        if (active)
          sendBack({
            type: 'failure',
            error: error instanceof Error ? error.message : String(error),
          });
      };
      const unsubscribe = session.subscribe((frame) => {
        if (active) {
          if (frame.state === 'error')
            fail('La simulación física ha fallado. Recarga la sesión.');
          else sendBack({ type: 'frame', frame });
        }
      });
      void (
        input.robot === 'jumper'
          ? loadJumperJointManifest(abort.signal)
          : input.robot === 'jumper-walking'
            ? loadJumperWalkingManifest(abort.signal)
            : loadMicroduckMujocoManifest(abort.signal, input.scene)
      )
        .then(async (manifest) => {
          if (!active) return;
          const loaded = await session.load(manifest);
          if (active) sendBack({ type: 'loaded', manifest, ...loaded });
        })
        .catch(fail);
      receive((event) => {
        if (!['start', 'pause', 'step', 'reset', 'stop'].includes(event.type))
          return;
        if (controlling && event.type !== 'stop') return;
        controlling = true;
        const operation = event.type as
          | 'start'
          | 'pause'
          | 'step'
          | 'reset'
          | 'stop';
        void session[operation]()
          .then((frame) => {
            if (active) sendBack({ type: 'frame', frame });
          })
          .catch(fail)
          .finally(() => {
            controlling = false;
          });
      });
      return () => {
        active = false;
        abort.abort();
        unsubscribe();
        session.dispose();
      };
    }),
  },
  actions: {
    begin: assign(({ context, event }) => ({
      scene:
        event.type === 'load' && context.robot === 'microduck'
          ? event.scene
          : undefined,
      session:
        context.robot === 'jumper'
          ? createMujocoSession()
          : context.robot === 'jumper-walking'
            ? createJumperWalkingSession()
            : createMicroduckMujocoSession(),
      manifest: undefined,
      geometry: undefined,
      frame: undefined,
      error: undefined,
    })),
    frame: assign(({ event }) =>
      event.type === 'frame' ? { frame: event.frame } : {},
    ),
    loaded: assign(({ event }) =>
      event.type === 'loaded'
        ? {
            manifest: event.manifest,
            geometry: event.geometry,
            frame: event.frame,
          }
        : {},
    ),
    control: sendTo('connection', ({ event }) => event),
  },
}).createMachine({
  id: 'mujocoSession',
  initial: 'idle',
  context: ({ input }) => ({ robot: input.robot }),
  states: {
    idle: { on: { load: { target: 'active', actions: 'begin' } } },
    failed: {
      on: { load: { target: 'active', actions: 'begin' }, close: 'idle' },
    },
    active: {
      invoke: {
        id: 'connection',
        src: 'session',
        input: ({ context }) => ({
          session: context.session!,
          robot: context.robot,
          scene: context.scene,
        }),
      },
      initial: 'loading',
      on: {
        close: {
          target: 'idle',
          actions: assign(() => ({
            session: undefined,
            manifest: undefined,
            geometry: undefined,
            frame: undefined,
            error: undefined,
          })),
        },
        failure: {
          target: 'failed',
          actions: assign(({ event }) => ({ error: event.error })),
        },
        start: {
          guard: ({ context }) => !!context.manifest,
          actions: 'control',
        },
        pause: {
          guard: ({ context }) => !!context.manifest,
          actions: 'control',
        },
        step: {
          guard: ({ context }) => !!context.manifest,
          actions: 'control',
        },
        reset: {
          guard: ({ context }) => !!context.manifest,
          actions: 'control',
        },
        stop: {
          guard: ({ context }) => !!context.manifest,
          actions: 'control',
        },
      },
      states: {
        loading: { on: { loaded: { target: 'ready', actions: 'loaded' } } },
        ready: {
          on: {
            frame: [
              {
                guard: ({ event }) => event.frame.state === 'running',
                target: 'running',
                actions: 'frame',
              },
              {
                guard: ({ event }) => event.frame.state === 'paused',
                target: 'paused',
                actions: 'frame',
              },
              { actions: 'frame' },
            ],
          },
        },
        running: {
          on: {
            frame: [
              {
                guard: ({ event }) => event.frame.state === 'paused',
                target: 'paused',
                actions: 'frame',
              },
              {
                guard: ({ event }) => event.frame.state === 'ready',
                target: 'ready',
                actions: 'frame',
              },
              { actions: 'frame' },
            ],
          },
        },
        paused: {
          on: {
            frame: [
              {
                guard: ({ event }) => event.frame.state === 'running',
                target: 'running',
                actions: 'frame',
              },
              {
                guard: ({ event }) => event.frame.state === 'ready',
                target: 'ready',
                actions: 'frame',
              },
              { actions: 'frame' },
            ],
          },
        },
      },
    },
  },
});
