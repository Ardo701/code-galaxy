import { PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useMemo, useState } from 'react';
import type { PerspectiveCamera } from 'three';
import type { GalaxyLayout } from '../layout/tree';
import { useGalaxy } from '../store';
import { CameraRig, VIEW_OFFSET_MIN_WIDTH } from './CameraRig';
import { Ground, SelectionMarker, Sky } from './Environment';
import { Foliage } from './Foliage';
import { Picker } from './Picker';
import { createBudGeometry, createLeafGeometry } from './geometries';
import { Lianas, Wood, createSharedUniforms, type SharedUniforms } from './Tree';

/** Advances the growth replay and feeds the store into the shaders, without React re-renders. */
function Driver({ uniforms, duration }: { uniforms: SharedUniforms; duration: number }) {
  useFrame((state, delta) => {
    const galaxy = useGalaxy.getState();
    if (galaxy.playing) {
      const next = galaxy.progress + delta / duration;
      if (next >= 1) {
        galaxy.setProgress(1);
        galaxy.pause();
      } else {
        galaxy.setProgress(next);
      }
    }
    const { progress, hovered, selected, focusAuthor, wind } = useGalaxy.getState();
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uProgress.value = progress;
    uniforms.uHover.value = hovered;
    uniforms.uSelected.value = selected;
    uniforms.uFocusAuthor.value = focusAuthor;
    uniforms.uWind.value += ((wind ? 1 : 0) - uniforms.uWind.value) * Math.min(1, delta * 1.5);
  });
  return null;
}

/** Shifts the rendered scene sideways (a fraction of the width) to leave room for page content. */
function ViewOffset({ offset }: { offset: number }) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  useEffect(() => {
    // On narrow screens the page content is above the scene, not beside it.
    const shift = size.width > VIEW_OFFSET_MIN_WIDTH ? offset : 0;
    if (shift === 0) camera.clearViewOffset();
    else camera.setViewOffset(size.width, size.height, -size.width * shift, 0, size.width, size.height);
    return () => camera.clearViewOffset();
  }, [camera, size, offset]);
  return null;
}

function Effects() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur luminanceThreshold={0.72} luminanceSmoothing={0.3} intensity={1.1} radius={0.8} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.2} darkness={0.7} />
      <Noise opacity={0.025} />
    </EffectComposer>
  );
}

export function Scene({
  layout,
  visible,
  viewOffset = 0,
  interactive = true,
}: {
  layout: GalaxyLayout;
  visible: boolean;
  viewOffset?: number;
  interactive?: boolean;
}) {
  const uniforms = useMemo(() => createSharedUniforms(layout.height), [layout]);
  const leafGeometry = useMemo(createLeafGeometry, []);
  const budGeometry = useMemo(createBudGeometry, []);
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, 2));
  const commitCount = layout.rank.length;
  const duration = Math.min(20, Math.max(8, 7 + 2 * Math.log2(1 + commitCount / 100)));

  return (
    <Canvas
      className="cg-canvas"
      // A showcase lets the pointer through, so the page scrolls over it.
      style={interactive ? undefined : { pointerEvents: 'none' }}
      flat
      dpr={dpr}
      frameloop={visible ? 'always' : 'never'}
      gl={{
        antialias: false,
        alpha: false,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      }}
      camera={{ fov: 40, near: 0.1, far: 8000, position: [0, 30, 140] }}
      onCreated={(state) => {
        if (import.meta.env.DEV) (globalThis as { __three?: unknown }).__three = state;
      }}
    >
      <color attach="background" args={['#030308']} />
      <PerformanceMonitor onDecline={() => setDpr(1)} />
      <Sky layout={layout} uniforms={uniforms} />
      <Ground layout={layout} uniforms={uniforms} />
      <Wood layout={layout} uniforms={uniforms} />
      <Lianas layout={layout} uniforms={uniforms} alwaysVisible={!interactive} />
      <Foliage buffers={layout.leaves} baseGeometry={leafGeometry} uniforms={uniforms} />
      <Foliage buffers={layout.buds} baseGeometry={budGeometry} uniforms={uniforms} bud />
      {interactive && <Picker layout={layout} />}
      <SelectionMarker layout={layout} uniforms={uniforms} />
      <CameraRig layout={layout} viewOffset={viewOffset} interactive={interactive} />
      {viewOffset !== 0 && <ViewOffset offset={viewOffset} />}
      <Driver uniforms={uniforms} duration={duration} />
      <Effects />
    </Canvas>
  );
}
