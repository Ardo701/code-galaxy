import { Logo } from './Logo';

interface GalaxyLoaderProps {
  label?: string;
  error?: string;
  /** Shows how far along the work is (0–100); without it, the bar just sweeps. */
  progress?: number;
  /** Smaller text under the label, e.g. the current step. */
  detail?: string;
}

/** Full-size placeholder shown while the history is being read. */
export function GalaxyLoader({ label = 'Growing your tree…', error, progress, detail }: GalaxyLoaderProps) {
  const known = progress !== undefined;
  return (
    <div className="cg-root cg-loader" role={error ? 'alert' : 'status'}>
      <div className="cg-loader-inner">
        <Logo size={36} />
        <div className="cg-loader-label">{error ? 'Something went wrong' : label}</div>
        {!error && (
          <div
            className={`cg-loader-progress${known ? '' : ' is-indeterminate'}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={known ? progress : undefined}
          >
            <div
              className="cg-loader-progress-fill"
              style={known ? { width: `${Math.max(2, Math.min(100, progress))}%` } : undefined}
            />
          </div>
        )}
        {!error && detail && <div className="cg-loader-detail">{detail}</div>}
        {error && <pre className="cg-loader-error">{error}</pre>}
      </div>
    </div>
  );
}
