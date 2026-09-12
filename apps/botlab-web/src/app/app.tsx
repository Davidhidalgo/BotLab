import { BlocksEditorShell } from '@botlab/blocks';
import { botLabConcepts } from '@botlab/model';
import {
  createMicroDuckSimulatorAssetCachePlan,
  microDuckSimulatorAssetManifest,
} from '@botlab/simulators-microduck';
import { Badge, Button } from '@botlab/ui';
import { useMachine } from '@xstate/react';
import {
  Activity,
  Blocks,
  Cpu,
  FileCode,
  GitBranch,
  Lock,
  Play,
  Radar,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { type ReactNode } from 'react';
import {
  botLabBuildStateLabels,
  botLabBuildSteps,
  botLabExecutionStateLabels,
  botLabExecutionSteps,
  botLabFlowMachine,
  botLabSimulationStateLabels,
  botLabSimulationSteps,
  botLabWorkspaceStateLabels,
  botLabWorkspaceSteps,
  type BotLabBuildState,
  type BotLabExecutionState,
  type BotLabSimulationState,
  type BotLabWorkspaceState,
} from './botlab-flow-machine';

const featuredConcepts = botLabConcepts.filter(({ concept }) =>
  ['policy', 'skill', 'behavior', 'arbitration'].includes(concept)
);

const conceptIcons = {
  policy: ShieldCheck,
  skill: Cpu,
  behavior: Workflow,
  arbitration: GitBranch,
};

export function App() {
  const [flowSnapshot, sendFlow] = useMachine(botLabFlowMachine);
  const {
    compiledArtifact,
    runtime,
    runtimeSnapshot,
    runMessage,
    buildMessage,
    flowLog,
    selectedTargetId,
    simulationMessage,
    simulationResult,
    workspaceArtifact,
    workspaceMessage,
  } = flowSnapshot.context;
  const flowState = flowSnapshot.value as {
    workspace: BotLabWorkspaceState;
    build: BotLabBuildState;
    simulation: BotLabSimulationState;
    execution: BotLabExecutionState;
  };
  const isRunningDemo = flowSnapshot.hasTag('execution-busy');
  const isCompiling = flowSnapshot.hasTag('build-busy');
  const isSimulating = flowSnapshot.hasTag('simulation-busy');
  const targets = runtime.listTargets();
  const capabilities = runtime.listCapabilities();
  const selectedTarget = targets.find(
    (target) => target.id === selectedTargetId
  );
  const selectedCapabilities = capabilities.filter((capability) =>
    capability.targetIds.includes(selectedTargetId)
  );
  const selectedTargetCanRunDemo =
    selectedTarget?.status === 'available' &&
    selectedCapabilities.some(
      (capability) => capability.id === 'microduck-leds'
    );
  const queue = runtimeSnapshot.queue;
  const activeSession = runtimeSnapshot.sessions[0];
  const traceArtifact = activeSession
    ? runtime.getSessionTrace(activeSession.id)
    : undefined;
  const recentEvents = runtimeSnapshot.recentEvents.slice(-5).reverse();
  const recentTrace = activeSession?.trace.slice(-5).reverse() ?? [];
  const diagnostics = runtimeSnapshot.diagnostics.slice(-5).reverse();
  const policyEvaluation = activeSession?.policyEvaluation;
  const compiledCommand = compiledArtifact?.commands[0];
  const compiledPattern =
    typeof compiledCommand?.inputs.pattern === 'string'
      ? compiledCommand.inputs.pattern
      : undefined;
  const compiledBrightness =
    typeof compiledCommand?.inputs.brightness === 'number'
      ? compiledCommand.inputs.brightness
      : undefined;
  const compiledTargetName = compiledArtifact
    ? targets.find((target) => target.id === compiledArtifact.targetId)?.name ??
      compiledArtifact.targetId
    : undefined;
  const policyConfirmed = runtimeSnapshot.recentEvents.some(
    (event) =>
      event.type === 'policy-confirmed' && event.sessionId === activeSession?.id
  );
  const simulatorAssetPlan = createMicroDuckSimulatorAssetCachePlan(
    microDuckSimulatorAssetManifest
  );
  const simulatorAssetSummary =
    summarizeMicroDuckSimulatorAssetPlan(simulatorAssetPlan);
  const artifactCards = [
    {
      id: workspaceArtifact.id,
      title: 'Workspace',
      kind: artifactKindLabels[workspaceArtifact.kind],
      status: workspaceStatusLabels[workspaceArtifact.status],
      detail: `${workspaceArtifact.engine} · ${workspaceArtifact.format}`,
    },
    {
      id: compiledArtifact?.id ?? 'compiled-plan-pending',
      title: 'Plan compilado',
      kind: 'Compiled plan',
      status: compiledArtifact ? 'Listo' : 'Pendiente',
      detail: compiledArtifact
        ? `${compiledArtifact.commands.length} comando(s) · ${
            selectedTarget?.name ?? compiledArtifact.targetId
          }`
        : 'Compila la demo para generar este artifact.',
    },
    {
      id: simulationResult?.artifactId ?? 'simulation-output-pending',
      title: 'Salida simulacion',
      kind: 'Simulator output',
      status: simulationResult ? 'Listo' : 'Pendiente',
      detail: simulationResult
        ? `${simulationResult.commandCount} comando(s) verificados · ${simulationResult.simulatorId}`
        : 'Simula el plan compilado para generar este artifact.',
    },
    {
      id: traceArtifact?.id ?? 'runtime-trace-pending',
      title: 'Trace runtime',
      kind: 'Trace',
      status:
        activeSession && activeSession.trace.length > 0 ? 'Listo' : 'Pendiente',
      detail: `${activeSession?.trace.length ?? 0} entrada(s) · ${
        activeSession?.diagnostics.length ?? 0
      } diagnostico(s)`,
    },
  ];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge>BotLab alpha</Badge>
              <Badge variant="secondary">Nx monorepo</Badge>
              <Badge variant="outline">React + TypeScript</Badge>
            </div>
            <h1 className="text-4xl font-semibold tracking-normal text-foreground md:text-5xl">
              Laboratorio visual para robots programables
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Una base local para diseñar comportamientos por bloques,
              ejecutarlos sobre un runtime comun y conectar robots reales o
              simulados mediante adapters.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => sendFlow({ type: 'demo.run' })}
              disabled={!flowSnapshot.can({ type: 'demo.run' })}
            >
              <Play className="h-4 w-4" />
              {isRunningDemo ? 'Ejecutando' : 'Ejecutar demo'}
            </Button>
            <Button variant="secondary">
              <Blocks className="h-4 w-4" />
              Abrir editor
            </Button>
            <Button
              variant="secondary"
              onClick={() => sendFlow({ type: 'workspace.validate' })}
              disabled={!flowSnapshot.can({ type: 'workspace.validate' })}
            >
              <ShieldCheck className="h-4 w-4" />
              Validar workspace
            </Button>
            <Button
              variant="secondary"
              onClick={() => sendFlow({ type: 'build.compile' })}
              disabled={
                !flowSnapshot.can({ type: 'build.compile' }) ||
                !selectedTargetCanRunDemo
              }
            >
              <Cpu className="h-4 w-4" />
              {isCompiling ? 'Compilando' : 'Compilar demo'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => sendFlow({ type: 'simulation.run' })}
              disabled={!flowSnapshot.can({ type: 'simulation.run' })}
            >
              <Radar className="h-4 w-4" />
              {isSimulating ? 'Simulando' : 'Simular demo'}
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[1.35fr_0.65fr]">
        <BlocksEditorShell
          workspaceName="Editor de bloques BotLab"
          artifact={workspaceArtifact}
          blocks={[
            'al iniciar robot',
            'fijar LEDs MicroDuck',
            'esperar capacidad',
            'publicar artefacto',
          ]}
          onArtifactChange={(artifact) =>
            sendFlow({ type: 'workspace.changed', artifact })
          }
        />

        <aside className="space-y-4">
          <Panel title="Editor">
            <Metric
              label="Estado"
              value={workspaceStatusLabels[workspaceArtifact.status]}
            />
            <Metric label="Artifact" value={workspaceArtifact.id} />
            <Metric label="Formato" value={workspaceArtifact.format} />
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {workspaceMessage}
            </p>
          </Panel>

          <Panel title="Build">
            <Metric
              label="Estado"
              value={botLabBuildStateLabels[flowState.build]}
            />
            <Metric
              label="Plan"
              value={compiledArtifact?.id ?? 'Sin compilar'}
            />
            <CompiledCommandCard
              commandId={compiledCommand?.commandId}
              targetName={compiledTargetName}
              pattern={compiledPattern}
              brightness={compiledBrightness}
            />
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {buildMessage}
            </p>
          </Panel>

          <Panel title="Simulador">
            <Metric
              label="Estado"
              value={botLabSimulationStateLabels[flowState.simulation]}
            />
            <Metric
              label="Destino"
              value={selectedTarget?.name ?? 'Sin seleccionar'}
            />
            <Metric
              label="Simulador"
              value={simulationResult?.simulatorId ?? 'Sin ejecutar'}
            />
            <Metric
              label="Comandos"
              value={simulationResult?.commandCount.toString() ?? '0'}
            />
            <RuntimeList
              icon={<Cpu className="h-4 w-4 text-primary" />}
              label="Verificacion"
              value={
                compiledCommand
                  ? `${compiledCommand.commandId} · ${formatLedPattern(
                      compiledPattern
                    )} · brillo ${compiledBrightness ?? 0}`
                  : 'Compila el workspace para preparar la simulacion.'
              }
            />
            <RuntimeList
              icon={<Radar className="h-4 w-4 text-primary" />}
              label="Assets oficiales"
              value={`${simulatorAssetSummary.ready} listos · ${
                simulatorAssetSummary.pendingReview
              } pendientes de revision · ${microDuckSimulatorAssetManifest.upstreamRevision.slice(
                0,
                8
              )}`}
            />
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {simulationMessage}
            </p>
          </Panel>

          <Panel title="Artifacts">
            <div className="grid gap-3">
              {artifactCards.map((artifact) => (
                <ArtifactCard key={artifact.title} artifact={artifact} />
              ))}
            </div>
          </Panel>

          <Panel title="Policy">
            <Metric
              label="Decision"
              value={
                policyEvaluation
                  ? policyDecisionLabels[policyEvaluation.decision]
                  : 'Sin evaluar'
              }
            />
            <Metric
              label="Estado"
              value={
                policyEvaluation
                  ? policyConfirmed
                    ? 'Confirmacion aplicada'
                    : 'Pendiente de confirmacion'
                  : 'Esperando compilacion'
              }
            />
            <Metric
              label="Reglas"
              value={
                policyEvaluation?.ruleIds.length
                  ? policyEvaluation.ruleIds.join(', ')
                  : 'Sin reglas'
              }
            />
            <div className="mt-3 space-y-2">
              {(policyEvaluation?.messages.length
                ? policyEvaluation.messages
                : ['Compila la demo para evaluar las politicas.']
              ).map((message) => (
                <p
                  key={message}
                  className="rounded-md border bg-background p-3 text-sm leading-6 text-muted-foreground"
                >
                  {message}
                </p>
              ))}
            </div>
          </Panel>

          <Panel title="Runtime">
            <Metric
              label="Target activo"
              value={selectedTarget?.name ?? 'Sin seleccionar'}
            />
            <Metric label="Targets" value={targets.length.toString()} />
            <Metric
              label="Capabilities"
              value={capabilities.length.toString()}
            />
            <Metric
              label="Simulators"
              value={runtime.listSimulatorIntegrations().length.toString()}
            />
            <Metric
              label="Sesiones activas"
              value={runtimeSnapshot.activeSessionCount.toString()}
            />
            <div className="mt-4 rounded-md border bg-background p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Sesion demo</span>
                <Badge variant="secondary">
                  {
                    runtimeStateLabels[
                      runtimeSnapshot.sessions[0]?.state ?? 'created'
                    ]
                  }
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {runMessage}
              </p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <RuntimeList
                icon={<GitBranch className="h-4 w-4 text-primary" />}
                label="Cola"
                value={
                  queue.entries.length > 0
                    ? queue.entries
                        .map(
                          (entry) =>
                            `${entry.sessionId} · prioridad ${entry.priority}`
                        )
                        .join(', ')
                    : 'Sin sesiones en cola'
                }
              />
              <RuntimeList
                icon={<Lock className="h-4 w-4 text-primary" />}
                label="Locks"
                value={
                  queue.capabilityLocks.length > 0
                    ? queue.capabilityLocks
                        .map(
                          (lock) => `${lock.capabilityId} por ${lock.sessionId}`
                        )
                        .join(', ')
                    : 'Sin capacidades bloqueadas'
                }
              />
            </div>
            <div className="mt-3 rounded-md border bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Flujo workspace</span>
                <Badge variant="outline">
                  {botLabWorkspaceStateLabels[flowState.workspace]}
                </Badge>
              </div>
              <FlowRail
                steps={botLabWorkspaceSteps}
                activeState={flowState.workspace}
              />
            </div>
            <div className="mt-3 rounded-md border bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Flujo compilación</span>
                <Badge variant="outline">
                  {botLabBuildStateLabels[flowState.build]}
                </Badge>
              </div>
              <FlowRail
                steps={botLabBuildSteps}
                activeState={flowState.build}
              />
            </div>
            <div className="mt-3 rounded-md border bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Flujo simulación</span>
                <Badge variant="outline">
                  {botLabSimulationStateLabels[flowState.simulation]}
                </Badge>
              </div>
              <FlowRail
                steps={botLabSimulationSteps}
                activeState={flowState.simulation}
              />
            </div>
            <div className="mt-3 rounded-md border bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Flujo ejecución</span>
                <Badge variant="outline">
                  {botLabExecutionStateLabels[flowState.execution]}
                </Badge>
              </div>
              <FlowRail
                steps={botLabExecutionSteps}
                activeState={flowState.execution}
              />
            </div>
          </Panel>

          <Panel title="Targets">
            <div className="mb-3 rounded-md border bg-background p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Destino activo</span>
                <Badge>
                  {targetKindLabels[selectedTarget?.kind ?? 'simulator']}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {selectedTarget?.name ?? 'Selecciona un target'} ·{' '}
                {selectedCapabilities.length} capacidad(es) compatibles
              </p>
            </div>
            <div className="space-y-3">
              {targets.map((target) => {
                const isSelected = target.id === selectedTargetId;
                const compatibleCapabilities = capabilities.filter(
                  (capability) => capability.targetIds.includes(target.id)
                );
                const canRunDemo =
                  target.status === 'available' &&
                  compatibleCapabilities.some(
                    (capability) => capability.id === 'microduck-leds'
                  );

                return (
                  <button
                    key={target.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() =>
                      sendFlow({ type: 'target.selected', targetId: target.id })
                    }
                    className={`w-full rounded-md border bg-background p-3 text-left transition-colors hover:border-primary/60 ${
                      isSelected ? 'border-primary ring-2 ring-primary/20' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{target.name}</span>
                      <Badge
                        variant={
                          isSelected
                            ? 'default'
                            : target.status === 'available'
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {isSelected
                          ? 'Seleccionado'
                          : targetStatusLabels[target.status]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {targetKindLabels[target.kind]} ·{' '}
                      {target.profile?.connection.defaultMode ?? 'manual'}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {canRunDemo
                        ? `${compatibleCapabilities.length} capacidad(es) listas para la demo.`
                        : 'Planificado o no compatible con la demo MicroDuck actual.'}
                    </p>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Runtime log">
            <RuntimeLogSection
              title="Eventos"
              emptyMessage="Sin eventos recientes"
              items={recentEvents.map((event) => ({
                id: event.id,
                label: runtimeEventLabels[event.type],
                detail: event.message,
              }))}
            />
            <RuntimeLogSection
              title="Trace"
              emptyMessage="Sin trace de sesion"
              items={recentTrace.map((entry) => ({
                id: entry.id,
                label: runtimeTraceLabels[entry.category],
                detail: entry.message,
              }))}
            />
            <RuntimeLogSection
              title="Diagnosticos"
              emptyMessage="Sin diagnosticos"
              items={diagnostics.map((diagnostic) => ({
                id: diagnostic.id,
                label: runtimeDiagnosticLabels[diagnostic.category],
                detail: diagnostic.message,
              }))}
            />
          </Panel>

          <Panel title="Historial">
            <div className="space-y-2">
              {flowLog.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md border bg-background p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">
                      {flowLogLabels[entry.category]}
                    </span>
                    <Badge
                      variant={
                        entry.category === 'error' ? 'outline' : 'secondary'
                      }
                    >
                      {entry.id.replace('flow-log-', '#')}
                    </Badge>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {entry.message}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-10">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featuredConcepts.map(({ concept, description }) => {
            const Icon = conceptIcons[concept as keyof typeof conceptIcons];

            return (
              <article key={concept} className="rounded-lg border bg-card p-4">
                <Icon className="mb-4 h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold capitalize">
                  {concept}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

export default App;

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 flex items-center justify-between rounded-md bg-muted px-3 py-2 last:mb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function CompiledCommandCard({
  commandId,
  targetName,
  pattern,
  brightness,
}: {
  commandId?: string;
  targetName?: string;
  pattern?: string;
  brightness?: number;
}) {
  if (!commandId) {
    return (
      <div className="rounded-md border bg-background p-3">
        <div className="mb-2 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Comando generado</span>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Todavia no hay comando. Compila el workspace para ver que produce el
          bloque.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Cpu className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium">Comando generado</span>
        </div>
        <Badge variant="secondary">{commandId}</Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
        <CommandFact label="Destino" value={targetName ?? 'Sin target'} />
        <CommandFact label="Patron" value={formatLedPattern(pattern)} />
        <CommandFact
          label="Brillo"
          value={brightness === undefined ? 'Sin dato' : brightness.toString()}
        />
      </div>
    </div>
  );
}

function CommandFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

const workspaceStatusLabels = {
  empty: 'Vacio',
  loaded: 'Cargado',
  dirty: 'Editado',
  invalid: 'Invalido',
  'read-only': 'Solo lectura',
};

const runtimeStateLabels = {
  created: 'Creada',
  queued: 'En cola',
  ready: 'Lista',
  'awaiting-confirmation': 'Pendiente',
  running: 'Ejecutando',
  paused: 'Pausada',
  stopped: 'Completada',
  error: 'Error',
  disposed: 'Cerrada',
};

const flowLogLabels = {
  target: 'Target',
  workspace: 'Workspace',
  build: 'Build',
  simulation: 'Simulacion',
  execution: 'Ejecucion',
  error: 'Error',
};

const targetKindLabels = {
  robot: 'Hardware',
  simulator: 'Simulador',
};

const targetStatusLabels = {
  available: 'Disponible',
  planned: 'Planificado',
  offline: 'Offline',
};

const artifactKindLabels = {
  blocks: 'Blocks workspace',
  'compiled-plan': 'Compiled plan',
  log: 'Log',
  trace: 'Trace',
  'simulator-output': 'Simulator output',
};

const policyDecisionLabels = {
  allow: 'Permitida',
  deny: 'Denegada',
  warn: 'Aviso',
  'require-confirmation': 'Requiere confirmacion',
};

const ledPatternLabels: Record<string, string> = {
  blink: 'parpadeo',
  off: 'apagado',
  smile: 'sonrisa',
  solid: 'solido',
};

const runtimeEventLabels = {
  'session-created': 'Sesion creada',
  'artifact-loaded': 'Artifact cargado',
  'policy-evaluated': 'Politica evaluada',
  'policy-confirmed': 'Politica confirmada',
  'session-queued': 'Sesion en cola',
  'session-dequeued': 'Sesion iniciada',
  'session-started': 'Runtime iniciado',
  'command-dispatched': 'Comando enviado',
  'session-paused': 'Sesion pausada',
  'session-resumed': 'Sesion reanudada',
  'session-stopped': 'Sesion completada',
  'session-disposed': 'Sesion cerrada',
  'runtime-error': 'Error runtime',
};

const runtimeTraceLabels = {
  lifecycle: 'Lifecycle',
  load: 'Load',
  policy: 'Policy',
  scheduler: 'Scheduler',
  arbitration: 'Arbitration',
  dispatch: 'Dispatch',
  validation: 'Validation',
  error: 'Error',
};

const runtimeDiagnosticLabels = {
  validation: 'Validation',
  policy: 'Policy',
  adapter: 'Adapter',
  transport: 'Transport',
  scheduler: 'Scheduler',
  arbitration: 'Arbitration',
  simulator: 'Simulator',
  lifecycle: 'Lifecycle',
};

function RuntimeList({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{value}</p>
    </div>
  );
}

function ArtifactCard({
  artifact,
}: {
  artifact: {
    id: string;
    title: string;
    kind: string;
    status: string;
    detail: string;
  };
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileCode className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium">{artifact.title}</span>
        </div>
        <Badge
          variant={artifact.status === 'Pendiente' ? 'outline' : 'secondary'}
        >
          {artifact.status}
        </Badge>
      </div>
      <p className="truncate text-sm font-medium text-foreground">
        {artifact.id}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {artifact.kind} · {artifact.detail}
      </p>
    </div>
  );
}

function RuntimeLogSection({
  title,
  emptyMessage,
  items,
}: {
  title: string;
  emptyMessage: string;
  items: Array<{ id: string; label: string; detail: string }>;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{title}</span>
        <Badge variant="outline">{items.length}</Badge>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-md border bg-background p-3">
              <div className="mb-1 text-sm font-medium">{item.label}</div>
              <p className="text-sm leading-6 text-muted-foreground">
                {item.detail}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FlowRail<TState extends string>({
  steps,
  activeState,
}: {
  steps: Array<{ state: TState; label: string }>;
  activeState: TState;
}) {
  return (
    <div className="grid gap-2">
      {steps.map((step) => {
        const isActive = step.state === activeState;

        return (
          <div
            key={step.state}
            className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
              isActive
                ? 'border-primary bg-primary/10 text-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isActive ? 'bg-primary' : 'bg-muted-foreground/40'
              }`}
            />
            <span className="font-medium">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function formatLedPattern(pattern: string | undefined) {
  if (!pattern) {
    return 'Sin patron';
  }

  return ledPatternLabels[pattern] ?? pattern;
}

function summarizeMicroDuckSimulatorAssetPlan(
  plan: ReturnType<typeof createMicroDuckSimulatorAssetCachePlan>
) {
  return plan.entries.reduce(
    (summary, entry) => {
      if (entry.status === 'ready') {
        summary.ready += 1;
      }

      if (entry.status === 'pending-review') {
        summary.pendingReview += 1;
      }

      if (entry.status === 'blocked') {
        summary.blocked += 1;
      }

      return summary;
    },
    {
      ready: 0,
      pendingReview: 0,
      blocked: 0,
    }
  );
}
