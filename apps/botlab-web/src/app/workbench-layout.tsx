import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Blocks, Radar } from 'lucide-react';

type WorkbenchView = 'program' | 'simulator';

export function WorkbenchLayout({
  labels,
  editor,
  simulator,
}: {
  labels: { program: string; simulator: string; views: string };
  editor: ReactNode;
  simulator: ReactNode;
}) {
  const [view, setView] = useState<WorkbenchView>('program');
  const [compact, setCompact] = useState(
    () => window.matchMedia?.('(max-width: 1023px)').matches ?? false,
  );
  const programRef = useRef<HTMLDivElement>(null);
  const simulatorRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 1023px)');
    if (!media) return;
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (programRef.current)
      programRef.current.inert = compact && view !== 'program';
    if (simulatorRef.current)
      simulatorRef.current.inert = compact && view !== 'simulator';
  }, [compact, view]);

  return (
    <div className="workbench">
      <div className="workbench-tabs" role="tablist" aria-label={labels.views}>
        {(['program', 'simulator'] as const).map((name, index) => (
          <button
            key={name}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={`tab-${name}`}
            type="button"
            role="tab"
            aria-controls={`view-${name}`}
            aria-selected={view === name}
            tabIndex={view === name ? 0 : -1}
            onClick={() => setView(name)}
            onKeyDown={(event) => {
              if (
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
              setView(next === 0 ? 'program' : 'simulator');
              tabRefs.current[next]?.focus();
            }}
          >
            {name === 'program' ? <Blocks size={16} /> : <Radar size={16} />}
            {labels[name]}
          </button>
        ))}
      </div>
      <div className="workbench-surfaces">
        <div
          ref={programRef}
          id="view-program"
          role={compact ? 'tabpanel' : 'region'}
          aria-label={labels.program}
          aria-hidden={compact && view !== 'program'}
          className={`workbench-surface ${view !== 'program' ? 'workbench-inactive' : ''}`}
        >
          {editor}
        </div>
        <div
          ref={simulatorRef}
          id="view-simulator"
          role={compact ? 'tabpanel' : 'region'}
          aria-label={labels.simulator}
          aria-hidden={compact && view !== 'simulator'}
          className={`workbench-surface ${view !== 'simulator' ? 'workbench-inactive' : ''}`}
        >
          {simulator}
        </div>
      </div>
    </div>
  );
}
