import { Pause, Play } from 'lucide-react';
import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useGalaxyContext } from '../context';
import { formatMonth, formatNumber } from '../format';
import { useGalaxy } from '../store';

const MAX_YEAR_LABELS = 9;

export function Timeline() {
  const { data, layout } = useGalaxyContext();
  const progress = useGalaxy((state) => state.progress);
  const playing = useGalaxy((state) => state.playing);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const count = data.commits.length;
  const index = Math.min(count - 1, Math.max(0, Math.round(progress * (count - 1))));
  // Smoothed date: a commit with a broken clock does not make the timeline jump.
  const date = layout.timeline.times[index] ?? 0;
  const percent = progress * 100;

  const activity = useMemo(() => {
    const values = layout.activity;
    let path = 'M0 32';
    values.forEach((value, i) => {
      path += ` L${i + 0.5} ${(32 - 3 - value * 26).toFixed(2)}`;
    });
    return { path: `${path} L${values.length} 32 Z`, width: values.length };
  }, [layout]);

  // Keep year labels readable: skip those too close to the previous one.
  const years = useMemo(() => {
    const spacing = 1 / MAX_YEAR_LABELS;
    const kept: typeof layout.yearMarks = [];
    for (const mark of layout.yearMarks) {
      if (mark.rank < 0.03 || mark.rank > 0.94) continue;
      if (kept.length && mark.rank - kept[kept.length - 1].rank < spacing) continue;
      kept.push(mark);
    }
    return kept;
  }, [layout]);

  const scrubTo = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect) return;
    useGalaxy.getState().setProgress((clientX - rect.left) / rect.width);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    useGalaxy.getState().pause();
    scrubTo(event.clientX);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.01;
    const galaxy = useGalaxy.getState();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      galaxy.pause();
      galaxy.setProgress(galaxy.progress + (event.key === 'ArrowLeft' ? -step : step));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      galaxy.pause();
      galaxy.setProgress(event.key === 'Home' ? 0 : 1);
    }
  };

  const graph = (
    <svg viewBox={`0 0 ${activity.width} 32`} preserveAspectRatio="none" aria-hidden="true">
      <path d={activity.path} fill="currentColor" />
    </svg>
  );

  return (
    <div className="cg-timeline cg-panel">
      <button
        type="button"
        className="cg-play"
        onClick={() => useGalaxy.getState().togglePlay()}
        aria-label={playing ? 'Pause' : 'Replay the growth'}
        data-tip={playing ? 'Pause · Space' : 'Replay growth · Space'}
      >
        {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
      </button>
      <div
        ref={track}
        className="cg-track"
        role="slider"
        tabIndex={0}
        aria-label="History"
        aria-valuemin={0}
        aria-valuemax={count}
        aria-valuenow={index + 1}
        aria-valuetext={`${formatMonth(date)}, commit ${index + 1} of ${count}`}
        onPointerDown={onPointerDown}
        onPointerMove={(event) => dragging.current && scrubTo(event.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={onKeyDown}
      >
        <div className="cg-activity is-base">{graph}</div>
        <div className="cg-activity is-lit" style={{ clipPath: `inset(0 ${100 - percent}% 0 0)` }}>
          {graph}
        </div>
        <div className="cg-track-line">
          <div className="cg-track-fill" style={{ width: `${percent}%` }} />
        </div>
        {years.map((mark) => (
          <span key={mark.year} className="cg-year" style={{ left: `${mark.rank * 100}%` }}>
            {mark.year}
          </span>
        ))}
        <div className="cg-thumb" style={{ left: `${percent}%` }} />
      </div>
      <div className="cg-now">
        <div className="cg-now-date">{formatMonth(date)}</div>
        <div className="cg-now-count">
          {formatNumber(index + 1)} / {formatNumber(count)}
        </div>
      </div>
    </div>
  );
}
