import { createMicroDuckAdapter } from '@botlab/adapters-microduck';
import { createStackChanAdapter } from '@botlab/adapters-stackchan';
import { BlocksEditorShell, sampleBlocksWorkspaceArtifact } from '@botlab/blocks';
import {
  botLabConcepts,
  sampleArbitrationStrategies,
  sampleMicroDuckCompiledBehaviorArtifact,
  sampleMicroDuckLedBehavior,
  samplePolicies,
  sampleSchedulers,
  sampleSkills,
} from '@botlab/model';
import { createBotLabRuntime } from '@botlab/runtime';
import { officialSimulatorIntegrations } from '@botlab/simulators';
import { Badge, Button } from '@botlab/ui';
import { Activity, Blocks, Cpu, GitBranch, Lock, Play, ShieldCheck, Workflow } from 'lucide-react';
import { useState, type ReactNode } from 'react';

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
  const [{ runtime, demoSessionId }] = useState(createRuntimeDemo);
  const [workspaceArtifact, setWorkspaceArtifact] = useState(sampleBlocksWorkspaceArtifact);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(() => runtime.inspectRuntime());
  const [runMessage, setRunMessage] = useState('Demo preparada para MicroDuck');
  const [isRunningDemo, setIsRunningDemo] = useState(false);
  const targets = runtime.listTargets();
  const capabilities = runtime.listCapabilities();
  const queue = runtimeSnapshot.queue;

  async function runDemo() {
    setIsRunningDemo(true);
    runtime.queueSession(demoSessionId, { priority: 5 });
    setRuntimeSnapshot(runtime.inspectRuntime());

    const run = runtime.runNextQueuedSession();
    setRuntimeSnapshot(runtime.inspectRuntime());

    const result = await run;
    setRuntimeSnapshot(runtime.inspectRuntime());
    setRunMessage(
      result
        ? `${result.snapshot.dispatchedCommandCount} comando(s) enviados. Estado: ${runtimeStateLabels[result.snapshot.state]}.`
        : 'No habia sesiones pendientes en cola.',
    );
    setIsRunningDemo(false);
  }

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
            <Button onClick={runDemo} disabled={isRunningDemo}>
              <Play className="h-4 w-4" />
              {isRunningDemo ? 'Ejecutando' : 'Ejecutar demo'}
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
          artifact={workspaceArtifact}
          blocks={['al iniciar robot', 'fijar LEDs MicroDuck', 'esperar capacidad', 'publicar artefacto']}
          onArtifactChange={setWorkspaceArtifact}
        />

        <aside className="space-y-4">
          <Panel title="Editor">
            <Metric label="Estado" value={workspaceStatusLabels[workspaceArtifact.status]} />
            <Metric label="Artifact" value={workspaceArtifact.id} />
            <Metric label="Formato" value={workspaceArtifact.format} />
          </Panel>

          <Panel title="Runtime">
            <Metric label="Targets" value={targets.length.toString()} />
            <Metric label="Capabilities" value={capabilities.length.toString()} />
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
                  {runtimeStateLabels[runtimeSnapshot.sessions[0]?.state ?? 'created']}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{runMessage}</p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <RuntimeList
                icon={<GitBranch className="h-4 w-4 text-primary" />}
                label="Cola"
                value={
                  queue.entries.length > 0
                    ? queue.entries
                        .map((entry) => `${entry.sessionId} · prioridad ${entry.priority}`)
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
                        .map((lock) => `${lock.capabilityId} por ${lock.sessionId}`)
                        .join(', ')
                    : 'Sin capacidades bloqueadas'
                }
              />
            </div>
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

function createRuntimeDemo() {
  const runtime = createBotLabRuntime({
    adapters: [createMicroDuckAdapter(), createStackChanAdapter()],
    simulators: officialSimulatorIntegrations,
    behaviors: [sampleMicroDuckLedBehavior],
    skills: sampleSkills,
    schedulers: sampleSchedulers,
    arbitrationStrategies: sampleArbitrationStrategies,
    policies: samplePolicies,
    dispatchers: [
      {
        targetId: 'microduck-usb',
        async dispatch(command) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, 250);
          });

          return {
            commandId: command.id,
            status: 'dispatched',
            message: `Demo dispatch ${command.commandId}.`,
          };
        },
      },
    ],
  });
  const session = runtime.createSession({ id: 'demo-microduck-leds' });

  runtime.loadCompiledBehavior(session.id, sampleMicroDuckCompiledBehaviorArtifact);
  runtime.confirmPolicy(session.id);

  return { runtime, demoSessionId: session.id };
}
