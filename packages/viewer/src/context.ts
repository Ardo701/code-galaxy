import { createContext, useContext, type RefObject } from 'react';
import type { GalaxyLayout } from './layout/tree';
import type { RepoData } from './types';

export interface GalaxyContextValue {
  data: RepoData;
  layout: GalaxyLayout;
  /** Pointer position relative to the Galaxy container, updated without re-rendering. */
  pointer: RefObject<{ x: number; y: number }>;
  container: RefObject<HTMLDivElement | null>;
}

export const GalaxyContext = createContext<GalaxyContextValue | null>(null);

export function useGalaxyContext(): GalaxyContextValue {
  const value = useContext(GalaxyContext);
  if (!value) throw new Error('This component must be rendered inside <Galaxy>.');
  return value;
}
