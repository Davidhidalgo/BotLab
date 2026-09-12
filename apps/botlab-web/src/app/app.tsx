import { BlocksEditorShell } from '@botlab/blocks';
import { botLabConcepts } from '@botlab/model';
import {
  createMicroDuckSimulatorAssetCachePlan,
  loadMicroDuckOfficialSimulatorHost,
  microDuckSimulatorAssetManifest,
  postMicroDuckSimulatorControlSource,
  type MicroDuckSimulatorControlSource,
  type MicroDuckOfficialSimulatorHostResult,
  type MicroDuckOfficialSimulatorHostState,
  type MicroDuckOfficialSimulatorSource,
} from '@botlab/simulators-microduck';
import { Badge, Button } from '@botlab/ui';
import { useMachine } from '@xstate/react';
import {
  Activity,
  Blocks,
  Cpu,
  Download,
  FileCode,
  GitBranch,
  Lock,
  Play,
  Radar,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  botLabBuildSteps,
  botLabExecutionSteps,
  botLabFlowMachine,
  botLabSimulationSteps,
  botLabWorkspaceSteps,
  type BotLabBuildState,
  type BotLabExecutionState,
  type BotLabSimulationResult,
  type BotLabSimulationState,
  type BotLabWorkspaceState,
} from './botlab-flow-machine';
import {
  botLabLocales,
  botLabTranslations,
  type BotLabLocale,
} from './i18n';

const featuredConcepts = botLabConcepts.filter(({ concept }) =>
  ['policy', 'skill', 'behavior', 'arbitration'].includes(concept)
);

const conceptIcons = {
  policy: ShieldCheck,
  skill: Cpu,
  behavior: Workflow,
  arbitration: GitBranch,
};

const microDuckOfficialSimulatorPreviewUrl =
  'http://127.0.0.1:4300/?boot=1';
export const microDuckSimulatorDeliveryDelays = [
  0, 1000, 3000, 8000, 15000,
] as const;
export const microDuckSimulatorPreviewLoadTimeoutMs = 30000;

type BotLabCopy = (typeof botLabTranslations)[BotLabLocale];

export function scheduleMicroDuckSimulatorControlSourceDelivery(
  targetWindow: Pick<Window, 'postMessage'>,
  controlSource: MicroDuckSimulatorControlSource,
  targetOrigin: string
) {
  return microDuckSimulatorDeliveryDelays.map((delay) =>
    window.setTimeout(() => {
      postMicroDuckSimulatorControlSource(
        targetWindow,
        controlSource,
        targetOrigin
      );
    }, delay)
  );
}

