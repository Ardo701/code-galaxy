import { create } from 'zustand';

/** A request for the camera, consumed by the camera rig. `id` changes on every request. */
export type CameraRequest = { id: number; kind: 'reset' } | { id: number; kind: 'focus'; commit: number };

export interface GalaxyState {
  /** Growth of the tree in [0, 1] (1 = today). */
  progress: number;
  playing: boolean;
  /** Commit under the pointer, -1 when none. */
  hovered: number;
  /** Commit shown in the details panel, -1 when none. */
  selected: number;
  /** Author whose leaves are highlighted, -1 for everyone. */
  focusAuthor: number;
  autoRotate: boolean;
  wind: boolean;
  /** Show the arcs linking merged branches to their merge commit. */
  lianas: boolean;
  cameraRequest: CameraRequest | null;

  setProgress: (progress: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setHovered: (commit: number) => void;
  select: (commit: number, focusCamera?: boolean) => void;
  setFocusAuthor: (author: number) => void;
  setAutoRotate: (autoRotate: boolean) => void;
  setWind: (wind: boolean) => void;
  setLianas: (lianas: boolean) => void;
  resetCamera: () => void;
  /** Called when a new repository is shown. */
  reset: (options: { intro: boolean }) => void;
}

let requestId = 0;

export const useGalaxy = create<GalaxyState>()((set, get) => ({
  progress: 1,
  playing: false,
  hovered: -1,
  selected: -1,
  focusAuthor: -1,
  autoRotate: true,
  wind: true,
  lianas: true,
  cameraRequest: null,

  setProgress: (progress) => set({ progress: Math.min(1, Math.max(0, progress)) }),
  play: () => set((state) => ({ playing: true, progress: state.progress >= 1 ? 0 : state.progress })),
  pause: () => set({ playing: false }),
  togglePlay: () => (get().playing ? get().pause() : get().play()),
  setHovered: (hovered) => {
    if (get().hovered !== hovered) set({ hovered });
  },
  select: (selected, focusCamera = false) =>
    set({
      selected,
      cameraRequest:
        focusCamera && selected >= 0 ? { id: ++requestId, kind: 'focus', commit: selected } : get().cameraRequest,
    }),
  setFocusAuthor: (focusAuthor) => set({ focusAuthor }),
  setAutoRotate: (autoRotate) => set({ autoRotate }),
  setWind: (wind) => set({ wind }),
  setLianas: (lianas) => set({ lianas }),
  resetCamera: () => set({ cameraRequest: { id: ++requestId, kind: 'reset' } }),
  reset: ({ intro }) =>
    set({
      progress: intro ? 0 : 1,
      playing: intro,
      hovered: -1,
      selected: -1,
      focusAuthor: -1,
      cameraRequest: { id: ++requestId, kind: 'reset' },
    }),
}));

if (import.meta.env.DEV) {
  // Handy while developing: inspect or drive the viewer from the browser console.
  (globalThis as { __galaxy?: typeof useGalaxy }).__galaxy = useGalaxy;
}
