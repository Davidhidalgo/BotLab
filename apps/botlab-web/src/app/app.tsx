import { robotBlockPalette, hasUnavailableBlocks } from './robot-block-palette';
import { StackChanPanel } from './stackchan-panel';
import {
  createLocalProjectId,
  readProjectLibrary,
  saveProjectLibrary,
  type LocalProject,
} from './project-storage';
import {
  NativeSimulatorPanel,
  nativeSimulatorLabels,
} from './native-simulator-panel';
import { BlocksEditorShell } from '@botlab/blocks';
import { type CompiledBehaviorArtifact } from '@botlab/model';
import {
  createMicroDuckSimulatorAssetCachePlan,
  createMicroDuckSimulatorControlSource,
  loadMicroDuckOfficialSimulatorHost,
  microDuckSimulatorAssetManifest,
  type MicroDuckOfficialSimulatorHostResult,
} from '@botlab/simulators-microduck';
import { Badge, Button } from '@botlab/ui';
import { useMachine } from '@xstate/react';
import {
  Cpu,
  GitBranch,
  Lock,
  Radar,
  Download,
  Upload,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useRef, useMemo, useState } from 'react';
import {
  botLabBuildSteps,
  botLabExecutionSteps,
  botLabFlowMachine,
  botLabSimulationSteps,
  botLabWorkspaceSteps,
  type BotLabBuildState,
  type BotLabExecutionState,
  type BotLabSimulationState,
  type BotLabWorkspaceState,
} from './botlab-flow-machine';
import { botLabLocales, botLabTranslations, type BotLabLocale } from './i18n';
import {
  createMicroDuckOfficialSimulatorPreviewRuntime,
  MicroDuckSimulatorHost,
  microDuckOfficialSimulatorPreviewUrl,
  microDuckSimulatorPreviewLoadTimeoutMs,
  resolveMicroDuckOfficialSimulatorHostState,
  summarizeMicroDuckSimulatorAssetPlan,
} from './microduck-simulator-host';
import { simulatorLaunchMachine } from './simulator-launch-machine';
import { simulatorExecutionMachine } from './simulator-execution-machine';
import { WorkbenchLayout } from './workbench-layout';
import {
  getArtifactKindLabel,
  getBuildStateLabel,
  getExecutionStateLabel,
  getFlowLogLabel,
  getPolicyDecisionLabel,
  getRuntimeEventLabel,
  getRuntimeStateLabel,
  getSimulationStateLabel,
  getTargetKindLabel,
  getTargetStatusLabel,
  getWorkspaceArtifactStatusLabel,
  getWorkspaceFlowStateLabel,
  formatLedPattern,
  runtimeDiagnosticLabels,
  runtimeTraceLabels,
  translateFlowMessage,
} from './workbench-labels';
import {
  ArtifactCard,
  CompiledCommandCard,
  FlowRail,
  Metric,
  Panel,
  RuntimeList,
  RuntimeLogSection,
} from './workbench-panels';
import {
  decodeWorkspaceDocument,
  encodeWorkspaceDocument,
  maxWorkspaceFileBytes,
  readWorkspaceDocument,
  saveWorkspaceDocument,
  type SavedExecution,
} from './workspace-storage';

