import { identifyCompiledProgram, sameProgram } from '@botlab/model';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMachine } from '@xstate/react';
import type { BlocksWorkspaceArtifact } from '@botlab/blocks';
import {
  createNativeAppConnection,
  createNativeProgram,
} from '@botlab/simulators-microduck-native';
import { nativeMicroDuckCapabilities } from '@botlab/adapters-microduck';
import { Button } from '@botlab/ui';
import { compileMicroDuckWorkspaceArtifact } from './botlab-flow-machine';
import { nativeSimulatorMachine } from './native-simulator-machine';
import type { BotLabLocale } from './i18n';
import {
  usedImportedSkillNames,
  type HuggingFaceModel,
} from './huggingface-models';

const labels = {
  es: {
    connect: 'Conectar',
    observed: 'Postura',
    sit: 'sentado',
    stand: 'de pie',
    transitioning: 'cambiando de postura',
    unknown: 'desconocida',
    decision: 'Condición',
    iteration: 'Repetición',
    yes: 'verdadero',
    no: 'falso',
    already: 'El robot ya está',
    checkFirst:
      'Comprueba su postura con un bloque «si» antes de repetir la orden.',
    unknownPosture:
      'La postura es desconocida. Espera a tener una observación fiable antes de comprobarla.',
    disconnect: 'Desconectar',
    run: 'Ejecutar',
    stop: 'Parar',
    reset: 'Reiniciar escena',
    posture: 'Sentarse / levantarse',
    start: 'Abre BotLab Simulator y pulsa Conectar.',
    external:
      'La escena está abierta en BotLab Simulator. Usa estos controles para ejecutar tu programa.',
    developer: 'Alternativa para desarrollo',
    offline: 'Sin conexión',
    connecting: 'Conectando…',
    ready: 'Preparado',
    running: 'Ejecutando',
    completed: 'Completado',
    stopped: 'Detenido',
    failed: 'Error',
    view: 'Escena nativa de MuJoCo',
    depth: 'Distancia frontal',
    settling: 'Esperando postura estable…',
    available: 'Bloques de postura disponibles',
    unavailable: 'Posturas no disponibles en este simulador',
    note: 'Experimental · movimiento, posturas, condiciones y espera · LEDs aún no disponibles',
    backend: 'Simulador',
    browser: 'Navegador (iframe)',
    native: 'MuJoCo nativo (experimental)',
    loadingModels: 'Cargando los modelos del programa…',
    missingModel:
      'Añade el modelo seleccionado desde «Añadir modelo de Hugging Face».',
    imported: 'Habilidad importada',
  },
  ca: {
    connect: 'Connectar',
    observed: 'Postura',
    sit: 'assegut',
    stand: 'dret',
    transitioning: 'canviant de postura',
    unknown: 'desconeguda',
    decision: 'Condició',
    iteration: 'Repetició',
    yes: 'cert',
    no: 'fals',
    already: 'El robot ja està',
    checkFirst:
      'Comprova la postura amb un bloc «si» abans de repetir l’ordre.',
    unknownPosture:
      'La postura és desconeguda. Espera una observació fiable abans de comprovar-la.',
    disconnect: 'Desconnectar',
    run: 'Executar',
    stop: 'Aturar',
    reset: 'Reiniciar escena',
    posture: 'Seure / aixecar-se',
    start: 'Obre BotLab Simulator i prem Connectar.',
    external:
      'L’escena és oberta a BotLab Simulator. Fes servir aquests controls per executar el programa.',
    developer: 'Alternativa per a desenvolupament',
    offline: 'Sense connexió',
    connecting: 'Connectant…',
    ready: 'Preparat',
    running: 'Executant',
    completed: 'Completat',
    stopped: 'Aturat',
    failed: 'Error',
    view: 'Escena nativa de MuJoCo',
    depth: 'Distància frontal',
    settling: 'Esperant una postura estable…',
    available: 'Blocs de postura disponibles',
    unavailable: 'Postures no disponibles en aquest simulador',
    note: 'Experimental · moviment, postures, condicions i espera · LEDs encara no disponibles',
    backend: 'Simulador',
    browser: 'Navegador (iframe)',
    native: 'MuJoCo natiu (experimental)',
    loadingModels: 'Carregant els models del programa…',
    missingModel:
      'Afegeix el model seleccionat des de «Afegeix un model de Hugging Face».',
    imported: 'Habilitat importada',
  },
  en: {
    connect: 'Connect',
    observed: 'Posture',
    sit: 'sitting',
    stand: 'standing',
    transitioning: 'changing posture',
    unknown: 'unknown',
    decision: 'Condition',
    iteration: 'Iteration',
    yes: 'true',
    no: 'false',
    already: 'The robot is already',
    checkFirst:
      'Check its posture with an if block before repeating the command.',
    unknownPosture:
      'Posture is unknown. Wait for a reliable observation before checking it.',
    disconnect: 'Disconnect',
    run: 'Run',
    stop: 'Stop',
    reset: 'Reset scene',
    posture: 'Sit / stand',
    start: 'Open BotLab Simulator, then select Connect.',
    external:
      'The scene is open in BotLab Simulator. Use these controls to run your program.',
    developer: 'Development alternative',
    offline: 'Disconnected',
    connecting: 'Connecting…',
    ready: 'Ready',
    running: 'Running',
    completed: 'Completed',
    stopped: 'Stopped',
    failed: 'Error',
    view: 'Native MuJoCo scene',
    depth: 'Front distance',
    settling: 'Waiting for a stable posture…',
    available: 'Posture blocks available',
    unavailable: 'Postures unavailable on this simulator',
    note: 'Experimental · movement, postures, conditions and waits · LEDs not supported yet',
    backend: 'Simulator',
    browser: 'Browser (iframe)',
    native: 'Native MuJoCo (experimental)',
    loadingModels: 'Loading models used by this program…',
    missingModel: 'Add the selected model with “Add Hugging Face model”.',
    imported: 'Imported skill',
  },
};
export const nativeSimulatorLabels = labels;

