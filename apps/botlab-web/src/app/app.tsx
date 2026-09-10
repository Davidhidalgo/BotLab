import { createMicroDuckAdapter } from '@botlab/adapters-microduck';
import { createStackChanAdapter } from '@botlab/adapters-stackchan';
import { BlocksEditorShell, sampleBlocksWorkspaceArtifact } from '@botlab/blocks';
import { botLabConcepts } from '@botlab/model';
import { createBotLabRuntime } from '@botlab/runtime';
import { officialSimulatorIntegrations } from '@botlab/simulators';
import { Badge, Button } from '@botlab/ui';
import { Activity, Blocks, Cpu, GitBranch, Play, ShieldCheck, Workflow } from 'lucide-react';

const runtime = createBotLabRuntime({
  adapters: [createMicroDuckAdapter(), createStackChanAdapter()],
  simulators: officialSimulatorIntegrations,
});

const featuredConcepts = botLabConcepts.filter(({ concept }) =>
  ['policy', 'skill', 'behavior', 'arbitration'].includes(concept),
);

const conceptIcons = {
  policy: ShieldCheck,
  skill: Cpu,
  behavior: Workflow,
  arbitration: GitBranch,
};

export function App() {
  const targets = runtime.listTargets();
  const capabilities = runtime.listCapabilities();

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
              Una base local para diseñar comportamientos por bloques, ejecutarlos sobre un runtime comun y conectar robots reales o simulados mediante adapters.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button>
              <Play className="h-4 w-4" />
              Ejecutar demo
            </Button>
            <Button variant="secondary">
              <Blocks className="h-4 w-4" />
              Abrir editor
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[1.35fr_0.65fr]">
        <BlocksEditorShell
          workspaceName="Editor de bloques BotLab"
          artifact={sampleBlocksWorkspaceArtifact}
          blocks={['al iniciar robot', 'fijar LEDs MicroDuck', 'esperar capacidad', 'publicar artefacto']}
        />

        <aside className="space-y-4">
          <Panel title="Runtime">
            <Metric label="Targets" value={targets.length.toString()} />
            <Metric label="Capabilities" value={capabilities.length.toString()} />
            <Metric
              label="Simulators"
              value={runtime.listSimulatorIntegrations().length.toString()}
            />
          </Panel>

          <Panel title="Targets">
            <div className="space-y-3">
              {targets.map((target) => (
                <div key={target.id} className="rounded-md border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{target.name}</span>
                    <Badge variant={target.status === 'available' ? 'default' : 'secondary'}>
                      {target.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{target.kind}</p>
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
                <h2 className="text-base font-semibold capitalize">{concept}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

export default App;

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
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
