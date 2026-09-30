import { useState } from 'react';
import { useGalaxyContext } from '../context';
import { formatCompact, formatNumber } from '../format';
import { useGalaxy } from '../store';

const COLLAPSED = 6;
const EXPANDED = 60;

export function Legend() {
  const { data, layout } = useGalaxyContext();
  const focusAuthor = useGalaxy((state) => state.focusAuthor);
  const [expanded, setExpanded] = useState(false);
  const authors = data.authors.slice(0, expanded ? EXPANDED : COLLAPSED);
  const hidden = data.authors.length - authors.length;

  return (
    <section className="cg-legend cg-panel" aria-label="Contributors">
      <div className="cg-panel-head">
        <span className="cg-panel-title">
          Contributors <span className="cg-count">{formatNumber(data.authors.length)}</span>
        </span>
        {focusAuthor >= 0 && (
          <button type="button" className="cg-text-button" onClick={() => useGalaxy.getState().setFocusAuthor(-1)}>
            Show all
          </button>
        )}
      </div>
      <ul className={`cg-authors${expanded ? ' is-expanded' : ''}`}>
        {authors.map((author, index) => {
          const color = layout.authorColors[index];
          const active = focusAuthor === index;
          return (
            <li key={index}>
              <button
                type="button"
                className={`cg-author${active ? ' is-active' : ''}${focusAuthor >= 0 && !active ? ' is-dimmed' : ''}`}
                onClick={() => useGalaxy.getState().setFocusAuthor(active ? -1 : index)}
                title={`Highlight ${author.name}'s commits`}
              >
                <span className="cg-swatch" style={{ background: color }} />
                <span className="cg-author-name">{author.name}</span>
                <span className="cg-author-count">{formatCompact(author.commits)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {(hidden > 0 || expanded) && data.authors.length > COLLAPSED && (
        <button type="button" className="cg-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : `${hidden} more`}
        </button>
      )}
    </section>
  );
}
