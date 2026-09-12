import { act, fireEvent, render } from '@testing-library/react';
import { useEffect } from 'react';
import { WorkbenchLayout } from './workbench-layout';

describe('WorkbenchLayout', () => {
  const labels = { program: 'Program', simulator: 'Simulator', views: 'Workspace views' };
  afterEach(() => jest.restoreAllMocks());

  it('switches accessible mobile panels without unmounting the editor or simulator', () => {
    let resize: () => void = () => {};
    const media = { matches: true, addEventListener: jest.fn((_, callback) => { resize = callback; }), removeEventListener: jest.fn() };
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: jest.fn(() => media) });
    const mounted = jest.fn();
    const disposed = jest.fn();
    function Surface() {
      useEffect(() => { mounted(); return disposed; }, []);
      return <input aria-label="Program name" defaultValue="My program" />;
    }
    const screen = render(<WorkbenchLayout labels={labels} editor={<Surface />} simulator={<iframe title="Test simulator" />} />);
    const programTab = screen.getByRole('tab', { name: 'Program' });
    const simulatorTab = screen.getByRole('tab', { name: 'Simulator' });
    const program = screen.getByRole('tabpanel', { name: 'Program' });
    const frame = screen.getByTitle('Test simulator');
    const name = screen.getByLabelText('Program name');
    fireEvent.change(name, { target: { value: 'Saved edit' } });
    fireEvent.keyDown(programTab, { key: 'ArrowRight' });
    expect(simulatorTab).toBe(document.activeElement);
    expect(simulatorTab.getAttribute('aria-selected')).toBe('true');
    expect(program.inert).toBe(true);
    expect(screen.queryByRole('tabpanel', { name: 'Program' })).toBeNull();
    expect(screen.getByRole('tabpanel', { name: 'Simulator' })).toBeTruthy();
    fireEvent.keyDown(simulatorTab, { key: 'Home' });
    expect(name).toHaveProperty('value', 'Saved edit');
    expect(program.inert).toBe(false);
    fireEvent.click(simulatorTab);
    act(() => { media.matches = false; resize(); });
    expect(screen.getByRole('region', { name: 'Program' }).inert).toBe(false);
    expect(screen.getByRole('region', { name: 'Simulator' }).inert).toBe(false);
    expect(screen.getByTitle('Test simulator')).toBe(frame);
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(disposed).not.toHaveBeenCalled();
    screen.unmount();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(media.removeEventListener).toHaveBeenCalled();
  });
});
