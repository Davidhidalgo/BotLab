import { fireEvent, render, waitFor } from '@testing-library/react';
import type { BlocksWorkspaceArtifact } from '@botlab/blocks';
import type {
  NativeAppConnection,
  NativeAppSnapshot,
} from '@botlab/simulators-microduck-native';
import { NativeSimulatorPanel } from './native-simulator-panel';
import { parseHuggingFaceModel } from './huggingface-models';

const model = parseHuggingFaceModel(
  'https://huggingface.co/joanfox/microduck-happy-hop',
  'happy-hop',
  3,
);
const workspace = {
  id: 'program',
  behaviorId: 'program',
  kind: 'blocks',
  engine: 'scratch-blocks',
  format: 'scratch-xml',
  status: 'loaded',
  validationErrors: [],
  label: 'Program',
  createdAt: new Date(0).toISOString(),
  content:
    '<xml><block type="event_whenflagclicked"><next><block type="botlab_microduck_community_skill" id="hop"><field name="SKILL">happy-hop</field></block></next></block></xml>',
} as BlocksWorkspaceArtifact;

it('imports only the model used by the program on connection before enabling Run', async () => {
  let data: NativeAppSnapshot = {
    protocolVersion: 1,
    simulatorId: 'microduck',
    presentation: 'embedded',
    frameTime: 0,
    depth: null,
    program: null,
    postureBusy: false,
    observedPosture: 'stand',
    state: {
      policy: 'stand',
      odom: { position: [0, 0, 0], yaw: 0 },
      safety: { fallen: false },
      loop: { hz: 50 },
    },
    capabilities: { skills: [], executableSkills: [], postures: [] },
    importedSkills: [],
  };
  const connection: NativeAppConnection = {
    videoUrl: 'http://local/video',
    connect: jest.fn(async () => undefined),
    snapshot: jest.fn(async () => data),
    importSkill: jest.fn(async (input) => {
      data = {
        ...data,
        capabilities: {
          ...data.capabilities,
          skills: [input.name],
          executableSkills: [input.name],
        },
        importedSkills: [
          { ...model, revision: 'a'.repeat(40), sha256: 'b'.repeat(64) },
        ],
      };
      return data;
    }),
    run: jest.fn(async () => '00000000-0000-4000-8000-000000000001' as const),
    stop: jest.fn(async () => undefined),
    reset: jest.fn(async () => undefined),
    togglePosture: jest.fn(async () => undefined),
    dispose: jest.fn(),
  };
  const view = render(
    <NativeSimulatorPanel
      workspace={workspace}
      models={[
        model,
        parseHuggingFaceModel(
          'https://huggingface.co/neil-jo/microduck-polite-bow',
          'bow',
          4,
        ),
      ]}
      locale="es"
      onActiveBlock={jest.fn()}
      onBusy={jest.fn()}
      connectionFactory={() => connection}
    />,
  );
  fireEvent.click(view.getByRole('button', { name: 'Conectar' }));
  await waitFor(() =>
    expect(connection.importSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'happy-hop',
        repo: model.repo,
        duration: 3,
      }),
    ),
  );
  await waitFor(() =>
    expect(
      view.getByRole('button', { name: 'Ejecutar' }).hasAttribute('disabled'),
    ).toBe(false),
  );
  expect(connection.importSkill).toHaveBeenCalledTimes(1);
  view.unmount();
});
