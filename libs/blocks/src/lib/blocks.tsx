import { Badge } from '@botlab/ui';
import { useRef, useState } from 'react';
import {
  createBlocksEditorProvider,
  sampleBlocksWorkspaceArtifact,
  type BlocksEditorMountHandle,
  type BlocksEditorProvider,
  type BlocksWorkspaceArtifact,
  type BlocksWorkspaceStatus,
} from './blocks-contract';

export interface BlocksEditorShellProps {
  workspaceName: string;
  status?: string;
  blocks: string[];
  artifact?: BlocksWorkspaceArtifact;
  workspaceStatus?: BlocksWorkspaceStatus;
  readOnly?: boolean;
  validationErrors?: string[];
  provider?: BlocksEditorProvider;
  onArtifactChange?: (artifact: BlocksWorkspaceArtifact) => void;
}

export function BlocksEditorShell({
  workspaceName,
  status,
  blocks,
  artifact = sampleBlocksWorkspaceArtifact,
  workspaceStatus = artifact.status,
  readOnly = workspaceStatus === 'read-only',
  validationErrors = artifact.validationErrors,
  provider = createBlocksEditorProvider(artifact.engine),
  onArtifactChange,
}: BlocksEditorShellProps) {
  const badgeVariant = workspaceStatus === 'invalid' ? 'outline' : 'secondary';
  const statusLabel = status ?? workspaceStatusLabels[workspaceStatus];
  const mountElementRef = useRef<HTMLDivElement>(null);
  const mountHandleRef = useRef<BlocksEditorMountHandle | undefined>(undefined);
  const [mountMessage, setMountMessage] = useState(
    provider.supportsNativeMount
      ? 'TurboWarp listo para montar.'
      : 'Bridge TurboWarp pendiente.',
  );

  function markDirty() {
    if (readOnly) {
      return;
    }

    onArtifactChange?.({
      ...artifact,
      status: 'dirty',
    });
  }

  function openNativeEditor() {
    if (!mountElementRef.current) {
      return;
    }

    mountHandleRef.current?.dispose();
    const result = provider.mountWorkspace({
      element: mountElementRef.current,
      artifact,
      onArtifactChange,
    });

    if (!result.mounted) {
      setMountMessage(result.reason);
      return;
    }

    mountHandleRef.current = result.handle;
    setMountMessage(`${provider.name} montado.`);
  }

  return (
    <section className="min-h-[420px] rounded-lg border bg-card">
      <header className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Editor visual</p>
          <h2 className="text-lg font-semibold">{workspaceName}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{provider.name}</Badge>
          <Badge variant={badgeVariant}>{statusLabel}</Badge>
          <Badge variant="outline">{artifact.format}</Badge>
        </div>
      </header>

      <div className="grid min-h-[340px] gap-4 p-4 md:grid-cols-[220px_1fr]">
        <aside className="rounded-md border bg-muted p-3">
          <p className="mb-3 text-sm font-medium">Bloques</p>
          <div className="space-y-2">
            {blocks.map((block) => (
              <div key={block} className="rounded-md bg-background px-3 py-2 text-sm shadow-sm">
                {block}
              </div>
            ))}
          </div>
        </aside>

        <div className="flex min-h-[280px] flex-col rounded-md border border-dashed bg-background p-6">
          <div
            ref={mountElementRef}
            className="flex flex-1 items-center justify-center rounded-md bg-muted/40 text-center"
          >
            <div>
              <p className="text-base font-medium">Área de trabajo</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                {artifact.label}
              </p>
              <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                {mountMessage}
              </p>
            </div>
          </div>

          {validationErrors.length > 0 ? (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {validationErrors.join(' ')}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              disabled={readOnly}
              onClick={openNativeEditor}
            >
              Abrir {provider.name}
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              disabled={readOnly}
              onClick={markDirty}
            >
              Marcar editado
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default BlocksEditorShell;

const workspaceStatusLabels: Record<BlocksWorkspaceStatus, string> = {
  empty: 'Vacio',
  loaded: 'Cargado',
  dirty: 'Editado',
  invalid: 'Invalido',
  'read-only': 'Solo lectura',
};
