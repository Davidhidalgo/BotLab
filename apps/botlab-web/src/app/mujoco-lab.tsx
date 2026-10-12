import { useState } from 'react';
import { BlocksEditorShell } from '@botlab/blocks';
import MujocoSimulatorPanel from './mujoco-simulator-panel';
import { mujocoTargets, type MujocoTargetId } from './mujoco-targets';

export default function MujocoLab() {
  const [target, setTarget] = useState<MujocoTargetId>(
    'jumper-web-joint-probe',
  );
  return (
    <main className="min-h-screen bg-slate-100 p-5 text-slate-900">
      <header className="mb-4 flex items-center gap-4">
        <a href="/" className="text-indigo-600">
          ← BotLab · editor principal
        </a>
        <label>
          Robot{' '}
          <select
            aria-label="Robot"
            className="rounded border bg-white p-2"
            value={mujocoTargets[target].robot}
            onChange={(event) =>
              setTarget(
                event.target.value === 'jumper'
                  ? 'jumper-web-joint-probe'
                  : event.target.value === 'jumper-walking'
                    ? 'jumper-web-walking'
                    : 'microduck-mujoco-web',
              )
            }
          >
            {Object.entries(mujocoTargets).map(([id, item]) => (
              <option key={id} value={item.robot}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <LabWorkspace key={target} target={target} />
    </main>
  );
}
function LabWorkspace({ target }: { target: MujocoTargetId }) {
  const definition = mujocoTargets[target];
  const [scene, setScene] = useState<'flat' | 'obstacles'>('flat');
  const [artifact, setArtifact] = useState({ ...definition.example });
  const [activeBlock, setActiveBlock] = useState<string>();
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <MujocoSimulatorPanel
        robot={definition.robot}
        targetId={target}
        artifact={artifact}
        scene={scene}
        onSceneChange={setScene}
        onActiveBlock={setActiveBlock}
      />
      <BlocksEditorShell
        workspaceName={definition.name}
        blocks={[]}
        artifact={artifact}
        locale="es"
        availableBlockTypes={definition.blocks}
        activeBlockId={activeBlock}
        onArtifactChange={setArtifact}
      />
    </div>
  );
}
