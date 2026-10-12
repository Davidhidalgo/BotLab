import {
  createMicroduckWalkingAdapter,
  compileMicroduckWalkingProgram,
  microduckWalkingBehavior,
  microduckMujocoTargetId,
} from '@botlab/adapters-microduck';
import { useMachine } from '@xstate/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  readMicroduckWalkingProgram,
  readJumperWalkingProgram,
  readJumperJointProgram,
  type BlocksWorkspaceArtifact,
} from '@botlab/blocks';
import {
  compileJumperWalkingProgram,
  createJumperWalkingAdapter,
  jumperWalkingBehavior,
  jumperWalkingTargetId,
  compileJumperJointProgram,
  createJumperAdapter,
  jumperJointBehavior,
  jumperJointTargetId,
} from '@botlab/adapters-jumper';
import { createBotLabRuntime } from '@botlab/runtime';
import {
  identifyCompiledProgram,
  type CompiledCommand,
  type ProgramIteration,
} from '@botlab/model';
import { createSimulationRenderer } from '@botlab/simulators-mujoco';
import { mujocoSessionMachine } from './mujoco-session-machine';

import type { MujocoRobot, MujocoTargetId } from './mujoco-targets';
import { mujocoPanelCopy } from './mujoco-panel-copy';
import type { BotLabLocale } from './i18n';
import type { SavedMujocoExecution } from './mujoco-execution-storage';
export interface MujocoSimulatorPanelProps {
  locale?: BotLabLocale;
  robot: MujocoRobot;
  targetId: MujocoTargetId;
  artifact: BlocksWorkspaceArtifact;
  savedExecution?: SavedMujocoExecution;
  executionBlocked?: boolean;
  onExecution?: (report: SavedMujocoExecution | undefined) => void;
  onActiveBlock?: (block: string | undefined) => void;
  onBusy?: (busy: boolean) => void;
}
export default function MujocoSimulatorPanel({
  locale = 'es',
  robot,
  targetId,
  artifact,
  savedExecution,
  executionBlocked,
  onExecution,
  onBusy,
  onActiveBlock,
}: MujocoSimulatorPanelProps) {
  const copy = mujocoPanelCopy[locale];
  const walking = robot !== 'jumper';
  const duck = robot === 'microduck';
  const label = duck ? 'MicroDuck' : 'Jumper';
  const [snapshot, send] = useMachine(mujocoSessionMachine, {
    input: { robot },
  });
  const { manifest, session, geometry, frame } = snapshot.context;
  const [report, setReport] = useState(savedExecution);
  const [restoredReport, setRestoredReport] = useState(!!savedExecution);
  const hasLocalChanges = useRef(false);
  const execution = report?.outcome;
  const callbacks = useRef({ onExecution, onBusy, onActiveBlock });
  useEffect(() => {
    callbacks.current = { onExecution, onBusy, onActiveBlock };
  }, [onExecution, onBusy, onActiveBlock]);
  const [activeCommand, setActiveCommand] = useState<CompiledCommand>();
  const activeBlock = activeCommand?.sourceBlockId;
  const iterationLabel = (iterations?: ProgramIteration[]) =>
    iterations
      ?.map(
        ({ iteration, count }) =>
          `${copy.iteration} ${iteration} ${copy.of} ${count}`,
      )
      .join(' → ');
  const [message, setMessage] = useState('');
  const commandTrace = report?.trace ?? [];
  const canvas = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof createSimulationRenderer>>();
  const runGeneration = useRef(0);
  const sourceChanged = useRef(false);
  const executing = report?.status === 'running';
  const ready =
    snapshot.matches({ active: 'ready' }) ||
    snapshot.matches({ active: 'paused' }) ||
    snapshot.matches({ active: 'running' });
  const runtime = useMemo(() => {
    if (!manifest || !session) return undefined;
    return createBotLabRuntime({
      adapters: [
        walking
          ? duck
            ? createMicroduckWalkingAdapter()
            : createJumperWalkingAdapter()
          : createJumperAdapter(manifest.joints),
      ],
      simulators: [],
      behaviors: [
        walking
          ? duck
            ? microduckWalkingBehavior
            : jumperWalkingBehavior
          : jumperJointBehavior,
      ],
      schedulers: [{ id: 'manual', name: 'Manual', mode: 'manual' }],
      arbitrationStrategies: [
        { id: 'exclusive', name: 'Exclusive', strategy: 'exclusive-lock' },
      ],
      dispatchers: [
        {
          targetId: walking
            ? duck
              ? microduckMujocoTargetId
              : jumperWalkingTargetId
            : jumperJointTargetId,
          async dispatch(command, { signal }) {
            setActiveCommand(command);
            const result = await session.command(
              walking
                ? command.commandId === 'distance'
                  ? {
                      kind: 'distance',
                      distanceMeters: Number(command.inputs['distanceMeters']),
                      speed: Number(command.inputs['speed']),
                      timeoutSeconds: Number(command.inputs['timeoutSeconds']),
                    }
                  : command.commandId === 'turn'
                    ? {
                        kind: 'turn',
                        angleRadians: Number(command.inputs['angleRadians']),
                        speed: Number(command.inputs['speed']),
                        timeoutSeconds: Number(
                          command.inputs['timeoutSeconds'],
                        ),
                      }
                    : command.commandId === 'wait'
                      ? {
                          kind: 'velocity',
                          forward: 0,
                          yaw: 0,
                          durationSeconds: Number(
                            command.inputs['durationSeconds'],
                          ),
                        }
                      : {
                          kind: 'velocity',
                          forward: Number(command.inputs['forward']),
                          yaw: Number(command.inputs['yaw']),
                          durationSeconds: Number(
                            command.inputs['durationSeconds'],
                          ),
                        }
                : {
                    joint: String(command.inputs['joint']),
                    positionRadians: Number(command.inputs['positionRadians']),
                    toleranceRadians: 0.02,
                    timeoutSeconds: 5,
                  },
              signal,
            );
            setReport((current) =>
              current
                ? {
                    ...current,
                    trace: [
                      ...current.trace,
                      {
                        commandId: command.id,
                        sourceBlockId: command.sourceBlockId,
                        iterations: command.iterations,
                        result,
                      },
                    ],
                  }
                : current,
            );
            return {
              commandId: command.id,
              status: result.status,
              evidence: result.evidence,
              message: walking
                ? `Movimiento completado; desplazamiento ${result.displacementMeters?.toFixed(3)} m.`
                : `Articulación alcanzada; error ${result.finalErrorRadians?.toFixed(4)} rad.`,
            };
          },
        },
      ],
    });
  }, [manifest, session, walking, duck]);
  const runtimeSession = useMemo(
    () => runtime?.createSession({ id: 'mujoco-program' }),
    [runtime],
  );

  useEffect(() => {
    if (!geometry || !canvas.current) return;
    const view = createSimulationRenderer(canvas.current, geometry);
    renderer.current = view;
    return () => {
      renderer.current = undefined;
      view.dispose();
    };
  }, [geometry]);
  useEffect(() => {
    if (frame) renderer.current?.update(frame);
  }, [frame]);
  useEffect(
    () => () => {
      runGeneration.current++;
      if (runtime && runtimeSession) runtime.disposeSession(runtimeSession.id);
    },
    [runtime, runtimeSession],
  );
  useEffect(() => {
    const hidden = () => {
      if (document.hidden && ready) send({ type: 'pause' });
    };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, [ready, send]);

  async function run() {
    if (!runtime || !runtimeSession || !manifest || executing) return;
    const generation = ++runGeneration.current;
    sourceChanged.current = false;
    try {
      const compiled = walking
        ? (duck ? compileMicroduckWalkingProgram : compileJumperWalkingProgram)(
            (duck ? readMicroduckWalkingProgram : readJumperWalkingProgram)(
              artifact,
            ),
          )
        : compileJumperJointProgram(
            readJumperJointProgram(artifact),
            manifest.joints,
          );
      const loaded = runtime.loadCompiledBehavior(runtimeSession.id, compiled);
      if (!loaded.validation.valid)
        throw new Error(loaded.validation.errors.join(' '));
      setMessage('');
      hasLocalChanges.current = true;
      setRestoredReport(false);
      setReport({
        targetId,
        sourceContent: artifact.content,
        status: 'running',
        startedAt: new Date().toISOString(),
        manifestId: manifest.id,
        modelRevision: manifest.revision,
        mujocoVersion: manifest.mujocoVersion,
        trace: [],
        outcome: {
          executionId: crypto.randomUUID(),
          program: identifyCompiledProgram(compiled),
          status: 'running',
          evidence: 'none',
        },
      });
      const result = await runtime.startSession(runtimeSession.id);
      if (generation === runGeneration.current) {
        setReport((current) =>
          sourceChanged.current || !current
            ? undefined
            : {
                ...current,
                outcome: result.outcome,
                status:
                  result.outcome.status === 'completed'
                    ? 'completed'
                    : result.outcome.status === 'cancelled'
                      ? 'cancelled'
                      : result.outcome.status === 'no-work'
                        ? 'no-work'
                        : 'failed',
                finishedAt: new Date().toISOString(),
              },
        );
        setMessage(
          sourceChanged.current
            ? ''
            : (result.outcome.diagnostic?.message ?? ''),
        );
      }
    } catch (error) {
      if (generation === runGeneration.current) {
        setMessage(sourceChanged.current ? '' : String(error));
        setReport(undefined);
      }
    } finally {
      if (generation === runGeneration.current) setActiveCommand(undefined);
    }
  }
  function stop() {
    if (runtime && runtimeSession) runtime.stopSession(runtimeSession.id);
    send({ type: 'stop' });
  }
  const previousContent = useRef(artifact.content);
  useEffect(() => {
    if (
      !hasLocalChanges.current &&
      savedExecution?.sourceContent === artifact.content
    ) {
      setReport(savedExecution);
      setRestoredReport(true);
    }
  }, [savedExecution, artifact.content]);
  useEffect(() => {
    if (previousContent.current === artifact.content) return;
    previousContent.current = artifact.content;
    // Hydrating a saved document is not an edit and must not erase its result.
    if (!executing && savedExecution?.sourceContent === artifact.content) {
      hasLocalChanges.current = false;
      setReport(savedExecution);
      setRestoredReport(true);
      return;
    }
    hasLocalChanges.current = true;
    sourceChanged.current = true;
    setMessage('');
    if (executing) {
      if (runtime && runtimeSession) runtime.stopSession(runtimeSession.id);
      send({ type: 'stop' });
    } else {
      setReport(undefined);
      setActiveCommand(undefined);
    }
  }, [
    artifact.content,
    savedExecution,
    executing,
    runtime,
    runtimeSession,
    send,
  ]);
  useEffect(() => {
    if (hasLocalChanges.current)
      callbacks.current.onExecution?.(
        report?.sourceContent === artifact.content ? report : undefined,
      );
  }, [report, artifact.content]);
  useEffect(() => {
    callbacks.current.onActiveBlock?.(activeBlock);
  }, [activeBlock]);
  const busy = executing || snapshot.matches({ active: 'loading' });
  useEffect(() => {
    callbacks.current.onBusy?.(busy);
    return () => callbacks.current.onBusy?.(false);
  }, [busy]);
  const button =
    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:opacity-40 hover:bg-slate-100';
  const status = snapshot.matches('failed')
    ? copy.error
    : snapshot.matches({ active: 'loading' })
      ? copy.loading
      : ready
        ? walking
          ? copy.walking
          : copy.joints
        : copy.unloaded;
  return (
    <section
      aria-label="MuJoCo web"
      className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{label} · MuJoCo web</h2>
        <span className="text-xs text-muted-foreground">{status}</span>
        <button
          className={button}
          disabled={!ready || executing || executionBlocked}
          onClick={() => void run()}
        >
          {copy.run}
        </button>
      </div>
      <section className="shrink-0 overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap gap-2 border-b p-3">
          <button
            className={button}
            onClick={() => {
              setMessage('');
              send({ type: 'load' });
            }}
            disabled={snapshot.matches('active')}
          >
            {copy.load} {label}
          </button>
          <button
            className={button}
            onClick={() => send({ type: 'start' })}
            disabled={!ready}
          >
            {copy.play}
          </button>
          <button
            className={button}
            onClick={() => send({ type: 'pause' })}
            disabled={!ready}
          >
            {copy.pause}
          </button>
          <button
            className={button}
            onClick={() => send({ type: 'step' })}
            disabled={
              !ready || snapshot.matches({ active: 'running' }) || executing
            }
          >
            {copy.step}
          </button>
          <button
            className={button}
            onClick={() => {
              setMessage('');
              setRestoredReport(true);
              send({ type: 'reset' });
            }}
            disabled={!ready || executing}
          >
            {copy.reset}
          </button>
          <button className={button} onClick={stop} disabled={!ready}>
            {copy.stop}
          </button>
          <button
            className={button}
            onClick={() => {
              stop();
              setRestoredReport(true);
              send({ type: 'close' });
            }}
            disabled={!snapshot.matches('active') || executing}
          >
            {copy.close}
          </button>
        </div>
        <div
          ref={canvas}
          className="h-[360px] min-h-[280px] flex-1 bg-slate-950"
        />
        <div className="space-y-2 p-4 text-sm">
          <p>{walking ? copy.walkingHelp : copy.jointHelp}</p>
          {walking && <p>{duck ? copy.microduckHelp : copy.jumperHelp}</p>}
          <p aria-label={copy.physics}>
            {copy.physics}:{' '}
            {snapshot.matches({ active: 'running' })
              ? copy.moving
              : snapshot.matches({ active: 'paused' })
                ? copy.paused
                : ready
                  ? copy.ready
                  : copy.unloaded}
          </p>
          <p aria-label={copy.time}>
            {copy.time}: {frame?.timeSeconds.toFixed(3) ?? '0.000'} s · tick{' '}
            {frame?.tick ?? 0}
          </p>
          {walking && frame && (
            <p data-testid="root-position">
              {copy.position}:{' '}
              {frame.rootPosition.map((v) => v.toFixed(3)).join(' · ')} m
            </p>
          )}
          {!walking && frame && manifest && (
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left">{copy.joint}</th>
                  <th>{copy.goal}</th>
                  <th>{copy.measured}</th>
                  <th>{copy.effort}</th>
                </tr>
              </thead>
              <tbody>
                {manifest.joints
                  .filter((joint) => joint.name === 'LM_J0_joint')
                  .map((joint) => {
                    const i = manifest.joints.indexOf(joint);
                    return (
                      <tr key={joint.name}>
                        <td>{joint.name}</td>
                        <td>{frame.targets[i].toFixed(4)}</td>
                        <td data-testid="joint-position">
                          {frame.positions[i].toFixed(4)}
                        </td>
                        <td>{frame.efforts[i].toFixed(4)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      </section>
      <p role="status" aria-label={copy.result} className="px-4 py-2 text-sm">
        {report?.status === 'interrupted'
          ? copy.interrupted
          : execution?.status === 'completed'
            ? copy.completed
            : execution?.status === 'no-work'
              ? copy.noWork
              : execution?.status === 'running'
                ? copy.running
                : execution?.status === 'cancelled'
                  ? copy.cancelled
                  : execution?.status === 'failed'
                    ? copy.failed
                    : copy.idle}
      </p>
      {executing && activeCommand && (
        <p
          aria-label={copy.progress}
          className="px-4 text-sm"
          data-command-id={activeCommand.id}
          data-block-id={activeBlock}
        >
          {activeCommand.commandId === 'distance'
            ? copy.advancing
            : activeCommand.commandId === 'turn'
              ? copy.turning
              : activeCommand.commandId === 'wait'
                ? copy.waiting
                : copy.moving}
          {activeCommand.iterations?.length
            ? ` · ${iterationLabel(activeCommand.iterations)}`
            : ''}
        </p>
      )}
      {walking &&
        commandTrace.filter(
          ({ result }) => result.targetDistanceMeters !== undefined,
        ).length > 1 && (
          <p aria-label={copy.totalAdvance} className="px-4 text-sm">
            {copy.totalAdvance}:{' '}
            {commandTrace
              .reduce(
                (sum, { result }) =>
                  sum +
                  (result.targetDistanceMeters !== undefined
                    ? (result.forwardDisplacementMeters ?? 0)
                    : 0),
                0,
              )
              .toFixed(2)}{' '}
            /{' '}
            {commandTrace
              .reduce(
                (sum, { result }) => sum + (result.targetDistanceMeters ?? 0),
                0,
              )
              .toFixed(2)}{' '}
            m
          </p>
        )}
      {walking &&
        commandTrace.some(
          ({ result }) =>
            result.targetDistanceMeters !== undefined ||
            result.targetYawRadians !== undefined,
        ) && (
          <ol aria-label={copy.observed} className="space-y-1 px-4 text-sm">
            {commandTrace.map(
              ({ commandId, sourceBlockId, iterations, result }, index) =>
                result.targetDistanceMeters !== undefined ? (
                  <li key={commandId ?? `${sourceBlockId}-${index}`}>
                    {iterations?.length
                      ? `${iterationLabel(iterations)} · `
                      : ''}
                    {copy.advanceResult}:{' '}
                    {result.forwardDisplacementMeters?.toFixed(2)} /{' '}
                    {result.targetDistanceMeters.toFixed(2)} m
                  </li>
                ) : result.targetYawRadians !== undefined ? (
                  <li key={commandId ?? `${sourceBlockId}-${index}`}>
                    {iterations?.length
                      ? `${iterationLabel(iterations)} · `
                      : ''}
                    {result.targetYawRadians >= 0
                      ? copy.leftResult
                      : copy.rightResult}
                    :{' '}
                    {Math.abs(
                      ((result.yawRadians ?? 0) * 180) / Math.PI,
                    ).toFixed(0)}{' '}
                    /{' '}
                    {Math.abs(
                      (result.targetYawRadians * 180) / Math.PI,
                    ).toFixed(0)}
                    °
                  </li>
                ) : null,
            )}
          </ol>
        )}
      {report && restoredReport && !executing && (
        <p className="px-4 text-xs text-muted-foreground">{copy.historical}</p>
      )}
      {(snapshot.context.error || message) && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800"
        >
          {snapshot.context.error || message}
        </p>
      )}
      <details className="mt-4 rounded-lg border bg-white p-3 text-sm">
        <summary>{copy.diagnostics}</summary>
        <p className="mt-2">
          MuJoCo 3.11.0 · {manifest?.variant ?? copy.resources}
        </p>
        <p>
          {copy.revision}: {manifest?.revision}
        </p>
        {execution && (
          <p>
            {copy.execution}: {execution.executionId} · {execution.status} ·{' '}
            {copy.evidence}: {execution.evidence}
          </p>
        )}
        {report && (
          <p className="break-all text-xs">
            {new Date(report.startedAt).toLocaleString(locale)} ·{' '}
            {report.manifestId} · MuJoCo {report.mujocoVersion} ·{' '}
            {copy.revision}: {report.modelRevision}
          </p>
        )}
        {commandTrace.length > 0 && (
          <pre className="mt-2 max-h-56 overflow-auto text-xs">
            {JSON.stringify(commandTrace, null, 2)}
          </pre>
        )}
      </details>
    </section>
  );
}