export function App() {
  const [flowSnapshot, sendFlow] = useMachine(botLabFlowMachine);
  const [locale, setLocale] = useState<BotLabLocale>('ca');
  const [officialSimulatorHostResult, setOfficialSimulatorHostResult] =
    useState<MicroDuckOfficialSimulatorHostResult>();
  const [officialSimulatorFrameReady, setOfficialSimulatorFrameReady] =
    useState(false);
  const [postedSimulatorArtifactId, setPostedSimulatorArtifactId] =
    useState<string>();
  const officialSimulatorFrameRef = useRef<HTMLIFrameElement>(null);
  const copy = botLabTranslations[locale];
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
  const officialSimulatorHostState =
    officialSimulatorHostResult?.state ??
    resolveMicroDuckOfficialSimulatorHostState({
      assetLoadable: simulatorAssetPlan.loadable,
      simulationState: flowState.simulation,
      simulatorOutputReady: Boolean(simulationResult?.outputArtifact),
    });
  const officialSimulatorHostMessages =
    officialSimulatorHostResult?.messages ?? [];
  const localizedWorkspaceSteps = botLabWorkspaceSteps.map(({ state }) => ({
    state,
    label: getWorkspaceFlowStateLabel(state, copy),
  }));
  const localizedBuildSteps = botLabBuildSteps.map(({ state }) => ({
    state,
    label: getBuildStateLabel(state, copy),
  }));
  const localizedSimulationSteps = botLabSimulationSteps.map(({ state }) => ({
    state,
    label: getSimulationStateLabel(state, copy),
  }));
  const localizedExecutionSteps = botLabExecutionSteps.map(({ state }) => ({
    state,
    label: getExecutionStateLabel(state, copy),
  }));
  useEffect(() => {
    const controlSource = officialSimulatorHostResult?.controlSource;
    const targetWindow = officialSimulatorFrameRef.current?.contentWindow;

    if (
      officialSimulatorHostResult?.state !== 'running' ||
      !officialSimulatorFrameReady ||
      !controlSource ||
      !targetWindow ||
      postedSimulatorArtifactId === controlSource.artifactId
    ) {
      return;
    }

    const targetOrigin = new URL(microDuckOfficialSimulatorPreviewUrl).origin;
    const deliveryTimers = scheduleMicroDuckSimulatorControlSourceDelivery(
      targetWindow,
      controlSource,
      targetOrigin
    );

    setPostedSimulatorArtifactId(controlSource.artifactId);
    setOfficialSimulatorHostResult({
      ...officialSimulatorHostResult,
      messages: [
        ...officialSimulatorHostResult.messages,
        `Sent ${controlSource.frames.length} BotLab control frame(s) to the BotLab-enabled simulator host.`,
      ],
    });

    return () => {
      deliveryTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [
    officialSimulatorFrameReady,
    officialSimulatorHostResult,
    postedSimulatorArtifactId,
  ]);
  useEffect(() => {
    if (
      officialSimulatorHostResult?.state !== 'running' ||
      officialSimulatorFrameReady
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      failOfficialSimulatorRuntimePreview(copy.host.previewLoadTimeoutMessage);
    }, microDuckSimulatorPreviewLoadTimeoutMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    copy.host.previewLoadTimeoutMessage,
    officialSimulatorFrameReady,
    officialSimulatorHostResult?.state,
  ]);
  async function loadOfficialSimulatorRuntimePreview() {
    setOfficialSimulatorHostResult({
      state: 'loading',
      messages: ['Preparing official runtime in educational preview mode.'],
    });
    setOfficialSimulatorFrameReady(false);
    setPostedSimulatorArtifactId(undefined);

    try {
      const result = await loadMicroDuckOfficialSimulatorHost({
        assetPlan: simulatorAssetPlan,
        artifact: compiledArtifact,
        loadRuntime: createMicroDuckOfficialSimulatorPreviewRuntime,
        getVelocityLimits: () => [2, -1, 3],
      });

      setOfficialSimulatorHostResult(result);
    } catch (error) {
      setOfficialSimulatorHostResult({
        state: 'failed',
        messages: [
          error instanceof Error
            ? error.message
            : 'Could not load the official runtime.',
        ],
      });
    }
  }
  function failOfficialSimulatorRuntimePreview(message: string) {
    setOfficialSimulatorFrameReady(false);
    setOfficialSimulatorHostResult((current) => ({
      state: 'failed',
      messages: current ? [...current.messages, message] : [message],
    }));
  }

  function disconnectOfficialSimulatorRuntimePreview() {
    officialSimulatorHostResult?.connection?.disconnect();
    setOfficialSimulatorFrameReady(false);
    setPostedSimulatorArtifactId(undefined);
    setOfficialSimulatorHostResult({
      state: 'disconnected',
      messages: [copy.host.disconnectedMessage],
    });
  }
  const artifactCards = [
    {
      id: workspaceArtifact.id,
      title: 'Workspace',
      kind: getArtifactKindLabel(workspaceArtifact.kind, copy),
      status: getWorkspaceArtifactStatusLabel(workspaceArtifact.status, copy),
      pending: false,
      detail: `${workspaceArtifact.engine} · ${workspaceArtifact.format}`,
    },
    {
      id: compiledArtifact?.id ?? 'compiled-plan-pending',
      title: copy.messages.planCompiled,
      kind: getArtifactKindLabel('compiled-plan', copy),
      status: compiledArtifact ? copy.status.ready : copy.status.pending,
      pending: !compiledArtifact,
      detail: compiledArtifact
        ? `${compiledArtifact.commands.length} ${copy.labels.commands.toLowerCase()} · ${
            selectedTarget?.name ?? compiledArtifact.targetId
          }`
        : copy.messages.compileArtifact,
    },
    {
      id: simulationResult?.artifactId ?? 'simulation-output-pending',
      title: copy.messages.outputSimulation,
      kind: getArtifactKindLabel('simulator-output', copy),
      status: simulationResult ? copy.status.ready : copy.status.pending,
      pending: !simulationResult,
      detail: simulationResult
        ? `${simulationResult.commandCount} ${copy.labels.commands.toLowerCase()} · ${simulationResult.outputArtifact.snapshot.state}`
        : copy.messages.simulateArtifact,
    },
    {
      id: traceArtifact?.id ?? 'runtime-trace-pending',
      title: 'Trace runtime',
      kind: getArtifactKindLabel('trace', copy),
      status:
        activeSession && activeSession.trace.length > 0
          ? copy.status.ready
          : copy.status.pending,
      pending: !activeSession || activeSession.trace.length === 0,
      detail: `${activeSession?.trace.length ?? 0} entrada(es) · ${
        activeSession?.diagnostics.length ?? 0
      } diagnostic(s)`,
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
              {copy.heroTitle}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              {copy.heroSubtitle}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
              <span className="text-muted-foreground">{copy.language}</span>
              <select
                value={locale}
                onChange={(event) =>
                  setLocale(event.target.value as BotLabLocale)
                }
                className="bg-transparent font-medium outline-none"
                aria-label={copy.language}
              >
                {botLabLocales.map((language) => (
                  <option key={language.id} value={language.id}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              onClick={() => sendFlow({ type: 'demo.run' })}
              disabled={!flowSnapshot.can({ type: 'demo.run' })}
            >
              <Play className="h-4 w-4" />
              {isRunningDemo ? copy.running : copy.runDemo}
            </Button>
            <Button variant="secondary">
              <Blocks className="h-4 w-4" />
              {copy.openEditor}
            </Button>
            <Button
              variant="secondary"
              onClick={() => sendFlow({ type: 'workspace.validate' })}
              disabled={!flowSnapshot.can({ type: 'workspace.validate' })}
            >
              <ShieldCheck className="h-4 w-4" />
              {copy.validateWorkspace}
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
              {isCompiling ? copy.compiling : copy.compileDemo}
            </Button>
            <Button
              variant="secondary"
              onClick={() => sendFlow({ type: 'simulation.run' })}
              disabled={!flowSnapshot.can({ type: 'simulation.run' })}
            >
              <Radar className="h-4 w-4" />
              {isSimulating ? copy.simulating : copy.simulateDemo}
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <BlocksEditorShell
            workspaceName={copy.blocks.workspaceName}
            labels={copy.blocks}
            status={getWorkspaceArtifactStatusLabel(
              workspaceArtifact.status,
              copy
            )}
            artifact={workspaceArtifact}
            blocks={[...copy.blocks.palette]}
            onArtifactChange={(artifact) =>
              sendFlow({ type: 'workspace.changed', artifact })
            }
          />

          <MicroDuckSimulatorHost
            targetName={selectedTarget?.name ?? copy.empty.noTarget}
            assetReady={simulatorAssetPlan.ready}
            assetPlan={simulatorAssetPlan}
            assetSummary={simulatorAssetSummary}
            compiledCommandId={compiledCommand?.commandId}
            hostState={officialSimulatorHostState}
            hostMessages={officialSimulatorHostMessages}
            onDisconnectRuntime={disconnectOfficialSimulatorRuntimePreview}
            onLoadRuntime={loadOfficialSimulatorRuntimePreview}
            onPreviewFailed={() =>
              failOfficialSimulatorRuntimePreview(
                copy.host.previewLoadErrorMessage
              )
            }
            onPreviewLoaded={() => setOfficialSimulatorFrameReady(true)}
            previewUrl={microDuckOfficialSimulatorPreviewUrl}
            previewRef={officialSimulatorFrameRef}
            simulatorOutput={simulationResult?.outputArtifact}
            simulationState={getSimulationStateLabel(
              flowState.simulation,
              copy
            )}
            simulationMessage={translateFlowMessage(simulationMessage, copy)}
            copy={copy}
          />
        </div>

        <aside className="space-y-4">
          <Panel title={copy.panels.editor}>
            <Metric
              label={copy.labels.state}
              value={getWorkspaceArtifactStatusLabel(
                workspaceArtifact.status,
                copy
              )}
            />
            <Metric label={copy.labels.artifact} value={workspaceArtifact.id} />
            <Metric label={copy.labels.format} value={workspaceArtifact.format} />
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {translateFlowMessage(workspaceMessage, copy)}
            </p>
          </Panel>

          <Panel title={copy.panels.build}>
            <Metric
              label={copy.labels.state}
              value={getBuildStateLabel(flowState.build, copy)}
            />
            <Metric
              label={copy.labels.plan}
              value={compiledArtifact?.id ?? copy.empty.noCompiledPlan}
            />
            <CompiledCommandCard
              commandId={compiledCommand?.commandId}
              copy={copy}
              targetName={compiledTargetName}
              pattern={compiledPattern}
              brightness={compiledBrightness}
            />
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {translateFlowMessage(buildMessage, copy)}
            </p>
          </Panel>

          <Panel title={copy.panels.simulator}>
            <Metric
              label={copy.labels.state}
              value={getSimulationStateLabel(flowState.simulation, copy)}
            />
            <Metric
              label={copy.labels.destination}
              value={selectedTarget?.name ?? copy.empty.noSelection}
            />
            <Metric
              label={copy.labels.simulator}
              value={simulationResult?.simulatorId ?? copy.empty.noSimulatorRun}
            />
            <Metric
              label={copy.labels.commands}
              value={simulationResult?.commandCount.toString() ?? '0'}
            />
            <RuntimeList
              icon={<Cpu className="h-4 w-4 text-primary" />}
              label={copy.labels.verification}
              value={
                compiledCommand
                  ? `${compiledCommand.commandId} · ${formatLedPattern(
                      compiledPattern,
                      copy
                    )} · ${copy.labels.brightness.toLowerCase()} ${
                      compiledBrightness ?? 0
                    }`
                  : copy.empty.noGeneratedCommand
              }
            />
            <RuntimeList
              icon={<Radar className="h-4 w-4 text-primary" />}
              label={copy.labels.officialAssets}
              value={`${simulatorAssetSummary.ready} ${copy.status.ready.toLowerCase()} · ${
                simulatorAssetSummary.pendingReview
              } ${copy.status.pending.toLowerCase()} ${copy.status.review.toLowerCase()} · ${microDuckSimulatorAssetManifest.upstreamRevision.slice(
                0,
                8
              )}`}
            />
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {translateFlowMessage(simulationMessage, copy)}
            </p>
          </Panel>

          <Panel title={copy.panels.artifacts}>
            <div className="grid gap-3">
              {artifactCards.map((artifact) => (
                <ArtifactCard key={artifact.title} artifact={artifact} />
              ))}
            </div>
          </Panel>

          <Panel title={copy.panels.policy}>
            <Metric
              label={copy.labels.decision}
              value={
                policyEvaluation
                  ? getPolicyDecisionLabel(policyEvaluation.decision, copy)
                  : copy.empty.noData
              }
            />
            <Metric
              label={copy.labels.state}
              value={
                policyEvaluation
                  ? policyConfirmed
                    ? copy.status.confirmationApplied
                    : copy.status.awaiting
                  : copy.status.waitingCompile
              }
            />
            <Metric
              label={copy.labels.rules}
              value={
                policyEvaluation?.ruleIds.length
                  ? policyEvaluation.ruleIds.join(', ')
                  : copy.empty.noRules
              }
            />
            <div className="mt-3 space-y-2">
              {(policyEvaluation?.messages.length
                ? policyEvaluation.messages
                : [copy.messages.compilePolicies]
              ).map((message) => (
                <p
                  key={message}
                  className="rounded-md border bg-background p-3 text-sm leading-6 text-muted-foreground"
                >
                  {translateFlowMessage(message, copy)}
                </p>
              ))}
            </div>
          </Panel>

          <Panel title={copy.panels.runtime}>
            <Metric
              label={copy.labels.activeTarget}
              value={selectedTarget?.name ?? copy.empty.noSelection}
            />
            <Metric label={copy.labels.targets} value={targets.length.toString()} />
            <Metric
              label={copy.labels.capabilities}
              value={capabilities.length.toString()}
            />
            <Metric
              label={copy.labels.simulators}
              value={runtime.listSimulatorIntegrations().length.toString()}
            />
            <Metric
              label={copy.labels.activeSessions}
              value={runtimeSnapshot.activeSessionCount.toString()}
            />
            <div className="mt-4 rounded-md border bg-background p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {copy.labels.demoSession}
                </span>
                <Badge variant="secondary">
                  {
                    getRuntimeStateLabel(
                      runtimeSnapshot.sessions[0]?.state ?? 'created',
                      copy
                    )
                  }
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {translateFlowMessage(runMessage, copy)}
              </p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <RuntimeList
                icon={<GitBranch className="h-4 w-4 text-primary" />}
                label={copy.labels.queue}
                value={
                  queue.entries.length > 0
                    ? queue.entries
                        .map(
                          (entry) =>
                            `${entry.sessionId} · ${copy.labels.priority} ${entry.priority}`
                        )
                        .join(', ')
                    : copy.empty.noQueue
                }
              />
              <RuntimeList
                icon={<Lock className="h-4 w-4 text-primary" />}
                label={copy.labels.locks}
                value={
                  queue.capabilityLocks.length > 0
                    ? queue.capabilityLocks
                        .map(
                          (lock) =>
                            `${lock.capabilityId} ${copy.labels.by} ${lock.sessionId}`
                        )
                        .join(', ')
                    : copy.empty.noLocks
                }
              />
            </div>
            <div className="mt-3 rounded-md border bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {copy.labels.workspaceFlow}
                </span>
                <Badge variant="outline">
                  {getWorkspaceFlowStateLabel(flowState.workspace, copy)}
                </Badge>
              </div>
              <FlowRail
                steps={localizedWorkspaceSteps}
                activeState={flowState.workspace}
              />
            </div>
            <div className="mt-3 rounded-md border bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {copy.labels.buildFlow}
                </span>
                <Badge variant="outline">
                  {getBuildStateLabel(flowState.build, copy)}
                </Badge>
              </div>
              <FlowRail
                steps={localizedBuildSteps}
                activeState={flowState.build}
              />
            </div>
            <div className="mt-3 rounded-md border bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {copy.labels.simulationFlow}
                </span>
                <Badge variant="outline">
                  {getSimulationStateLabel(flowState.simulation, copy)}
                </Badge>
              </div>
              <FlowRail
                steps={localizedSimulationSteps}
                activeState={flowState.simulation}
              />
            </div>
            <div className="mt-3 rounded-md border bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {copy.labels.executionFlow}
                </span>
                <Badge variant="outline">
                  {getExecutionStateLabel(flowState.execution, copy)}
                </Badge>
              </div>
              <FlowRail
                steps={localizedExecutionSteps}
                activeState={flowState.execution}
              />
            </div>
          </Panel>

          <Panel title={copy.panels.targets}>
            <div className="mb-3 rounded-md border bg-background p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {copy.labels.activeDestination}
                </span>
                <Badge>
                  {getTargetKindLabel(selectedTarget?.kind ?? 'simulator', copy)}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {selectedTarget?.name ?? copy.empty.noSelection} ·{' '}
                {selectedCapabilities.length} {copy.labels.capabilities}
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
                          ? copy.status.selected
                          : getTargetStatusLabel(target.status, copy)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {getTargetKindLabel(target.kind, copy)} ·{' '}
                      {target.profile?.connection.defaultMode ?? 'manual'}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {canRunDemo
                        ? `${compatibleCapabilities.length} ${copy.messages.targetCanRunDemo}`
                        : copy.messages.targetNotCompatible}
                    </p>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title={copy.panels.runtimeLog}>
            <RuntimeLogSection
              title={copy.labels.events}
              emptyMessage={copy.empty.noEvents}
              items={recentEvents.map((event) => ({
                id: event.id,
                label: getRuntimeEventLabel(event.type, copy),
                detail: translateFlowMessage(event.message, copy),
              }))}
            />
            <RuntimeLogSection
              title={copy.labels.trace}
              emptyMessage={copy.empty.noTrace}
              items={recentTrace.map((entry) => ({
                id: entry.id,
                label: runtimeTraceLabels[entry.category],
                detail: translateFlowMessage(entry.message, copy),
              }))}
            />
            <RuntimeLogSection
              title={copy.labels.diagnostics}
              emptyMessage={copy.empty.noDiagnostics}
              items={diagnostics.map((diagnostic) => ({
                id: diagnostic.id,
                label: runtimeDiagnosticLabels[diagnostic.category],
                detail: translateFlowMessage(diagnostic.message, copy),
              }))}
            />
          </Panel>

          <Panel title={copy.panels.history}>
            <div className="space-y-2">
              {flowLog.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md border bg-background p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">
                      {getFlowLogLabel(entry.category, copy)}
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
                    {translateFlowMessage(entry.message, copy)}
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
  copy,
  targetName,
  pattern,
  brightness,
}: {
  commandId?: string;
  copy: BotLabCopy;
  targetName?: string;
  pattern?: string;
  brightness?: number;
}) {
  if (!commandId) {
    return (
      <div className="rounded-md border bg-background p-3">
        <div className="mb-2 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            {copy.labels.generatedCommand}
          </span>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.empty.noGeneratedCommand}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Cpu className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium">
            {copy.labels.generatedCommand}
          </span>
        </div>
        <Badge variant="secondary">{commandId}</Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
        <CommandFact label={copy.labels.destination} value={targetName ?? copy.empty.noTarget} />
        <CommandFact label={copy.labels.pattern} value={formatLedPattern(pattern, copy)} />
        <CommandFact
          label={copy.labels.brightness}
          value={brightness === undefined ? copy.empty.noData : brightness.toString()}
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

function MicroDuckSimulatorHost({
  targetName,
  assetReady,
  assetPlan,
  assetSummary,
  compiledCommandId,
  hostState,
  hostMessages,
  onDisconnectRuntime,
  onLoadRuntime,
  onPreviewFailed,
  onPreviewLoaded,
  previewUrl,
  previewRef,
  simulatorOutput,
  simulationState,
  simulationMessage,
  copy,
}: {
  targetName: string;
  assetReady: boolean;
  assetPlan: ReturnType<typeof createMicroDuckSimulatorAssetCachePlan>;
  assetSummary: ReturnType<typeof summarizeMicroDuckSimulatorAssetPlan>;
  compiledCommandId?: string;
  hostState: MicroDuckOfficialSimulatorHostState;
  hostMessages: string[];
  onDisconnectRuntime: () => void;
  onLoadRuntime: () => void;
  onPreviewFailed: () => void;
  onPreviewLoaded: () => void;
  previewUrl: string;
  previewRef: RefObject<HTMLIFrameElement>;
  simulatorOutput?: NonNullable<BotLabSimulationResult['outputArtifact']>;
  simulationState: string;
  simulationMessage: string;
  copy: BotLabCopy;
}) {
  const hostLoadable = assetPlan.loadable && Boolean(simulatorOutput);

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">{copy.host.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={hostState === 'running' ? 'secondary' : 'outline'}>
            {getOfficialSimulatorHostStateLabel(hostState, copy)}
          </Badge>
          <Button
            size="sm"
            variant="secondary"
            disabled={
              hostState !== 'running' &&
              (!hostLoadable || hostState === 'loading')
            }
            onClick={
              hostState === 'running' ? onDisconnectRuntime : onLoadRuntime
            }
          >
            <Download className="h-4 w-4" />
            {hostState === 'running'
              ? copy.host.disconnectRuntime
              : hostState === 'loading'
              ? copy.host.loading
              : copy.host.loadRuntime}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(680px,1.2fr)_0.8fr]">
        <div className="relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-md border bg-background">
          {hostState === 'running' ? (
            <iframe
              title="MicroDuck official simulator preview"
              ref={previewRef}
              src={previewUrl}
              onError={onPreviewFailed}
              onLoad={onPreviewLoaded}
              className="h-[560px] w-full border-0"
              allow="accelerometer; autoplay; clipboard-read; clipboard-write; gamepad; fullscreen; xr-spatial-tracking"
            />
          ) : (
            <>
              <div className="absolute inset-0 grid grid-cols-8 grid-rows-6 opacity-60">
                {Array.from({ length: 48 }).map((_, index) => (
                  <span key={index} className="border border-border/50" />
                ))}
              </div>
              <div className="relative z-10 w-full max-w-md px-6 text-center">
                <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-md border bg-card shadow-sm">
                  <Radar className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">
                  {copy.host.titles[hostState]}
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {copy.host.descriptions[hostState]}
                </p>
              </div>
            </>
          )}
          {hostState === 'running' ? (
            <div className="absolute left-3 top-3 rounded-md border bg-card/95 px-3 py-2 text-sm shadow-sm">
              <div className="font-medium">{copy.host.remotePreview}</div>
              <div className="text-xs text-muted-foreground">
                {copy.host.sourceLoaded}
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid content-start gap-3">
          <CommandFact label={copy.labels.target} value={targetName} />
          <CommandFact label={copy.labels.state} value={simulationState} />
          <CommandFact
            label={copy.labels.hostState}
            value={getOfficialSimulatorHostStateLabel(hostState, copy)}
          />
          <CommandFact
            label={copy.labels.plan}
            value={compiledCommandId ?? copy.empty.noCompiledPlan}
          />
          <CommandFact
            label={copy.labels.output}
            value={simulatorOutput?.id ?? copy.empty.noOutputArtifact}
          />
          <CommandFact
            label={copy.labels.assets}
            value={
              assetReady
                ? `${assetSummary.ready} ${copy.status.ready.toLowerCase()}`
                : `${assetSummary.ready} ${copy.status.ready.toLowerCase()} · ${assetSummary.pendingReview} ${copy.status.review.toLowerCase()}`
            }
          />
          <div className="rounded-md border bg-background p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-sm font-medium">
                {copy.labels.assetSetup}
              </span>
              <Badge variant={assetReady ? 'secondary' : 'outline'}>
                {assetReady ? copy.status.ready : copy.status.blocked}
              </Badge>
            </div>
            <div className="space-y-2">
              {assetPlan.entries.map((entry) => (
                <div
                  key={entry.asset.id}
                  className="flex items-start justify-between gap-3 rounded-md bg-muted px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {entry.asset.label}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {entry.asset.source.revision.slice(0, 12)}
                    </div>
                  </div>
                  <Badge
                    variant={entry.status === 'ready' ? 'secondary' : 'outline'}
                  >
                    {getAssetCacheStatusLabel(entry.status, copy)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
          <p className="rounded-md border bg-background p-3 text-sm leading-6 text-muted-foreground">
            {simulationMessage}
          </p>
          {hostMessages.length > 0 ? (
            <div className="rounded-md border bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {copy.labels.runtimeLoader}
                </span>
                <Badge variant={hostState === 'failed' ? 'outline' : 'secondary'}>
                  {getOfficialSimulatorHostStateLabel(hostState, copy)}
                </Badge>
              </div>
              <div className="space-y-2">
                {hostMessages.map((message) => (
                  <p
                    key={message}
                    className="rounded-md bg-muted px-3 py-2 text-sm leading-6 text-muted-foreground"
                  >
                    {translateFlowMessage(message, copy)}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
          {simulatorOutput ? (
            <div className="rounded-md border bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {copy.labels.outputArtifact}
                </span>
                <Badge variant="secondary">
                  {simulatorOutput.commandCount} cmd
                </Badge>
              </div>
              <div className="space-y-2">
                {simulatorOutput.messages.map((message) => (
                  <p
                    key={message}
                    className="rounded-md bg-muted px-3 py-2 text-sm leading-6 text-muted-foreground"
                  >
                    {message}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function getWorkspaceArtifactStatusLabel(status: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    empty: copy.status.empty,
    loaded: copy.status.loaded,
    dirty: copy.status.dirty,
    invalid: copy.status.invalid,
    'read-only': copy.status.readOnly,
  };

  return labels[status] ?? status;
}

function getWorkspaceFlowStateLabel(
  state: BotLabWorkspaceState,
  copy: BotLabCopy
) {
  const labels: Record<BotLabWorkspaceState, string> = {
    loaded: copy.status.loaded,
    dirty: copy.status.dirty,
    validating: copy.status.loading,
    valid: copy.status.ready,
    invalid: copy.status.invalid,
  };

  return labels[state];
}

function getBuildStateLabel(state: BotLabBuildState, copy: BotLabCopy) {
  const labels: Record<BotLabBuildState, string> = {
    draft: copy.status.pending,
    stale: copy.status.stale,
    compiling: copy.compiling,
    compiled: copy.messages.planCompiled,
    failed: copy.status.error,
  };

  return labels[state];
}

function getSimulationStateLabel(
  state: BotLabSimulationState,
  copy: BotLabCopy
) {
  const labels: Record<BotLabSimulationState, string> = {
    idle: copy.status.pending,
    stale: copy.status.stale,
    simulating: copy.simulating,
    passed: 'OK',
    failed: copy.status.error,
  };

  return labels[state];
}

function getExecutionStateLabel(state: BotLabExecutionState, copy: BotLabCopy) {
  const labels: Record<BotLabExecutionState, string> = {
    ready: copy.status.ready,
    queueing: copy.status.queued,
    running: copy.running,
    completed: copy.status.completed,
    failed: copy.status.error,
  };

  return labels[state];
}

function getRuntimeStateLabel(state: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    created: copy.status.ready,
    queued: copy.status.queued,
    ready: copy.status.ready,
    'awaiting-confirmation': copy.status.awaiting,
    running: copy.running,
    paused: copy.status.paused,
    stopped: copy.status.stopped,
    error: copy.status.error,
    disposed: copy.status.disposed,
  };

  return labels[state] ?? state;
}

function getFlowLogLabel(category: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    target: copy.labels.target,
    workspace: 'Workspace',
    build: copy.panels.build,
    simulation: copy.panels.simulator,
    execution: copy.panels.runtime,
    error: copy.status.error,
  };

  return labels[category] ?? category;
}

function getTargetKindLabel(kind: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    robot: copy.targetKind.robot,
    simulator: copy.targetKind.simulator,
  };

  return labels[kind] ?? kind;
}

function getTargetStatusLabel(status: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    available: copy.status.available,
    planned: copy.status.planned,
    offline: copy.status.offline,
  };

  return labels[status] ?? status;
}

function getArtifactKindLabel(kind: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    blocks: copy.artifactKind.blocks,
    'compiled-plan': copy.artifactKind.compiledPlan,
    log: copy.artifactKind.log,
    trace: copy.artifactKind.trace,
    'simulator-output': copy.artifactKind.simulatorOutput,
  };

  return labels[kind] ?? kind;
}

function getPolicyDecisionLabel(decision: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    allow: copy.status.allowed,
    deny: copy.status.denied,
    warn: copy.status.warning,
    'require-confirmation': copy.status.requiresConfirmation,
  };

  return labels[decision] ?? decision;
}

function getAssetCacheStatusLabel(status: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    ready: copy.status.ready,
    missing: copy.status.missing,
    stale: copy.status.stale,
    'pending-review': copy.status.review,
    blocked: copy.status.blocked,
  };

  return labels[status] ?? status;
}

function getOfficialSimulatorHostStateLabel(
  state: MicroDuckOfficialSimulatorHostState,
  copy: BotLabCopy
) {
  const labels: Record<MicroDuckOfficialSimulatorHostState, string> = {
    blocked: copy.status.blocked,
    loading: copy.status.loading,
    ready: copy.status.ready,
    running: copy.running,
    failed: copy.status.error,
    disconnected: copy.status.disconnected,
  };

  return labels[state];
}

function getRuntimeEventLabel(type: string, copy: BotLabCopy) {
  const labels: Record<string, string> = {
    'session-created': copy.labels.demoSession,
    'artifact-loaded': copy.labels.artifact,
    'policy-evaluated': copy.panels.policy,
    'policy-confirmed': copy.status.confirmationApplied,
    'session-queued': copy.status.queued,
    'session-dequeued': copy.running,
    'session-started': copy.running,
    'command-dispatched': copy.labels.generatedCommand,
    'session-paused': copy.status.paused,
    'session-resumed': copy.running,
    'session-stopped': copy.status.completed,
    'session-disposed': copy.status.disposed,
    'runtime-error': copy.status.error,
  };

  return labels[type] ?? type;
}

function translateFlowMessage(message: string, copy: BotLabCopy) {
  const exactMessages: Record<string, string> = {
    'Compile the demo to evaluate policies.': copy.messages.compilePolicies,
    'Workspace loaded from sample.': copy.messages.workspaceLoaded,
    'Sample workspace loaded.': copy.messages.sampleWorkspaceLoaded,
    'Simulate the compiled plan before running.':
      copy.messages.simulationBeforeRun,
    'Demo ready for MicroDuck Simulator': copy.messages.demoReady,
    'Demo queued for MicroDuck.': copy.messages.demoQueued,
    'Demo execution completed.': copy.messages.demoExecutionCompleted,
    'Workspace edited.': copy.status.dirty,
    'Workspace validated successfully.': copy.status.ready,
    'Plan compiled for MicroDuck.': copy.messages.planCompiled,
    'Simulation completed successfully.': copy.status.completed,
  };

  if (exactMessages[message]) {
    return exactMessages[message];
  }

  const targetSelected = message.match(
    /^Target (.+) selected\. Compile the workspace to generate an executable plan\.$/
  );
  if (targetSelected) {
    return `${copy.messages.targetSelectedPrefix} ${targetSelected[1]}. ${copy.messages.targetSelectedSuffix}`;
  }

  const compiledPlan = message.match(
    /^Plan (.+) compiled from Scratch Blocks for (.+)\.$/
  );
  if (compiledPlan) {
    return `${copy.messages.planCompiled} ${compiledPlan[1]} · ${compiledPlan[2]}.`;
  }

  const simulationComplete = message.match(
    /^Simulation complete: (\d+) command\(s\) verified for (.+)\.$/
  );
  if (simulationComplete) {
    return `${copy.messages.simulationCompletePrefix} ${simulationComplete[1]} ${copy.messages.simulationCompleteSuffix} ${simulationComplete[2]}.`;
  }

  const commandsSent = message.match(/^(\d+) command\(s\) sent\. State: (.+)\.$/);
  if (commandsSent) {
    return `${commandsSent[1]} ${copy.messages.commandSentSuffix} ${commandsSent[2]}.`;
  }

  const loadedFrames = message.match(
    /^Loaded (\d+) BotLab control frame\(s\) into the official simulator source\.$/
  );
  if (loadedFrames) {
    return `${copy.messages.loadedFramesPrefix} ${loadedFrames[1]} ${copy.messages.loadedFramesSuffix}`;
  }

  const sentFrames = message.match(
    /^Sent (\d+) BotLab control frame\(s\) to the BotLab-enabled simulator host\.$/
  );
  if (sentFrames) {
    return `${copy.messages.sentFramesPrefix} ${sentFrames[1]} ${copy.messages.sentFramesSuffix}`;
  }

  return message;
}

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
    pending: boolean;
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
          variant={artifact.pending ? 'outline' : 'secondary'}
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

function formatLedPattern(pattern: string | undefined, copy: BotLabCopy) {
  if (!pattern) {
    return copy.empty.noPattern;
  }

  const labels: Record<string, string> = {
    blink: copy.ledPattern.blink,
    off: copy.ledPattern.off,
    smile: copy.ledPattern.smile,
    solid: copy.ledPattern.solid,
  };

  return labels[pattern] ?? pattern;
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

function createMicroDuckOfficialSimulatorPreviewRuntime() {
  const sources: MicroDuckOfficialSimulatorSource[] = [];

  return {
    controller: {
      sources,
      addSource(source: MicroDuckOfficialSimulatorSource) {
        sources.push(source);
      },
    },
  };
}

function resolveMicroDuckOfficialSimulatorHostState({
  assetLoadable,
  simulationState,
  simulatorOutputReady,
}: {
  assetLoadable: boolean;
  simulationState: BotLabSimulationState;
  simulatorOutputReady: boolean;
}): MicroDuckOfficialSimulatorHostState {
  if (!assetLoadable) {
    return 'blocked';
  }

  if (simulationState === 'simulating') {
    return 'loading';
  }

  if (simulationState === 'failed') {
    return 'failed';
  }

  if (simulatorOutputReady) {
    return 'ready';
  }

  return 'ready';
}
