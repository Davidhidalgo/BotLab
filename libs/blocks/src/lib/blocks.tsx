import { Badge } from '@botlab/ui';
import {
  sampleBlocksWorkspaceArtifact,
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
  onArtifactChange,
}: BlocksEditorShellProps) {
  const badgeVariant = workspaceStatus === 'invalid' ? 'outline' : 'secondary';

  function markDirty() {
    if (readOnly) {
      return;
    }

    onArtifactChange?.({
      ...artifact,
      status: 'dirty',
    });
  }

  return (
    <section className="min-h-[420px] rounded-lg border bg-card">
      <header className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Editor visual</p>
          <h2 className="text-lg font-semibold">{workspaceName}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={badgeVariant}>{status ?? workspaceStatus}</Badge>
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
          <div className="flex flex-1 items-center justify-center text-center">
            <div>
              <p className="text-base font-medium">Área de trabajo</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                {artifact.label}
              </p>
            </div>
          </div>

          {validationErrors.length > 0 ? (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {validationErrors.join(' ')}
            </div>
          ) : null}

          <button
            type="button"
            className="mt-4 self-start rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            disabled={readOnly}
            onClick={markDirty}
          >
            Editar
          </button>
        </div>
      </div>
    </section>
  );
}

export default BlocksEditorShell;
