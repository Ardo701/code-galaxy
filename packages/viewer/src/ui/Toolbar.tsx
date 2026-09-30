import { Camera, Info, Minimize2, Orbit, Scan, Spline, Wind, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useGalaxyContext } from '../context';
import { useGalaxy } from '../store';

function ToolButton({
  label,
  shortcut,
  active,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`cg-tool${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      data-tip={shortcut ? `${label} · ${shortcut}` : label}
    >
      {children}
    </button>
  );
}

export function Toolbar({ onClose }: { onClose?: () => void }) {
  const { data, container } = useGalaxyContext();
  const autoRotate = useGalaxy((state) => state.autoRotate);
  const wind = useGalaxy((state) => state.wind);
  const lianas = useGalaxy((state) => state.lianas);
  const [help, setHelp] = useState(false);

  const screenshot = () => {
    const canvas = container.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${data.name}-galaxy.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <>
      <div className="cg-toolbar cg-panel" role="toolbar" aria-label="View controls">
        <ToolButton
          label="Auto-rotate"
          shortcut="A"
          active={autoRotate}
          onClick={() => useGalaxy.getState().setAutoRotate(!autoRotate)}
        >
          <Orbit size={17} />
        </ToolButton>
        <ToolButton label="Wind" shortcut="W" active={wind} onClick={() => useGalaxy.getState().setWind(!wind)}>
          <Wind size={17} />
        </ToolButton>
        <ToolButton
          label="Merge arcs"
          shortcut="M"
          active={lianas}
          onClick={() => useGalaxy.getState().setLianas(!lianas)}
        >
          <Spline size={17} />
        </ToolButton>
        <ToolButton label="Reset view" shortcut="R" onClick={() => useGalaxy.getState().resetCamera()}>
          <Scan size={17} />
        </ToolButton>
        <ToolButton label="Screenshot" onClick={screenshot}>
          <Camera size={17} />
        </ToolButton>
        <span className="cg-toolbar-sep" />
        <ToolButton label="How to read the tree" active={help} onClick={() => setHelp(!help)}>
          <Info size={17} />
        </ToolButton>
        {onClose && (
          <>
            <span className="cg-toolbar-sep" />
            <ToolButton label="Close" shortcut="Esc" onClick={onClose}>
              <Minimize2 size={17} />
            </ToolButton>
          </>
        )}
      </div>
      {help && <HelpCard onClose={() => setHelp(false)} />}
    </>
  );
}

function HelpCard({ onClose }: { onClose: () => void }) {
  return (
    <div className="cg-help cg-panel cg-enter">
      <div className="cg-panel-head">
        <span className="cg-panel-title">How to read the tree</span>
        <button type="button" className="cg-close" onClick={onClose} aria-label="Close">
          <X size={15} />
        </button>
      </div>
      <ul className="cg-help-list">
        <li>
          <i className="cg-key-swatch is-trunk" />
          <span>
            <b>Trunk</b> — the history of the main branch, oldest at the roots.
          </span>
        </li>
        <li>
          <i className="cg-key-swatch is-branch" />
          <span>
            <b>Branches</b> — Git branches, growing from the commit they started from.
          </span>
        </li>
        <li>
          <i className="cg-key-swatch is-leaf" />
          <span>
            <b>Leaves</b> — one per commit. Color = author, size = lines changed.
          </span>
        </li>
        <li>
          <i className="cg-key-swatch is-bud" />
          <span>
            <b>Glowing buds</b> — merge commits.
          </span>
        </li>
        <li>
          <i className="cg-key-swatch is-liana" />
          <span>
            <b>Arcs of light</b> — a branch flowing back where it was merged.
          </span>
        </li>
      </ul>
      <div className="cg-help-keys">
        <span>
          <kbd>Space</kbd> replay growth
        </span>
        <span>
          <kbd>←</kbd>
          <kbd>→</kbd> previous / next commit
        </span>
        <span>
          <kbd>R</kbd> reset view
        </span>
        <span>
          <kbd>M</kbd> merge arcs
        </span>
        <span>
          <kbd>Esc</kbd> close
        </span>
      </div>
    </div>
  );
}
