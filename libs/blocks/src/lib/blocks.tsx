import { Badge } from '@botlab/ui';

export interface BlocksEditorShellProps {
  workspaceName: string;
  status: string;
  blocks: string[];
}

export function BlocksEditorShell({
  workspaceName,
  status,
  blocks,
}: BlocksEditorShellProps) {
  return (
    <section className="min-h-[420px] rounded-lg border bg-card">
      <header className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Visual editor boundary</p>
          <h2 className="text-lg font-semibold">{workspaceName}</h2>
        </div>
        <Badge variant="secondary">{status}</Badge>
      </header>

      <div className="grid min-h-[340px] gap-4 p-4 md:grid-cols-[220px_1fr]">
        <aside className="rounded-md border bg-muted p-3">
          <p className="mb-3 text-sm font-medium">Block palette</p>
          <div className="space-y-2">
            {blocks.map((block) => (
              <div key={block} className="rounded-md bg-background px-3 py-2 text-sm shadow-sm">
                {block}
              </div>
            ))}
          </div>
        </aside>

        <div className="flex items-center justify-center rounded-md border border-dashed bg-background p-6 text-center">
          <div>
            <p className="text-base font-medium">Scratch Blocks / TurboWarp mount point</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              The host app talks to this package through props and artifacts; the block engine can be replaced without leaking implementation details into BotLab.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default BlocksEditorShell;
