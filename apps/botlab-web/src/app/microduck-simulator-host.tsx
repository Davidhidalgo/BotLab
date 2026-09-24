import {
  postMicroDuckSimulatorControlSource,
  type createMicroDuckSimulatorAssetCachePlan,
  type MicroDuckExecutionUpdate,
  type MicroDuckOfficialSimulatorHostState,
  type MicroDuckOfficialSimulatorSource,
  type MicroDuckSimulatorControlFrame,
  type MicroDuckSimulatorControlSource,
} from '@botlab/simulators-microduck';
import { Badge, Button } from '@botlab/ui';
import {
  LoaderCircle,
  Play,
  Radar,
  RotateCcw,
  Square,
  Unplug,
} from 'lucide-react';
import { type RefObject, useEffect } from 'react';
import type {
  BotLabSimulationResult,
  BotLabSimulationState,
} from './botlab-flow-machine';
import type { BotLabCopy } from './i18n';
import {
  getAssetCacheStatusLabel,
  getOfficialSimulatorHostStateLabel,
  translateFlowMessage,
} from './workbench-labels';
import { CommandFact } from './workbench-panels';

export const microDuckOfficialSimulatorPreviewUrl =
  process.env.BOTLAB_SIMULATOR_URL ?? 'http://127.0.0.1:4300/?boot=1';
export const microDuckSimulatorDeliveryDelays = [
  0, 1000, 3000, 8000, 15000,
] as const;
export const microDuckSimulatorPreviewLoadTimeoutMs = 30000;

export function scheduleMicroDuckSimulatorControlSourceDelivery(
  targetWindow: Pick<Window, 'postMessage'>,
  controlSource: MicroDuckSimulatorControlSource,
  targetOrigin: string,
) {
  const executionId = Array.from(
    window.crypto.getRandomValues(new Uint32Array(4)),
    (value) => value.toString(16),
  ).join('-');
  postMicroDuckSimulatorControlSource(
    targetWindow,
    controlSource,
    targetOrigin,
    executionId,
  );
  return microDuckSimulatorDeliveryDelays.slice(1).map((delay) =>
    window.setTimeout(() => {
      postMicroDuckSimulatorControlSource(
        targetWindow,
        controlSource,
        targetOrigin,
        executionId,
      );
    }, delay),
  );
}

