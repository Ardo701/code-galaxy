import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Matrix4, type PerspectiveCamera } from 'three';
import type { GalaxyLayout } from '../layout/tree';
import { useGalaxy } from '../store';

/** Minimum pick radius around a leaf, in CSS pixels (bigger for fingers). */
const MOUSE_RADIUS = 14;
const TOUCH_RADIUS = 26;
/** Moving the pointer more than this between press and release is a drag, not a click. */
const CLICK_TOLERANCE = 6;

/**
 * "Magnetic" picking: the commit whose leaf is closest to the pointer on screen wins,
 * instead of requiring the pointer to be exactly on a few-pixel-wide leaf.
 * Projecting every leaf center is cheap (a few ms for 50k commits) and much
 * faster than ray-casting thousands of instanced triangles.
 */
export function Picker({ layout }: { layout: GalaxyLayout }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const pointer = useRef<{ x: number; y: number; radius: number } | null>(null);
  const viewProjection = useRef(new Matrix4());

  const pick = (clientX: number, clientY: number, minRadius: number): number => {
    const rect = gl.domElement.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    camera.updateMatrixWorld();
    const e = viewProjection.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
    const focal = rect.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const { centers, rank, leafSize, bounds } = layout;
    const progress = useGalaxy.getState().progress + 1e-4;
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < rank.length; i++) {
      if (rank[i] > progress) continue;
      const x = centers[i * 3];
      const y = centers[i * 3 + 1];
      const z = centers[i * 3 + 2];
      const w = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (w <= 0) continue;
      const sx = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / w + 1) * 0.5 * rect.width;
      const sy = (1 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / w) * 0.5 * rect.height;
      const dx = sx - px;
      const dy = sy - py;
      const radius = Math.max(minRadius, ((leafSize[i] * focal) / w) * 0.6);
      const distance2 = dx * dx + dy * dy;
      if (distance2 > radius * radius) continue;
      // Closest to the pointer first, then closest to the camera.
      const score = Math.sqrt(distance2) / radius + (w / bounds.radius) * 0.25;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  };

  useEffect(() => {
    const element = gl.domElement;
    let down: { x: number; y: number } | null = null;
    const radiusFor = (event: PointerEvent) => (event.pointerType === 'touch' ? TOUCH_RADIUS : MOUSE_RADIUS);

    const onMove = (event: PointerEvent) => {
      pointer.current =
        event.pointerType === 'touch' ? null : { x: event.clientX, y: event.clientY, radius: radiusFor(event) };
    };
    const onLeave = () => {
      pointer.current = null;
      useGalaxy.getState().setHovered(-1);
    };
    const onDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY };
    };
    const onUp = (event: PointerEvent) => {
      if (!down || event.button !== 0) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      down = null;
      if (moved > CLICK_TOLERANCE) return;
      const commit = pick(event.clientX, event.clientY, radiusFor(event));
      useGalaxy.getState().select(commit, commit >= 0);
    };

    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerleave', onLeave);
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointerup', onUp);
    return () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerleave', onLeave);
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointerup', onUp);
    };
  }, [gl, camera, layout]);

  // Re-pick every frame: the tree moves under a still pointer (rotation, growth, camera flights).
  useFrame(() => {
    const current = pointer.current;
    if (!current) return;
    useGalaxy.getState().setHovered(pick(current.x, current.y, current.radius));
  });

  return null;
}
