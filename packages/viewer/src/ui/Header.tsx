import { ArrowLeft } from 'lucide-react';
import { useGalaxyContext } from '../context';
import { formatMonth, formatNumber } from '../format';
import { Logo } from './Logo';

export function Header({ onBack, backLabel }: { onBack?: () => void; backLabel: string }) {
  const { data, layout } = useGalaxyContext();
  const { first, last } = layout.timeline;
  const branches = layout.branches.length - 1;

  return (
    <header className="cg-header cg-panel">
      <div className="cg-header-top">
        {onBack ? (
          <button type="button" className="cg-back" onClick={onBack}>
            <ArrowLeft size={13} /> {backLabel}
          </button>
        ) : (
          <>
            <Logo size={15} /> Code Galaxy
          </>
        )}
      </div>
      <h1 className="cg-title" title={data.name}>
        {data.name}
      </h1>
      <p className="cg-stats">
        <span>
          <b>{formatNumber(data.commits.length)}</b> commits
        </span>
        <span>
          <b>{formatNumber(branches)}</b> {branches === 1 ? 'branch' : 'branches'}
        </span>
        <span>
          <b>{formatNumber(data.authors.length)}</b> {data.authors.length === 1 ? 'contributor' : 'contributors'}
        </span>
        {data.commits.length > 0 && (
          <span className="cg-stats-period">
            {formatMonth(first)} – {formatMonth(last)}
          </span>
        )}
      </p>
    </header>
  );
}
