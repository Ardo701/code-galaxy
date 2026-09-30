import { GitMerge } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { useGalaxyContext } from '../context';
import { formatNumber, formatRelative } from '../format';
import { useGalaxy } from '../store';

const OFFSET = 18;

/** Small card following the pointer while it hovers a leaf. */
export function Tooltip() {
  const { data, layout, pointer, container } = useGalaxyContext();
  const hovered = useGalaxy((state) => state.hovered);
  const selected = useGalaxy((state) => state.selected);
  const card = useRef<HTMLDivElement>(null);
  const visible = hovered >= 0 && hovered !== selected;

  useLayoutEffect(() => {
    if (!visible) return;
    let frame = 0;
    const place = () => {
      const element = card.current;
      const bounds = container.current;
      if (element && bounds && pointer.current) {
        const { x, y } = pointer.current;
        const width = element.offsetWidth;
        const height = element.offsetHeight;
        const left = x + OFFSET + width > bounds.clientWidth ? x - OFFSET - width : x + OFFSET;
        const top = y + OFFSET + height > bounds.clientHeight ? y - OFFSET - height : y + OFFSET;
        element.style.transform = `translate3d(${Math.max(8, left)}px, ${Math.max(8, top)}px, 0)`;
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [visible, pointer, container]);

  if (!visible) return null;
  const commit = data.commits[hovered];
  const author = data.authors[commit.author];
  const color = layout.authorColors[commit.author];
  const isMerge = commit.parents.length > 1;

  return (
    <div ref={card} className="cg-tooltip cg-panel" role="status">
      <div className="cg-tooltip-head">
        <span className="cg-swatch" style={{ background: color }} />
        <span className="cg-tooltip-author">{author?.name ?? 'Unknown'}</span>
        <span className="cg-muted">· {formatRelative(commit.time)}</span>
      </div>
      <div className="cg-tooltip-message">{commit.message || '(no message)'}</div>
      <div className="cg-tooltip-meta">
        {isMerge ? (
          <span className="cg-merge-note">
            <GitMerge size={13} /> Merge commit
          </span>
        ) : (
          <>
            <span className="cg-add">+{formatNumber(commit.additions)}</span>
            <span className="cg-del">−{formatNumber(commit.deletions)}</span>
            <span className="cg-muted">
              {commit.files} {commit.files === 1 ? 'file' : 'files'}
            </span>
          </>
        )}
        <code className="cg-hash">{commit.hash.slice(0, 7)}</code>
      </div>
    </div>
  );
}
