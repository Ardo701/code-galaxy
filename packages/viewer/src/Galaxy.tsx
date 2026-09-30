import '@fontsource-variable/ibm-plex-sans';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './galaxy.css';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { GalaxyContext, type GalaxyContextValue } from './context';
import { computeLayout } from './layout/tree';
import { Scene } from './scene/Scene';
import { useGalaxy } from './store';
import type { RepoData } from './types';
import { CommitPanel } from './ui/CommitPanel';
import { Header } from './ui/Header';
import { Legend } from './ui/Legend';
import { Timeline } from './ui/Timeline';
import { Toolbar } from './ui/Toolbar';
import { Tooltip } from './ui/Tooltip';

export interface GalaxyProps {
  data: RepoData;
  className?: string;
  /** Show the repository header. Hide it when the page already presents the repository. */
  header?: boolean;
  /** Replay the growth of the tree when it appears. */
  intro?: boolean;
  /** Focus the scene on mount so keyboard shortcuts work right away. */
  autoFocus?: boolean;
  /** Shift the tree sideways by this fraction of the width (e.g. 0.2 to leave room on the left). */
  viewOffset?: number;
  /**
   * When false, the tree is a showcase: it grows and slowly turns, but has no controls, panels
   * or pointer handling, so the page around it scrolls normally (mouse wheel and touch).
   */
  interactive?: boolean;
  /** Shows a close button (and closes on Escape), for a viewer opened on top of a page. */
  onClose?: () => void;
  /** Shows a back link in the header (e.g. to the repository picker). */
  onBack?: () => void;
  /** Text of the back link. */
  backLabel?: string;
  /** Extra overlay content, rendered above the scene. */
  children?: ReactNode;
}

/** Pauses rendering while the scene is scrolled out of view. */
function useInView(element: RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const target = element.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [element]);
  return inView;
}

const INTERACTIVE = 'button, a, input, textarea, select, [role="slider"]';

/** An interactive 3D tree of a repository's history. */
export function Galaxy({
  data,
  className,
  header = true,
  intro = true,
  autoFocus = false,
  viewOffset = 0,
  interactive = true,
  onClose,
  onBack,
  backLabel = 'Back',
  children,
}: GalaxyProps) {
  const layout = useMemo(() => computeLayout(data), [data]);
  const container = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const visible = useInView(container);
  const previous = useRef<RepoData | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = data;
    if (before && before.name === data.name && data.commits.length > before.commits.length) {
      // Live update: only replay the growth of the new commits.
      const from = layout.rank[before.commits.length] ?? 1;
      useGalaxy.setState({ progress: Math.max(0, from - 0.03), playing: true, hovered: -1, selected: -1 });
      return;
    }
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    useGalaxy.getState().reset({ intro: intro && !reducedMotion });
  }, [data, layout, intro]);

  useEffect(
    () =>
      useGalaxy.subscribe((state, before) => {
        if (state.hovered !== before.hovered && container.current) {
          container.current.style.cursor = state.hovered >= 0 ? 'pointer' : '';
        }
      }),
    [],
  );

  useEffect(() => {
    if (autoFocus) container.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const galaxy = useGalaxy.getState();
    if (event.key === 'Escape') {
      if (galaxy.selected >= 0) galaxy.select(-1);
      else if (galaxy.focusAuthor >= 0) galaxy.setFocusAuthor(-1);
      else onClose?.();
      return;
    }
    if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return;
    switch (event.key) {
      case ' ':
        galaxy.togglePlay();
        break;
      case 'r':
      case 'R':
        galaxy.resetCamera();
        break;
      case 'a':
      case 'A':
        galaxy.setAutoRotate(!galaxy.autoRotate);
        break;
      case 'w':
      case 'W':
        galaxy.setWind(!galaxy.wind);
        break;
      case 'm':
      case 'M':
        galaxy.setLianas(!galaxy.lianas);
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (galaxy.selected < 0) return;
        const next = galaxy.selected + (event.key === 'ArrowLeft' ? -1 : 1);
        if (next >= 0 && next < data.commits.length) galaxy.select(next, true);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  };

  const context = useMemo<GalaxyContextValue>(() => ({ data, layout, pointer, container }), [data, layout]);

  return (
    <GalaxyContext.Provider value={context}>
      {interactive ? (
        <div
          ref={container}
          className={`cg-root${className ? ` ${className}` : ''}`}
          tabIndex={0}
          role="application"
          aria-label={`3D tree of the ${data.name} repository`}
          onKeyDown={onKeyDown}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            pointer.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
          }}
        >
          <Scene layout={layout} visible={visible} viewOffset={viewOffset} />
          <div className="cg-overlay">
            {header && <Header onBack={onBack} backLabel={backLabel} />}
            <Toolbar onClose={onClose} />
            <Legend />
            <Timeline />
            <CommitPanel />
            <Tooltip />
            {children}
          </div>
        </div>
      ) : (
        <div
          ref={container}
          className={`cg-root is-showcase${className ? ` ${className}` : ''}`}
          role="img"
          aria-label={`Animated 3D tree of the ${data.name} repository`}
        >
          <Scene layout={layout} visible={visible} viewOffset={viewOffset} interactive={false} />
          {children && <div className="cg-overlay">{children}</div>}
        </div>
      )}
    </GalaxyContext.Provider>
  );
}
