import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BlocksEditorShell } from './blocks';
import {
  createBlocksEditorProvider,
  sampleBlocksWorkspaceArtifact,
  type BlocksEditorMountRequest,
  type BlocksEditorMountResponse,
  type BlocksWorkspaceArtifact,
} from './blocks-contract';
afterEach(cleanup);
it('forwards changes to the current execution callback without remounting the workspace', async () => {
  let request: BlocksEditorMountRequest | undefined;
  const mount = vi.fn<
    (r: BlocksEditorMountRequest) => BlocksEditorMountResponse
  >((r) => {
    request = r;
    return {
      mounted: true,
      handle: {
        exportWorkspace: () => r.artifact,
        dispose: vi.fn<() => void>(),
      },
    };
  });
  const provider = {
    ...createBlocksEditorProvider('mock'),
    name: 'Test',
    supportsNativeMount: true,
    mountWorkspace: mount,
  };
  const before = vi.fn<(a: BlocksWorkspaceArtifact) => void>(),
    during = vi.fn<(a: BlocksWorkspaceArtifact) => void>();
  const props = {
    workspaceName: 'test',
    blocks: [],
    artifact: sampleBlocksWorkspaceArtifact,
    provider,
    autoMountNativeEditor: false,
  };
  const view = render(
    <BlocksEditorShell {...props} onArtifactChange={before} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open Test' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Reset native editor' }),
    ).toBeTruthy(),
  );
  view.rerender(<BlocksEditorShell {...props} onArtifactChange={during} />);
  act(() =>
    request?.onArtifactChange?.({
      ...sampleBlocksWorkspaceArtifact,
      status: 'dirty',
    }),
  );
  expect(before).not.toHaveBeenCalled();
  expect(during).toHaveBeenCalledOnce();
  expect(mount).toHaveBeenCalledOnce();
});

it('ignores old workspace events and disposes a mount that completes after unmount', async () => {
  let request: BlocksEditorMountRequest | undefined;
  let finish:
    | ((response: Awaited<BlocksEditorMountResponse>) => void)
    | undefined;
  const pending = new Promise<Awaited<BlocksEditorMountResponse>>((resolve) => {
    finish = resolve;
  });
  const dispose = vi.fn<() => void>();
  const changed = vi.fn<(a: BlocksWorkspaceArtifact) => void>();
  const provider = {
    ...createBlocksEditorProvider('mock'),
    name: 'Async',
    supportsNativeMount: true,
    mountWorkspace: (next: BlocksEditorMountRequest) => {
      request = next;
      return pending;
    },
  };
  const view = render(
    <BlocksEditorShell
      workspaceName="test"
      blocks={[]}
      artifact={sampleBlocksWorkspaceArtifact}
      provider={provider}
      autoMountNativeEditor={false}
      onArtifactChange={changed}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open Async' }));
  view.rerender(
    <BlocksEditorShell
      workspaceName="test"
      blocks={[]}
      artifact={{ ...sampleBlocksWorkspaceArtifact, id: 'imported-workspace' }}
      provider={provider}
      autoMountNativeEditor={false}
      onArtifactChange={changed}
    />,
  );
  act(() => request?.onArtifactChange?.(sampleBlocksWorkspaceArtifact));
  expect(changed).not.toHaveBeenCalled();
  view.unmount();
  await act(async () => {
    request?.onArtifactChange?.(sampleBlocksWorkspaceArtifact);
    finish?.({
      mounted: true,
      handle: { dispose, exportWorkspace: () => sampleBlocksWorkspaceArtifact },
    });
    await pending;
  });
  expect(changed).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
});