export function App() {
  const [projectRestore] = useState(readProjectLibrary);
  const [restored] = useState(() => {
    const library = projectRestore.library;
    return library
      ? {
          document: library.projects.find(
            (project) => project.id === library.activeId,
          )?.document,
          error: false,
        }
      : readWorkspaceDocument();
  });
  const [projects, setProjects] = useState<LocalProject[]>(
    projectRestore.library?.projects ?? [],
  );
  const [projectId, setProjectId] = useState(
    projectRestore.library?.activeId ?? 'initial-project',
  );
  const [projectName, setProjectName] = useState(
    projectRestore.library?.projects.find(
      (project) => project.id === projectRestore.library?.activeId,
    )?.name ?? 'Mi proyecto',
  );
  const [simulatorBackend, setSimulatorBackend] = useState<
    'browser' | 'native'
  >(restored.document?.simulatorBackend ?? 'browser');
  const [nativeActiveBlock, setNativeActiveBlock] = useState<string>();
  const [nativeBusy, setNativeBusy] = useState(false);
  const [flowSnapshot, sendFlow, flowActor] = useMachine(botLabFlowMachine, {
    input: {
      workspace: restored.document?.workspace,
      targetId: restored.document?.targetId,
    },
  });
  const [launchSnapshot, sendLaunch] = useMachine(simulatorLaunchMachine);
  const [executionSnapshot, sendExecution] = useMachine(
    simulatorExecutionMachine,
  );
  const executionBusy = executionSnapshot.hasTag('busy');
  const executionState =
    typeof executionSnapshot.value === 'string'
      ? executionSnapshot.value
      : executionSnapshot.value.active === 'invalidating'
        ? 'stopping'
        : executionSnapshot.value.active;
  const [locale, setLocale] = useState<BotLabLocale>(
    restored.document?.locale ?? 'ca',
  );
  const [lastExecution, setLastExecution] = useState<
    SavedExecution | undefined
  >(restored.document?.lastExecution);
  const [storageEnabled, setStorageEnabled] = useState(
    !restored.error && !projectRestore.error,
  );
  const [saveFailed, setSaveFailed] = useState(
    restored.error || projectRestore.error,
  );
  const [fileFailed, setFileFailed] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [officialSimulatorHostResult, setOfficialSimulatorHostResult] =
    useState<MicroDuckOfficialSimulatorHostResult>();
  const [officialSimulatorFrameReady, setOfficialSimulatorFrameReady] =
    useState(false);
  const [sceneRevision, setSceneRevision] = useState(0);
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
  const isPreparingLaunch = launchSnapshot.hasTag('busy');
  const targets = runtime.listTargets();
  const capabilities = runtime.listCapabilities();
  const selectedTarget = targets.find(
    (target) => target.id === selectedTargetId,
  );
  const selectedCapabilities = capabilities.filter((capability) =>
    capability.targetIds.includes(selectedTargetId),
  );
  const capabilityKey = selectedCapabilities
    .map((capability) => capability.id)
    .sort()
    .join(',');
  const availableBlockTypes = useMemo(
    () =>
      robotBlockPalette(
        selectedTarget?.kind === 'simulator',
        capabilityKey.split(','),
      ),
    [selectedTarget?.kind, capabilityKey],
  );
  const incompatibleBlocks = useMemo(
    () => hasUnavailableBlocks(workspaceArtifact.content, availableBlockTypes),
    [workspaceArtifact.content, availableBlockTypes],
  );
  const selectedTargetCanRunDemo =
    selectedTarget?.status === 'available' &&
    selectedCapabilities.some(
      (capability) => capability.id === 'microduck-leds',
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
    ? (targets.find((target) => target.id === compiledArtifact.targetId)
        ?.name ?? compiledArtifact.targetId)
    : undefined;
  const policyConfirmed = runtimeSnapshot.recentEvents.some(
    (event) =>
      event.type === 'policy-confirmed' &&
      event.sessionId === activeSession?.id,
  );
  const simulatorAssetPlan = createMicroDuckSimulatorAssetCachePlan(
    microDuckSimulatorAssetManifest,
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
  const deliverySource =
    officialSimulatorHostResult?.state === 'running'
      ? officialSimulatorHostResult.controlSource
      : undefined;
  const latestWorkspace = useRef(workspaceArtifact);
  const executionUpdate = executionSnapshot.context.update;
  const executionFrame =
    executionUpdate?.frameIndex === undefined
      ? undefined
      : executionSnapshot.context.request?.source.frames[
          executionUpdate.frameIndex
        ];
  const activeBlockId =
    selectedTarget?.adapterId === 'stackchan' || simulatorBackend === 'native'
      ? nativeActiveBlock
      : (executionState === 'running' || executionState === 'failed') &&
          compiledArtifact?.id ===
            executionSnapshot.context.request?.source.artifactId
        ? executionFrame?.sourceBlockId
        : undefined;
  latestWorkspace.current = workspaceArtifact;
  useEffect(() => {
    if (!storageEnabled) return;
    const document = currentProjectDocument();
    const updated = currentProjects(document);
    const saved = saveProjectLibrary({
      schemaVersion: 1,
      activeId: projectId,
      projects: updated,
    });
    setSaveFailed(!saved || !saveWorkspaceDocument(document));
  }, [
    workspaceArtifact,
    locale,
    lastExecution,
    selectedTargetId,
    simulatorBackend,
    projectId,
    projectName,
    projects,
    storageEnabled,
  ]);
  useEffect(() => {
    const { update, request } = executionSnapshot.context;
    if (!update || !request) return;
    const status =
      executionState === 'failed'
        ? 'failed'
        : executionState === 'stopped'
          ? 'stopped'
          : update.status;
    setLastExecution((previous) => {
      const events =
        previous?.executionId === update.executionId ? previous.events : [];
      const last = events[events.length - 1];
      if (last?.status === status && last.frameIndex === update.frameIndex)
        return previous;
      return {
        source: request.source,
        executionId: update.executionId,
        status,
        outcome: update.outcome && {
          ...update.outcome,
          status: status === 'stopped' ? 'cancelled' : status,
        },
        events: [
          ...events,
          {
            status,
            frameIndex: update.frameIndex,
            at: new Date().toISOString(),
          },
        ].slice(-64),
      };
    });
  }, [
    executionSnapshot.context.update,
    executionSnapshot.context.request,
    executionState,
  ]);
  useEffect(() => {
    sendLaunch({ type: 'cancel' });
    sendExecution({ type: 'source.changed' });
    setOfficialSimulatorHostResult((current) =>
      current?.state === 'loading'
        ? { state: 'disconnected', messages: [] }
        : current,
    );
  }, [workspaceArtifact, selectedTargetId, sendLaunch, sendExecution]);
  useEffect(() => {
    const controlSource = deliverySource;
    const targetWindow = officialSimulatorFrameRef.current?.contentWindow;

    if (!officialSimulatorFrameReady || !controlSource || !targetWindow) {
      return;
    }

    const targetOrigin = new URL(
      microDuckOfficialSimulatorPreviewUrl,
      window.location.href,
    ).origin;
    sendExecution({
      type: 'start',
      request: { targetWindow, source: controlSource, targetOrigin },
    });

    return () => {
      sendExecution({ type: 'detach' });
    };
  }, [officialSimulatorFrameReady, deliverySource, sendExecution]);
  useEffect(() => {
    if (
      executionSnapshot.matches('failed') &&
      executionUpdate?.failureOrigin !== 'simulator'
    ) {
      failOfficialSimulatorRuntimePreview(copy.host.executionLost);
    }
  }, [
    executionSnapshot.value,
    executionUpdate?.failureOrigin,
    copy.host.executionLost,
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
    sceneRevision,
  ]);
  async function launchSimulatorProgram(
    artifact: CompiledBehaviorArtifact,
    signal: AbortSignal,
  ) {
    if (selectedTarget?.kind !== 'simulator') return;
    if (officialSimulatorHostResult?.state === 'running') {
      const controlSource = createMicroDuckSimulatorControlSource(artifact);
      if (controlSource.errors.length > 0) {
        throw new Error(controlSource.errors.join('\n'));
      }
      if (signal.aborted) return;
      setOfficialSimulatorHostResult(
        (current) =>
          current && {
            ...current,
            controlSource,
            messages: controlSource.messages,
          },
      );
      return;
    }
    setOfficialSimulatorHostResult({
      state: 'loading',
      messages: ['Preparing official runtime in educational preview mode.'],
    });
    setOfficialSimulatorFrameReady(false);

    try {
      const result = await loadMicroDuckOfficialSimulatorHost({
        assetPlan: simulatorAssetPlan,
        artifact,
        loadRuntime: createMicroDuckOfficialSimulatorPreviewRuntime,
        getVelocityLimits: () => [2, -1, 3],
      });

      if (signal.aborted) {
        result.connection?.disconnect();
        return;
      }
      setOfficialSimulatorHostResult(result);
      if (result.state !== 'running')
        throw new Error('Simulator could not start.');
    } catch (error) {
      if (signal.aborted) return;
      setOfficialSimulatorHostResult({
        state: 'failed',
        messages: [
          error instanceof Error
            ? error.message
            : 'Could not load the official runtime.',
        ],
      });
      throw error;
    }
  }
  function runDemo() {
    if (
      incompatibleBlocks ||
      !flowSnapshot.can({ type: 'build.compile' }) ||
      isPreparingLaunch ||
      isRunningDemo ||
      executionBusy ||
      officialSimulatorHostState === 'loading' ||
      (officialSimulatorHostState === 'running' && !officialSimulatorFrameReady)
    ) {
      return;
    }
    sendLaunch({
      type: 'run',
      flow: flowActor,
      launch: launchSimulatorProgram,
    });
  }
  function failOfficialSimulatorRuntimePreview(message: string) {
    setOfficialSimulatorFrameReady(false);
    setOfficialSimulatorHostResult((current) => ({
      state: 'failed',
      messages: current ? [...current.messages, message] : [message],
    }));
  }

  function disconnectOfficialSimulatorRuntimePreview() {
    sendLaunch({ type: 'cancel' });
    sendExecution({ type: 'detach' });
    officialSimulatorHostResult?.connection?.disconnect();
    setOfficialSimulatorFrameReady(false);
    setOfficialSimulatorHostResult({
      state: 'disconnected',
      messages: [copy.host.disconnectedMessage],
    });
  }
  function stopSimulatorExecution() {
    sendLaunch({ type: 'cancel' });
    if (executionBusy) sendExecution({ type: 'stop' });
    else disconnectOfficialSimulatorRuntimePreview();
  }
  function resetSimulatorScene() {
    if (
      officialSimulatorHostState !== 'failed' &&
      (officialSimulatorHostState !== 'running' || !officialSimulatorFrameReady)
    )
      return;
    sendLaunch({ type: 'cancel' });
    // Dispose the old transport before replacing its iframe and pending source.
    sendExecution({ type: 'scene.reset' });
    officialSimulatorHostResult?.connection?.disconnect();
    setLastExecution((previous) => {
      if (!previous || !['accepted', 'running'].includes(previous.status))
        return previous;
      return {
        ...previous,
        status: 'stopped',
        events: [
          ...previous.events,
          { status: 'stopped' as const, at: new Date().toISOString() },
        ].slice(-64),
      };
    });
    setOfficialSimulatorFrameReady(false);
    setOfficialSimulatorHostResult({ state: 'running', messages: [] });
    setSceneRevision((value) => value + 1);
  }
  function currentProjectDocument() {
    return {
      schemaVersion: 1 as const,
      workspace: workspaceArtifact,
      locale,
      lastExecution,
      targetId: selectedTargetId as
        | 'stackchan-planned'
        | 'microduck-sim'
        | 'microduck-usb',
      simulatorBackend,
    };
  }
  function currentProjects(document = currentProjectDocument()) {
    const current = {
      id: projectId,
      name: projectName.trim() || 'Mi proyecto',
      document,
    };
    return projects.some((project) => project.id === projectId)
      ? projects.map((project) =>
          project.id === projectId ? current : project,
        )
      : [...projects, current];
  }
  function openProject(id: string, create = false) {
    if (executionBusy || isPreparingLaunch || nativeBusy || !storageEnabled)
      return;
    const updated = currentProjects();
    const project = create
      ? {
          id: createLocalProjectId(),
          name: `Proyecto ${updated.length + 1}`,
          document: {
            schemaVersion: 1 as const,
            locale,
            targetId: 'stackchan-planned' as const,
            simulatorBackend: 'browser' as const,
            workspace: {
              ...workspaceArtifact,
              id: createLocalProjectId(),
              behaviorId: createLocalProjectId(),
              label: 'Proyecto',
              content:
                '<xml xmlns="https://developers.google.com/blockly/xml"></xml>',
            },
          },
        }
      : updated.find((item) => item.id === id);
    if (!project || (create && updated.length >= 50)) return;
    const next = create ? [...updated, project] : updated;
    if (
      !saveProjectLibrary({
        schemaVersion: 1,
        activeId: project.id,
        projects: next,
      })
    ) {
      setSaveFailed(true);
      return;
    }
    disconnectOfficialSimulatorRuntimePreview();
    setProjects(next);
    setProjectId(project.id);
    setProjectName(project.name);
    setLocale(project.document.locale);
    setSimulatorBackend(project.document.simulatorBackend ?? 'browser');
    setLastExecution(
      'lastExecution' in project.document
        ? project.document.lastExecution
        : undefined,
    );
    setEditorRevision((value) => value + 1);
    sendFlow({
      type: 'target.selected',
      targetId: project.document.targetId ?? 'stackchan-planned',
    });
    sendFlow({
      type: 'workspace.changed',
      artifact: project.document.workspace,
    });
  }
  function exportWorkspaceFile() {
    try {
      const text = encodeWorkspaceDocument(currentProjectDocument());
      const url = URL.createObjectURL(
        new Blob([text], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'botlab-workspace.json';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFileFailed(false);
    } catch {
      setFileFailed(true);
    }
  }
  async function importWorkspaceFile(file?: File) {
    if (!file) return;
    const initialWorkspace = latestWorkspace.current;
    try {
      if (file.size > maxWorkspaceFileBytes)
        throw new Error('Workspace file too large.');
      const imported = decodeWorkspaceDocument(await file.text());
      if (latestWorkspace.current !== initialWorkspace)
        throw new Error('Workspace changed during import.');
      disconnectOfficialSimulatorRuntimePreview();
      setEditorRevision((value) => value + 1);
      sendFlow({ type: 'workspace.changed', artifact: imported.workspace });
      setLocale(imported.locale);
      if (imported.targetId)
        sendFlow({ type: 'target.selected', targetId: imported.targetId });
      if (imported.simulatorBackend)
        setSimulatorBackend(imported.simulatorBackend);
      setLastExecution(imported.lastExecution);
      setStorageEnabled(true);
      setFileFailed(false);
    } catch {
      setFileFailed(true);
    }
    if (importInputRef.current) importInputRef.current.value = '';
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
      <header className="workbench-header">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="text-xl font-semibold">BotLab</h1>
          <span className="text-xs text-muted-foreground">alpha</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Robot</span>
            <select
              aria-label="Robot"
              value={selectedTarget?.adapterId ?? 'stackchan'}
              disabled={executionBusy || isPreparingLaunch || nativeBusy}
              className="rounded-md border bg-background px-3 py-2"
              onChange={(event) => {
                disconnectOfficialSimulatorRuntimePreview();
                setNativeActiveBlock(undefined);
                sendFlow({
                  type: 'target.selected',
                  targetId:
                    event.target.value === 'stackchan'
                      ? 'stackchan-planned'
                      : 'microduck-sim',
                });
              }}
            >
              <option value="stackchan">StackChan</option>
              <option value="microduck">MicroDuck</option>
            </select>
          </label>
          {selectedTarget?.adapterId === 'microduck' ? (
            <label className="flex items-center gap-2 text-sm">
              {nativeSimulatorLabels[locale].backend}
              <select
                aria-label={nativeSimulatorLabels[locale].backend}
                value={simulatorBackend}
                disabled={executionBusy || isPreparingLaunch || nativeBusy}
                className="rounded-md border bg-background px-3 py-2"
                onChange={(event) => {
                  disconnectOfficialSimulatorRuntimePreview();
                  sendFlow({
                    type: 'target.selected',
                    targetId: 'microduck-sim',
                  });
                  setSimulatorBackend(
                    event.target.value as 'browser' | 'native',
                  );
                }}
              >
                <option value="browser">
                  {nativeSimulatorLabels[locale].browser}
                </option>
                <option value="native">
                  {nativeSimulatorLabels[locale].native}
                </option>
              </select>
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
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
        </div>
      </header>

      <section className="workbench-content">
        <div className="workbench-filebar">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
            <label className="flex items-center gap-2 text-sm">
              {locale === 'en'
                ? 'Project'
                : locale === 'ca'
                  ? 'Projecte'
                  : 'Proyecto'}
              <select
                aria-label={
                  locale === 'en'
                    ? 'Project'
                    : locale === 'ca'
                      ? 'Projecte'
                      : 'Proyecto'
                }
                value={projectId}
                disabled={
                  executionBusy ||
                  isPreparingLaunch ||
                  nativeBusy ||
                  !storageEnabled
                }
                className="rounded-md border bg-background px-2 py-1"
                onChange={(event) => openProject(event.target.value)}
              >
                {currentProjects().map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <input
              aria-label={
                locale === 'en'
                  ? 'Project name'
                  : locale === 'ca'
                    ? 'Nom del projecte'
                    : 'Nombre del proyecto'
              }
              maxLength={80}
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              className="w-36 rounded-md border bg-background px-2 py-1 text-sm"
            />
            <Button
              variant="secondary"
              disabled={
                executionBusy ||
                isPreparingLaunch ||
                nativeBusy ||
                !storageEnabled ||
                currentProjects().length >= 50
              }
              onClick={() => openProject('', true)}
            >
              {locale === 'en'
                ? 'New project'
                : locale === 'ca'
                  ? 'Nou projecte'
                  : 'Nuevo proyecto'}
            </Button>
            <span className="text-sm font-medium">
              {copy.blocks.workspaceName}
            </span>
            <span
              role="status"
              aria-label={copy.storage.label}
              className="text-xs text-muted-foreground"
            >
              {saveFailed ? copy.storage.failed : copy.storage.saved}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              size="icon"
              variant="secondary"
              onClick={() => importInputRef.current?.click()}
              disabled={isPreparingLaunch || executionBusy || nativeBusy}
              title={copy.storage.import}
              aria-label={copy.storage.import}
            >
              <Upload className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              onClick={exportWorkspaceFile}
              title={copy.storage.export}
              aria-label={copy.storage.export}
            >
              <Download className="h-4 w-4" />
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              aria-label={copy.storage.import}
              onChange={(event) =>
                void importWorkspaceFile(event.target.files?.[0])
              }
            />
          </div>
        </div>
        {fileFailed ? (
          <p role="alert" className="text-sm text-destructive">
            {copy.storage.fileFailed}
          </p>
        ) : null}
        {incompatibleBlocks ? (
          <p role="alert" className="mb-3 text-sm text-amber-700">
            {locale === 'es'
              ? 'Este proyecto contiene bloques que el robot seleccionado no puede ejecutar. Se conservan para que puedas editarlos o cambiar de robot.'
              : locale === 'ca'
                ? 'Aquest projecte conté blocs que el robot seleccionat no pot executar. Es conserven perquè els puguis editar o canviar de robot.'
                : 'This project contains blocks the selected robot cannot execute. They are preserved so you can edit them or change robots.'}
          </p>
        ) : null}
        <WorkbenchLayout
          labels={copy.workbench}
          editor={
            <BlocksEditorShell
              key={editorRevision}
              workspaceName={copy.blocks.workspaceName}
              labels={copy.blocks}
              status={getWorkspaceArtifactStatusLabel(
                workspaceArtifact.status,
                copy,
              )}
              artifact={workspaceArtifact}
              activeBlockId={activeBlockId}
              locale={locale}
              workbench
              blocks={[]}
              availableBlockTypes={availableBlockTypes}
              onArtifactChange={(artifact) =>
                sendFlow({ type: 'workspace.changed', artifact })
              }
            />
          }
          simulator={
            selectedTarget?.adapterId !== 'microduck' ? (
              <StackChanPanel
                key={projectId}
                locale={locale}
                onBusy={setNativeBusy}
                workspace={workspaceArtifact}
                executionBlocked={incompatibleBlocks}
                onActiveBlock={setNativeActiveBlock}
              />
            ) : simulatorBackend === 'native' ? (
              <NativeSimulatorPanel
                key={projectId}
                workspace={workspaceArtifact}
                locale={locale}
                onActiveBlock={setNativeActiveBlock}
                onBusy={setNativeBusy}
                executionBlocked={incompatibleBlocks}
              />
            ) : (
              <MicroDuckSimulatorHost
                targetName={selectedTarget?.name ?? copy.empty.noTarget}
                assetReady={simulatorAssetPlan.ready}
                assetPlan={simulatorAssetPlan}
                assetSummary={simulatorAssetSummary}
                compiledCommandId={compiledCommand?.commandId}
                hostState={officialSimulatorHostState}
                hostMessages={officialSimulatorHostMessages}
                onDisconnectRuntime={disconnectOfficialSimulatorRuntimePreview}
                onRun={runDemo}
                onStop={stopSimulatorExecution}
                onResetScene={resetSimulatorScene}
                resetDisabled={
                  officialSimulatorHostState !== 'failed' &&
                  (officialSimulatorHostState !== 'running' ||
                    !officialSimulatorFrameReady)
                }
                sceneRevision={sceneRevision}
                sceneLoading={
                  officialSimulatorHostState === 'running' &&
                  !officialSimulatorFrameReady
                }
                executionState={executionState}
                frameIndex={executionSnapshot.context.update?.frameIndex}
                executionFrame={executionFrame}
                executionUpdate={executionUpdate}
                frameCount={deliverySource?.frames.length ?? 0}
                runBusy={
                  isPreparingLaunch ||
                  isRunningDemo ||
                  executionBusy ||
                  officialSimulatorHostState === 'loading' ||
                  (officialSimulatorHostState === 'running' &&
                    !officialSimulatorFrameReady)
                }
                runDisabled={
                  incompatibleBlocks ||
                  !flowSnapshot.can({ type: 'build.compile' }) ||
                  !selectedTargetCanRunDemo
                }
                runLabel={
                  isCompiling
                    ? copy.compiling
                    : isSimulating
                      ? copy.simulating
                      : officialSimulatorHostState === 'loading' ||
                          (officialSimulatorHostState === 'running' &&
                            !officialSimulatorFrameReady)
                        ? copy.host.loading
                        : isPreparingLaunch
                          ? copy.host.preparing
                          : copy.host.run
                }
                runFailed={launchSnapshot.matches('failed')}
                onPreviewFailed={() =>
                  failOfficialSimulatorRuntimePreview(
                    copy.host.previewLoadErrorMessage,
                  )
                }
                onPreviewLoaded={() => setOfficialSimulatorFrameReady(true)}
                previewUrl={microDuckOfficialSimulatorPreviewUrl}
                previewRef={officialSimulatorFrameRef}
                simulatorOutput={simulationResult?.outputArtifact}
                simulationState={getSimulationStateLabel(
                  flowState.simulation,
                  copy,
                )}
                simulationMessage={translateFlowMessage(
                  simulationMessage,
                  copy,
                )}
                copy={copy}
              />
            )
          }
        />
        {lastExecution && simulatorBackend === 'browser' ? (
          <details className="border-t pt-3 text-sm">
            <summary className="cursor-pointer font-medium">
              {copy.storage.lastExecution}:{' '}
              {
                copy.host.executionStates[
                  lastExecution.status === 'accepted'
                    ? 'awaiting'
                    : lastExecution.status
                ]
              }
            </summary>
            <p className="mt-2 break-all text-muted-foreground">
              {lastExecution.source.artifactId}
            </p>
            <ol className="mt-2 space-y-1">
              {lastExecution.events.map((event, index) => (
                <li key={index}>
                  {new Date(event.at).toLocaleTimeString(locale)} ·{' '}
                  {
                    copy.host.executionStates[
                      event.status === 'accepted' ? 'awaiting' : event.status
                    ]
                  }
                  {event.frameIndex === undefined
                    ? ''
                    : ` · ${event.frameIndex + 1}/${lastExecution.source.frames.length}`}
                </li>
              ))}
            </ol>
          </details>
        ) : null}
        <details
          className="workbench-diagnostics"
          hidden={simulatorBackend === 'native'}
        >
          <summary>
            <SlidersHorizontal size={16} />
            {copy.workbench.diagnostics}
          </summary>
          <aside className="diagnostics-grid">
            <Panel title={copy.panels.editor}>
              <Metric
                label={copy.labels.state}
                value={getWorkspaceArtifactStatusLabel(
                  workspaceArtifact.status,
                  copy,
                )}
              />
              <Metric
                label={copy.labels.artifact}
                value={workspaceArtifact.id}
              />
              <Metric
                label={copy.labels.format}
                value={workspaceArtifact.format}
              />
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
                value={
                  simulationResult?.simulatorId ?? copy.empty.noSimulatorRun
                }
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
                        copy,
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
                  8,
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
              <Metric
                label={copy.labels.targets}
                value={targets.length.toString()}
              />
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
                    {getRuntimeStateLabel(
                      runtimeSnapshot.sessions[0]?.state ?? 'created',
                      copy,
                    )}
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
                              `${entry.sessionId} · ${copy.labels.priority} ${entry.priority}`,
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
                              `${lock.capabilityId} ${copy.labels.by} ${lock.sessionId}`,
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
                    {getTargetKindLabel(
                      selectedTarget?.kind ?? 'simulator',
                      copy,
                    )}
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
                    (capability) => capability.targetIds.includes(target.id),
                  );
                  const canRunDemo =
                    target.status === 'available' &&
                    compatibleCapabilities.some(
                      (capability) => capability.id === 'microduck-leds',
                    );

                  return (
                    <button
                      key={target.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() =>
                        sendFlow({
                          type: 'target.selected',
                          targetId: target.id,
                        })
                      }
                      className={`w-full rounded-md border bg-background p-3 text-left transition-colors hover:border-primary/60 ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/20'
                          : ''
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
        </details>
      </section>
    </main>
  );
}

export default App;
