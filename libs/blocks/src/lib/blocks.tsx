import { Badge } from '@botlab/ui';
import { Blocks } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createBlocksEditorProvider,
  createScratchBlocksEditorProvider,
  sampleBlocksWorkspaceArtifact,
  type BlocksEditorMountHandle,
  type BlocksEditorProvider,
  type BlocksWorkspaceArtifact,
  type BlocksWorkspaceStatus,
} from './blocks-contract';
import { createLocalScratchBlocksEditorBridge } from './scratch-blocks-local-bridge';
import styles from './blocks.module.css';
import type { BlocksLocale } from './block-messages';

export interface BlocksEditorShellProps {
  workspaceName: string;
  labels?: Partial<BlocksEditorShellLabels>;
  status?: string;
  blocks: string[];
  artifact?: BlocksWorkspaceArtifact;
  workspaceStatus?: BlocksWorkspaceStatus;
  readOnly?: boolean;
  validationErrors?: string[];
  provider?: BlocksEditorProvider;
  autoMountNativeEditor?: boolean;
  onArtifactChange?: (artifact: BlocksWorkspaceArtifact) => void;
  activeBlockId?: string;
  workbench?: boolean;
  locale?: BlocksLocale;
  availableBlockTypes?: readonly string[];
}

export interface BlocksEditorShellLabels {
  visualEditor: string;
  preview: string;
  workspaceArea: string;
  readyToMount: string;
  bridgePending: string;
  mounted: string;
  resetNativeEditor: string;
  open: string;
  markDirty: string;
  togglePalette: string;
}