export function MicroDuckSimulatorHost({
  targetName,
  assetReady,
  assetPlan,
  assetSummary,
  compiledCommandId,
  hostState,
  hostMessages,
  onDisconnectRuntime,
  onRun,
  onStop,
  onResetScene,
  resetDisabled,
  sceneRevision,
  sceneLoading,
  executionState,
  frameIndex,
  executionFrame,
  executionUpdate,
  frameCount,
  runBusy,
  runDisabled,
  runLabel,
  runFailed,
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
  onRun: () => void;
  onStop: () => void;
  onResetScene: () => void;
  resetDisabled: boolean;
  sceneRevision: number;
  sceneLoading: boolean;
  executionState: keyof BotLabCopy['host']['executionStates'];
  frameIndex?: number;
  executionFrame?: MicroDuckSimulatorControlFrame;
  executionUpdate?: MicroDuckExecutionUpdate;
  frameCount: number;
  runBusy: boolean;
  runDisabled: boolean;
  runLabel: string;
  runFailed: boolean;
  onPreviewFailed: () => void;
  onPreviewLoaded: () => void;
  previewUrl: string;
  previewRef: RefObject<HTMLIFrameElement>;
  simulatorOutput?: NonNullable<BotLabSimulationResult['outputArtifact']>;
  simulationState: string;
  simulationMessage: string;
  copy: BotLabCopy;
}) {
  useEffect(() => {
    const frame = previewRef.current;
    if (hostState !== 'running' || !frame) return;
    frame.addEventListener('error', onPreviewFailed);
    return () => frame.removeEventListener('error', onPreviewFailed);
  }, [hostState, onPreviewFailed, previewRef]);

  return (
    <section className="simulator-workbench">
      <div className="simulator-toolbar">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">MicroDuck</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="min-w-[128px]"
            disabled={runDisabled || runBusy}
            onClick={onRun}
            aria-busy={runBusy}
          >
            {runBusy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {runLabel}
          </Button>
          <Button
            size="icon"
            variant="secondary"
            onClick={onResetScene}
            disabled={resetDisabled}
            title={copy.host.resetScene}
            aria-label={copy.host.resetScene}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            onClick={onStop}
            disabled={!runBusy || executionState === 'stopping'}
            title={copy.host.stop}
            aria-label={copy.host.stop}
          >
            <Square className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="simulator-status">
        <p
          role="status"
          className="text-sm"
          aria-label={copy.host.executionLabel}
        >
          {sceneLoading
            ? copy.host.loading
            : executionState === 'failed' &&
                executionUpdate?.failureOrigin !== 'simulator'
              ? copy.host.executionUnconfirmed
              : copy.host.executionStates[executionState]}
          {executionState === 'running' && frameIndex !== undefined
            ? ` · ${frameIndex + 1}/${frameCount}`
            : ''}
        </p>
        {executionState === 'running' && executionFrame?.iterations?.length ? (
          <p role="status" className="text-sm tabular-nums">
            {copy.host.iteration}{' '}
            {executionFrame.iterations
              .map((item) => `${item.iteration}/${item.count}`)
              .join(' · ')}
          </p>
        ) : null}
        {executionState === 'running' &&
        executionFrame?.type === 'differential-drive' ? (
          <div
            className="space-y-1"
            role="status"
            aria-label={copy.host.progressLabel}
          >
            <p className="text-sm tabular-nums">
              {executionFrame.distanceMeters !== undefined
                ? `${copy.host.walking}: ${(executionUpdate?.distanceMeters ?? 0).toFixed(2)} / ${executionFrame.distanceMeters} m`
                : executionFrame.angleDegrees !== undefined
                  ? `${copy.host.turning}: ${(executionUpdate?.turnedDegrees ?? 0).toFixed(0)} / ${Math.abs(executionFrame.angleDegrees)}°`
                  : `${copy.host.waiting}: ${(Math.max(0, (executionFrame.durationMs ?? 0) - (executionUpdate?.elapsedMs ?? 0)) / 1000).toFixed(1)} s`}
            </p>
            <progress
              className="block h-2 w-full accent-emerald-600"
              aria-label={copy.host.progressLabel}
              max={Math.max(
                executionFrame.distanceMeters ??
                  (executionFrame.angleDegrees !== undefined
                    ? Math.abs(executionFrame.angleDegrees)
                    : executionFrame.durationMs) ??
                  1,
                0.001,
              )}
              value={
                executionFrame.distanceMeters !== undefined
                  ? (executionUpdate?.distanceMeters ?? 0)
                  : executionFrame.angleDegrees !== undefined
                    ? (executionUpdate?.turnedDegrees ?? 0)
                    : (executionUpdate?.elapsedMs ?? 0)
              }
            />
          </div>
        ) : null}
        {executionState === 'failed' && executionUpdate?.errorCode ? (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {
              copy.host.executionErrors[
                executionUpdate.errorCode as keyof typeof copy.host.executionErrors
              ]
            }
          </p>
        ) : null}
        {runFailed ? (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {copy.host.runFailed}
          </p>
        ) : null}
      </div>
      <div className="simulator-scene">
        {hostState === 'running' ? (
          <iframe
            key={sceneRevision}
            title="MicroDuck official simulator preview"
            ref={previewRef}
            src={previewUrl}
            onLoad={onPreviewLoaded}
            className="absolute inset-0 h-full w-full border-0"
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
              <Radar className="mx-auto mb-4 h-10 w-10 text-primary" />
              <h3 className="text-sm font-medium text-muted-foreground">
                {copy.host.titles[hostState]}
              </h3>
            </div>
          </>
        )}
      </div>

      <details className="simulator-details">
        <summary>{copy.workbench.simulatorDetails}</summary>
        <div className="grid content-start gap-3 p-4">
          {hostState === 'running' || hostState === 'loading' ? (
            <Button size="sm" variant="secondary" onClick={onDisconnectRuntime}>
              <Unplug className="h-4 w-4" />
              {copy.host.disconnectRuntime}
            </Button>
          ) : null}
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
                <Badge
                  variant={hostState === 'failed' ? 'outline' : 'secondary'}
                >
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
      </details>
    </section>
  );
}

export function summarizeMicroDuckSimulatorAssetPlan(
  plan: ReturnType<typeof createMicroDuckSimulatorAssetCachePlan>,
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
    },
  );
}

export function createMicroDuckOfficialSimulatorPreviewRuntime() {
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

export function resolveMicroDuckOfficialSimulatorHostState({
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