export function NativeSimulatorPanel({
  workspace,
  models,
  connectionFactory,
  locale,
  onActiveBlock,
  onBusy,
  executionBlocked = false,
}: {
  workspace: BlocksWorkspaceArtifact;
  models: readonly HuggingFaceModel[];
  connectionFactory?: typeof createNativeAppConnection;
  locale: BotLabLocale;
  onActiveBlock: (id: string | undefined) => void;
  onBusy: (busy: boolean) => void;
  executionBlocked?: boolean;
}) {
  const [snapshot, send, actor] = useMachine(nativeSimulatorMachine, {
    input: {
      url: process.env.BOTLAB_NATIVE_SIMULATOR_URL ?? 'http://127.0.0.1:4401',
      factory: connectionFactory,
    },
  });
  const [compileError, setCompileError] = useState<string>();
  const importAttempts = useRef(new Set<string>());
  const copy = labels[locale];
  const data = snapshot.context.snapshot;
  const currentIdentity = useMemo(() => {
    try {
      return identifyCompiledProgram(
        compileMicroDuckWorkspaceArtifact(workspace, 'microduck-native'),
      );
    } catch {
      return undefined;
    }
  }, [workspace]);
  const program =
    sameProgram(currentIdentity, snapshot.context.execution?.program) &&
    data?.program?.runId === snapshot.context.runId
      ? data?.program
      : undefined;
  const supportsPosture = nativeMicroDuckCapabilities(
    data?.capabilities,
    'microduck-native',
  ).some((capability) => capability.id === 'microduck-posture');
  const online = snapshot.matches('online');
  const busy = snapshot.hasTag('busy');
  const usedNames = useMemo(
    () => usedImportedSkillNames(workspace),
    [workspace.content],
  );
  const missing = [...usedNames].filter(
    (name) => !models.some((model) => model.name === name),
  );
  const pending = models.filter(
    (model) =>
      usedNames.has(model.name) &&
      !data?.importedSkills?.some((skill) => skill.name === model.name),
  );
  const running = snapshot.matches({ online: 'active' });
  const canReset = snapshot.matches({ online: 'ready' }) && !!data?.state;
  const ready =
    snapshot.matches({ online: 'ready' }) && !!data?.state && !data.postureBusy;
  const canRun =
    canReset &&
    !busy &&
    !missing.length &&
    !pending.length &&
    (data.observedPosture === 'transitioning' || !data.postureBusy);
  const postureError =
    program?.errorCode === 'posture-already-sit'
      ? `${copy.already} ${copy.sit}. ${copy.checkFirst}`
      : program?.errorCode === 'posture-already-stand'
        ? `${copy.already} ${copy.stand}. ${copy.checkFirst}`
        : program?.errorCode === 'posture-unknown'
          ? copy.unknownPosture
          : undefined;
  const error =
    compileError ?? snapshot.context.error ?? postureError ?? program?.error;
  useEffect(() => {
    importAttempts.current.clear();
  }, [snapshot.context.connection]);
  useEffect(() => {
    if (
      !snapshot.matches({ online: 'ready' }) ||
      !data?.state ||
      snapshot.context.error ||
      missing.length ||
      !pending.length
    )
      return;
    const model = pending[0];
    if (importAttempts.current.has(model.name)) return;
    importAttempts.current.add(model.name);
    send({
      type: 'operate',
      operation: {
        kind: 'import-skill',
        repo: model.repo,
        revision: model.revision,
        filename: model.filename,
        name: model.name,
        duration: model.duration,
      },
    });
  }, [data, missing.length, pending, send, snapshot]);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  useEffect(() => {
    onActiveBlock(
      running || program?.status === 'failed'
        ? program?.step.sourceBlockId
        : undefined,
    );
    return () => onActiveBlock(undefined);
  }, [onActiveBlock, program?.step.sourceBlockId, program?.status, running]);
  // Editing/importing a program invalidates its running execution.
  useEffect(() => {
    setCompileError(undefined);
    const current = actor.getSnapshot();
    if (
      current.matches({ online: 'active' }) ||
      current.matches({ online: 'command' })
    )
      actor.send({ type: 'operate', operation: { kind: 'stop' } });
  }, [workspace, actor]);
  function run() {
    if (executionBlocked) return;
    try {
      const compiled = compileMicroDuckWorkspaceArtifact(
        workspace,
        'microduck-native',
      );
      const steps = createNativeProgram(compiled, data?.capabilities);
      setCompileError(undefined);
      send({
        type: 'operate',
        operation: {
          kind: 'run',
          steps,
          program: identifyCompiledProgram(compiled),
        },
      });
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : String(error));
    }
  }
  const depth = data?.depth;
  const ranges = depth
    ? [27, 28, 35, 36]
        .filter((i) => [5, 9].includes(depth.status[i]))
        .map((i) => depth.distance_mm[i])
        .filter((x) => x > 0)
    : [];
  const stateLabel = snapshot.matches({ online: 'connecting' })
    ? copy.connecting
    : !online
      ? copy.offline
      : running
        ? copy.running
        : program
          ? copy[program.status]
          : copy.ready;
  return (
    <section className="simulator-workbench" aria-label={copy.native}>
      <div className="simulator-toolbar">
        <strong className="text-sm">MuJoCo · MicroDuck</strong>
        <div className="flex flex-wrap gap-2">
          {!online ? (
            <Button onClick={() => send({ type: 'connect' })}>
              {copy.connect}
            </Button>
          ) : (
            <>
              <Button onClick={run} disabled={!canRun || executionBlocked}>
                {copy.run}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  send({ type: 'operate', operation: { kind: 'stop' } })
                }
                disabled={snapshot.matches({ online: 'connecting' })}
              >
                {copy.stop}
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="simulator-status">
        <span role="status">
          {stateLabel}
          {data?.state
            ? ` · ${data.state.policy} · ${data.state.loop.hz.toFixed(0)} Hz`
            : ''}
        </span>
        {online && data?.observedPosture ? (
          <span className="text-xs">
            {copy.observed}: {copy[data.observedPosture]}
          </span>
        ) : null}
        {program?.decisions?.length ? (
          <ul aria-label={copy.decision} className="text-xs">
            {program.decisions.map((decision, index) => (
              <li key={index}>
                {copy.decision} {index + 1} ·{' '}
                {copy[decision.posture as 'sit' | 'stand' | 'transitioning']}:{' '}
                {decision.result ? copy.yes : copy.no}
              </li>
            ))}
          </ul>
        ) : null}
        {online && data?.postureBusy ? (
          <span className="text-xs">{copy.settling}</span>
        ) : null}
        {online && data ? (
          <span className="text-xs">
            {supportsPosture ? copy.available : copy.unavailable}
          </span>
        ) : null}
        {running && program?.step.iterations?.length ? (
          <span role="status" className="text-xs">
            {copy.iteration}{' '}
            {program.step.iterations
              .map((item) => `${item.iteration}/${item.count}`)
              .join(' · ')}
          </span>
        ) : null}
        {running && program ? (
          <span className="text-xs">
            {program.index + 1}/{program.count} · {program.progress.toFixed(2)}{' '}
            {program.step.kind === 'walk' ||
            program.step.kind === 'walk-until-obstacle'
              ? 'm'
              : program.step.kind === 'turn' ||
                  program.step.kind === 'turn-until-clear'
                ? '°'
                : 's'}
          </span>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {missing.length > 0 && (
          <p role="alert" className="text-sm text-destructive">
            {copy.missingModel} ({missing.join(', ')})
          </p>
        )}
        {online && pending.length > 0 && !error && !missing.length && (
          <p role="status" className="text-xs">
            {copy.loadingModels} {pending.map((model) => model.name).join(', ')}
          </p>
        )}
        <span className="text-xs text-muted-foreground">{copy.note}</span>
      </div>
      <div className="simulator-scene">
        {online && data?.presentation === 'external' ? (
          <p className="p-6 text-center text-sm">{copy.external}</p>
        ) : online && data && data.frameTime > 0 ? (
          <img
            className="h-full w-full object-contain"
            src={snapshot.context.connection?.videoUrl}
            crossOrigin="anonymous"
            alt={copy.view}
          />
        ) : (
          <div className="p-6 text-center text-sm">
            <p>{copy.start}</p>
            <details className="mt-3">
              <summary>{copy.developer}</summary>
              <code className="mt-3 block">pnpm run microduck:native</code>
            </details>
          </div>
        )}
      </div>
      <div className="border-t p-4">
        {data?.importedSkills?.map((skill) => (
          <p key={skill.name} role="status" className="mt-2 text-xs">
            {copy.imported}: <strong>{skill.name}</strong> · {skill.repo} ·{' '}
            {skill.revision.slice(0, 10)}
          </p>
        ))}
      </div>
      <div className="simulator-toolbar">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!ready || !supportsPosture}
            onClick={() =>
              send({ type: 'operate', operation: { kind: 'posture' } })
            }
          >
            {copy.posture}
          </Button>
          <Button
            variant="secondary"
            disabled={!canReset}
            onClick={() => {
              importAttempts.current.clear();
              send({ type: 'operate', operation: { kind: 'reset' } });
            }}
          >
            {copy.reset}
          </Button>
          <Button
            variant="ghost"
            disabled={!online}
            onClick={() => send({ type: 'disconnect' })}
          >
            {copy.disconnect}
          </Button>
        </div>
        <span className="text-xs">
          {copy.depth}:{' '}
          {ranges.length >= 3
            ? `${(Math.min(...ranges) / 1000).toFixed(2)} m`
            : '—'}
        </span>
      </div>
    </section>
  );
}
