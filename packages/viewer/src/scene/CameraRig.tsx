import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { GalaxyLayout } from '../layout/tree';
import { useGalaxy } from '../store';

interface Goal {
  position: Vector3;
  target: Vector3;
  /** Higher is snappier. */
  speed: number;
}

/** Seconds without interaction before the auto-rotation resumes. */
const IDLE_RESUME = 5;
/** Smallest area framed, in world units: a sapling stays small in the scene instead of filling it. */
const MIN_VIEW_HEIGHT = 20;
const MIN_VIEW_WIDTH = 16;
/** Below this width, page content sits above the scene instead of beside it (no view offset). */
export const VIEW_OFFSET_MIN_WIDTH = 900;
/** Turntable speed of the showcase mode, in radians per second (same pace as the orbit auto-rotate). */
const SHOWCASE_SPIN = ((2 * Math.PI) / 60) * 0.35;
const UP = new Vector3(0, 1, 0);

interface CameraRigProps {
  layout: GalaxyLayout;
  viewOffset: number;
  /** Without interaction the camera is not user-controlled: it glides in, then slowly turns around the tree. */
  interactive: boolean;
}

/** Orbit controls plus smooth camera flights (intro, reset, focus on a commit). */
export function CameraRig({ layout, viewOffset, interactive }: CameraRigProps) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const clock = useThree((state) => state.clock);
  const controls = useRef<OrbitControlsImpl>(null);
  /** Point the camera looks at when there are no orbit controls to hold it. */
  const fixedTarget = useRef(new Vector3());
  const goal = useRef<Goal | null>(null);
  const lastInteraction = useRef(-Infinity);
  const interacting = useRef(false);
  const autoRotate = useGalaxy((state) => state.autoRotate);
  const request = useGalaxy((state) => state.cameraRequest);
  const target = () => controls.current?.target ?? fixedTarget.current;
  const reducedMotion = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);

  const overview = (): Goal => {
    const [cx, cy, cz] = layout.bounds.center;
    const target = new Vector3(cx, cy, cz);
    // Fit the bounding box: its height in the vertical field of view, its widest side in the
    // horizontal one (narrowed when the scene is shifted aside for page content).
    const [boxWidth, boxHeight, boxDepth] = layout.bounds.size;
    const width = Math.max(boxWidth, MIN_VIEW_WIDTH);
    const depth = Math.max(boxDepth, MIN_VIEW_WIDTH);
    const height = Math.max(boxHeight, MIN_VIEW_HEIGHT);
    const shift = size.width > VIEW_OFFSET_MIN_WIDTH ? viewOffset : 0;
    const aspect = (size.width * (1 - 2 * shift)) / Math.max(size.height, 1);
    const vertical = (camera.fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
    const fitHeight = height / 2 / Math.tan(vertical / 2);
    const fitWidth = Math.max(width, depth) / 2 / Math.tan(horizontal / 2);
    const distance = (Math.max(fitHeight, fitWidth) + Math.max(width, depth) / 2) * 1.2;
    const azimuth = 0.55;
    const elevation = 0.1;
    const position = new Vector3(
      Math.sin(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(azimuth) * Math.cos(elevation),
    )
      .multiplyScalar(distance)
      .add(target);
    return { position, target, speed: 1.4 };
  };

  // Intro: start far and low, then glide in while the tree grows.
  useLayoutEffect(() => {
    const view = overview();
    const offset = view.position.clone().sub(view.target);
    camera.position
      .copy(view.target)
      .addScaledVector(offset, 1.9)
      .add(new Vector3(0, -layout.height * 0.25, 0));
    target().copy(view.target);
    goal.current = { ...view, speed: 0.75 };
  }, [layout]);

  useEffect(() => {
    if (!request) return;
    if (request.kind === 'reset') {
      goal.current = overview();
      return;
    }
    const leaf = new Vector3().fromArray(layout.centers, request.commit * 3);
    const direction = camera.position.clone().sub(target()).normalize();
    const distance = Math.max(layout.height * 0.5, layout.leafSize[request.commit] * 24);
    goal.current = { target: leaf, position: leaf.clone().addScaledVector(direction, distance), speed: 2.2 };
  }, [request]);

  useFrame((state, delta) => {
    const look = target();
    const flight = goal.current;
    if (!interactive) {
      // Turntable: spin the camera (and its destination) around the tree.
      const angle = reducedMotion ? 0 : delta * SHOWCASE_SPIN;
      camera.position.sub(look).applyAxisAngle(UP, angle).add(look);
      flight?.position.sub(flight.target).applyAxisAngle(UP, angle).add(flight.target);
    }
    if (flight) {
      const k = 1 - Math.exp(-delta * flight.speed);
      camera.position.lerp(flight.position, k);
      look.lerp(flight.target, k);
      if (camera.position.distanceToSquared(flight.position) < 1e-3 && look.distanceToSquared(flight.target) < 1e-3) {
        goal.current = null;
      }
    }
    if (controls.current) {
      const idle = !interacting.current && state.clock.elapsedTime - lastInteraction.current > IDLE_RESUME;
      controls.current.autoRotate = autoRotate && idle;
    } else {
      camera.lookAt(look);
    }
  });

  if (!interactive) return null;
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.07}
      autoRotateSpeed={0.35}
      rotateSpeed={0.6}
      zoomSpeed={0.8}
      minDistance={2}
      maxDistance={layout.bounds.radius * 6}
      maxPolarAngle={Math.PI * 0.62}
      onStart={() => {
        goal.current = null;
        interacting.current = true;
      }}
      onEnd={() => {
        interacting.current = false;
        lastInteraction.current = clock.elapsedTime;
      }}
    />
  );
}
