import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, GitBranch, GitMerge, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useGalaxyContext } from '../context';
import { formatDateTime, formatNumber, formatRelative } from '../format';
import { useGalaxy } from '../store';

const DIFF_BLOCKS = 10;

function hostLabel(url: string): string {
  const host = new URL(url).hostname;
  if (host === 'github.com') return 'GitHub';
  if (host === 'gitlab.com') return 'GitLab';
  if (host === 'bitbucket.org') return 'Bitbucket';
  if (host === 'codeberg.org') return 'Codeberg';
  return host;
}

function CopyHash({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className="cg-hash-button"
      onClick={() =>
        navigator.clipboard?.writeText(hash).then(
          () => setCopied(true),
          () => undefined,
        )
      }
      aria-label="Copy commit hash"
    >
      <code>{hash.slice(0, 10)}</code>
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

export function CommitPanel() {
  const { data, layout } = useGalaxyContext();
  const selected = useGalaxy((state) => state.selected);
  if (selected < 0) return null;

  const commit = data.commits[selected];
  const author = data.authors[commit.author];
  const color = layout.authorColors[commit.author];
  const branch = layout.branches[layout.branchOf[selected]];
  const isMerge = commit.parents.length > 1;
  const total = commit.additions + commit.deletions;
  const greenBlocks = total > 0 ? Math.round((commit.additions / total) * DIFF_BLOCKS) : 0;
  const link = data.commitUrl?.replace('{hash}', commit.hash);
  const select = (index: number) => useGalaxy.getState().select(index, true);

  return (
    <aside className="cg-details cg-panel cg-enter" key={selected} aria-label="Commit details">
      <div className="cg-panel-head">
        <span className="cg-label">{isMerge ? 'Merge commit' : 'Commit'}</span>
        <div className="cg-details-nav">
          <button
            type="button"
            className="cg-close"
            disabled={selected === 0}
            onClick={() => select(selected - 1)}
            aria-label="Previous commit"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="cg-close"
            disabled={selected === data.commits.length - 1}
            onClick={() => select(selected + 1)}
            aria-label="Next commit"
          >
            <ChevronRight size={16} />
          </button>
          <button type="button" className="cg-close" onClick={() => useGalaxy.getState().select(-1)} aria-label="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      <h2 className="cg-details-title">{commit.message || '(no message)'}</h2>

      <div className="cg-author-row">
        <span className="cg-swatch" style={{ background: color }} />
        <span className="cg-author-row-name">{author?.name ?? 'Unknown'}</span>
        <span className="cg-author-row-date cg-muted">
          {formatDateTime(commit.time)} · {formatRelative(commit.time)}
        </span>
      </div>

      {!isMerge && (
        <div className="cg-diffstat">
          <span className="cg-add">+{formatNumber(commit.additions)}</span>
          <span className="cg-del">−{formatNumber(commit.deletions)}</span>
          <span className="cg-blocks" aria-hidden="true">
            {Array.from({ length: DIFF_BLOCKS }, (_, i) => (
              <i key={i} className={total === 0 ? '' : i < greenBlocks ? 'is-add' : 'is-del'} />
            ))}
          </span>
          <span className="cg-muted">
            {commit.files} {commit.files === 1 ? 'file' : 'files'}
          </span>
        </div>
      )}

      <dl className="cg-facts">
        <dt>Hash</dt>
        <dd>
          <CopyHash hash={commit.hash} />
        </dd>
        <dt>Branch</dt>
        <dd className="cg-branch">
          <GitBranch size={13} />
          <span className={`cg-branch-name${branch.label ? '' : ' cg-muted'}`}>{branch.label ?? 'side branch'}</span>
          {branch.id === 0 && <span className="cg-muted">(trunk)</span>}
        </dd>
        {branch.merge >= 0 && (
          <>
            <dt>Merged in</dt>
            <dd>
              <button type="button" className="cg-link" onClick={() => select(branch.merge)}>
                <GitMerge size={13} /> {data.commits[branch.merge].hash.slice(0, 7)}
              </button>
            </dd>
          </>
        )}
        {commit.parents.length > 0 && (
          <>
            <dt>{commit.parents.length > 1 ? 'Parents' : 'Parent'}</dt>
            <dd className="cg-parents">
              {commit.parents.map((parent) => (
                <button key={parent} type="button" className="cg-link" onClick={() => select(parent)}>
                  {data.commits[parent].hash.slice(0, 7)}
                </button>
              ))}
            </dd>
          </>
        )}
      </dl>

      {link && (
        <a className="cg-button" href={link} target="_blank" rel="noreferrer">
          Open on {hostLabel(link)} <ExternalLink size={14} />
        </a>
      )}
    </aside>
  );
}