export function BlocksEditorShell({
  workspaceName,
  labels,
  status,
  blocks,
  artifact = sampleBlocksWorkspaceArtifact,
  workspaceStatus = artifact.status,
  readOnly = workspaceStatus === 'read-only',
  validationErrors = artifact.validationErrors,
  provider,
  autoMountNativeEditor = true,
  onArtifactChange,
  activeBlockId,
  workbench = false,
  locale = 'ca',
  availableBlockTypes,
}: BlocksEditorShellProps) {
  const copy = useMemo(
    () => ({ ...defaultBlocksEditorShellLabels, ...labels }),
    [labels],
  );
  const resolvedProvider = useMemo(
    () =>
      provider ??
      (artifact.engine === 'scratch-blocks'
        ? createScratchBlocksEditorProvider(
            createLocalScratchBlocksEditorBridge(),
          )
        : createBlocksEditorProvider(artifact.engine)),
    [artifact.engine, provider],
  );
  const badgeVariant = workspaceStatus === 'invalid' ? 'outline' : 'secondary';
  const statusLabel = status ?? workspaceStatusLabels[workspaceStatus];
  const mountElementRef = useRef<HTMLDivElement>(null);
  const mountHandleRef = useRef<BlocksEditorMountHandle | undefined>(undefined);
  const mountedArtifactIdRef = useRef<string | undefined>(undefined);
  const [isNativeMounted, setIsNativeMounted] = useState(false);
  const [isMounting, setIsMounting] = useState(false);
  const [mountMessage, setMountMessage] = useState(
    resolvedProvider.supportsNativeMount
      ? copy.readyToMount
      : copy.bridgePending,
  );
  const showPreviewSidebar = !resolvedProvider.supportsNativeMount;
  const editorGridClassName = showPreviewSidebar
    ? 'grid min-h-[340px] gap-4 p-4 md:grid-cols-[220px_1fr]'
    : 'grid min-h-[420px] gap-4 p-4';
  const canAutoMountNativeEditor =
    autoMountNativeEditor && !isJsdomEnvironment();

  function markDirty() {
    if (readOnly) {
      return;
    }

    onArtifactChange?.({
      ...artifact,
      status: 'dirty',
    });
  }

  const openNativeEditor = useCallback(async () => {
    if (!mountElementRef.current) {
      return;
    }

    mountHandleRef.current?.dispose();
    setIsMounting(true);

    try {
      const result = await resolvedProvider.mountWorkspace({
        element: mountElementRef.current,
        artifact,
        locale,
        availableBlockTypes,
        onArtifactChange,
      });

      if (!result.mounted) {
        setIsNativeMounted(false);
        setMountMessage(result.reason);
        return;
      }

      mountHandleRef.current = result.handle;
      mountedArtifactIdRef.current = artifact.id;
      setIsNativeMounted(true);
      setMountMessage(`${resolvedProvider.name} ${copy.mounted}.`);
    } finally {
      setIsMounting(false);
    }
  }, [
    artifact,
    copy.mounted,
    locale,
    availableBlockTypes,
    onArtifactChange,
    resolvedProvider,
  ]);

  useEffect(() => {
    if (
      !resolvedProvider.supportsNativeMount ||
      !canAutoMountNativeEditor ||
      mountedArtifactIdRef.current === artifact.id
    ) {
      return;
    }

    void openNativeEditor();
  }, [
    artifact.id,
    canAutoMountNativeEditor,
    openNativeEditor,
    resolvedProvider.supportsNativeMount,
  ]);

  useEffect(() => {
    mountHandleRef.current?.setLocale?.(locale);
  }, [locale, isNativeMounted]);

  useEffect(() => {
    if (availableBlockTypes)
      mountHandleRef.current?.setAvailableBlockTypes?.(availableBlockTypes);
  }, [availableBlockTypes, isNativeMounted]);

  useEffect(() => {
    mountHandleRef.current?.highlightBlock?.(activeBlockId);
  }, [activeBlockId, isNativeMounted]);

  useEffect(() => {
    return () => {
      mountHandleRef.current?.dispose();
    };
  }, []);

  return (
    <section
      className={
        workbench ? styles.workbench : 'min-h-[420px] rounded-lg border bg-card'
      }
    >
      <header
        className={
          workbench
            ? styles.toolbar
            : 'flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between'
        }
      >
        <div>
          {!workbench && (
            <p className="text-sm text-muted-foreground">{copy.visualEditor}</p>
          )}
          <h2 className="text-sm font-semibold">
            {workbench ? copy.visualEditor : workspaceName}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {workbench && (
            <button
              type="button"
              className={styles.paletteButton}
              title={copy.togglePalette}
              aria-label={copy.togglePalette}
              onClick={() => mountHandleRef.current?.togglePalette?.()}
            >
              <Blocks size={18} />
            </button>
          )}
          {!workbench && <Badge>{resolvedProvider.name}</Badge>}
          <Badge variant={badgeVariant}>{statusLabel}</Badge>
          {!workbench && <Badge variant="outline">{artifact.format}</Badge>}
        </div>
      </header>

      <div className={workbench ? styles.editorBody : editorGridClassName}>
        {showPreviewSidebar ? (
          <aside className="rounded-md border bg-muted p-3">
            <p className="mb-3 text-sm font-medium">{copy.preview}</p>
            <div className="space-y-2">
              {blocks.map((block) => (
                <div
                  key={block}
                  className="rounded-md bg-background px-3 py-2 text-sm shadow-sm"
                >
                  {block}
                </div>
              ))}
            </div>
          </aside>
        ) : null}

        <div
          className={
            workbench
              ? styles.editorCanvas
              : 'flex min-h-[380px] flex-col rounded-md border border-dashed bg-background p-4'
          }
        >
          <div
            ref={mountElementRef}
            className={`${styles.workspace} ${workbench ? styles.workbenchWorkspace : 'relative h-[420px] min-h-[360px] overflow-hidden rounded-md bg-muted/40'}`}
          >
            <div className="flex h-full items-center justify-center text-center">
              <p className="text-base font-medium">{copy.workspaceArea}</p>
              {!workbench && (
                <>
                  <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    {artifact.label}
                  </p>
                  <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                    {mountMessage}
                  </p>
                </>
              )}
              {resolvedProvider.supportsNativeMount ? null : (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {blocks.map((block) => (
                    <span
                      key={block}
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {block}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {validationErrors.length > 0 ? (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {validationErrors.join(' ')}
            </div>
          ) : null}

          {(!workbench || !isNativeMounted) && (
            <div
              className={
                workbench ? styles.recovery : 'mt-4 flex flex-wrap gap-2'
              }
            >
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                disabled={readOnly || isMounting}
                onClick={openNativeEditor}
              >
                {isNativeMounted
                  ? copy.resetNativeEditor
                  : `${copy.open} ${resolvedProvider.name}`}
              </button>
              {!workbench && (
                <button
                  type="button"
                  className="rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                  disabled={readOnly}
                  onClick={markDirty}
                >
                  {copy.markDirty}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default BlocksEditorShell;

const workspaceStatusLabels: Record<BlocksWorkspaceStatus, string> = {
  empty: 'Empty',
  loaded: 'Loaded',
  dirty: 'Edited',
  invalid: 'Invalid',
  'read-only': 'Read only',
};

const defaultBlocksEditorShellLabels: BlocksEditorShellLabels = {
  visualEditor: 'Visual editor',
  preview: 'Preview',
  workspaceArea: 'Workspace area',
  readyToMount: 'Scratch Blocks ready to mount.',
  bridgePending: 'Scratch Blocks bridge pending.',
  mounted: 'mounted',
  resetNativeEditor: 'Reset native editor',
  open: 'Open',
  markDirty: 'Mark edited',
  togglePalette: 'Block palette',
};

function isJsdomEnvironment() {
  return (
    typeof navigator !== 'undefined' &&
    navigator.userAgent.toLowerCase().includes('jsdom')
  );
}
