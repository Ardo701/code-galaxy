import { Billboard, Sparkles, Stars } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import {
  AdditiveBlending,
  BackSide,
  Color,
  ShaderMaterial,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from 'three';
import type { GalaxyLayout } from '../layout/tree';
import { useGalaxy } from '../store';
import { backdropFragment, backdropVertex, groundFragment, groundVertex, windOffset } from './shaders';
import { useDisposable, type SharedUniforms } from './Tree';

/** Deep space: a nebula dome, twinkling stars and drifting motes around the crown. */
export function Sky({ layout, uniforms }: { layout: GalaxyLayout; uniforms: SharedUniforms }) {
  const material = useDisposable(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: uniforms.uTime },
        vertexShader: backdropVertex,
        fragmentShader: backdropFragment,
        side: BackSide,
        depthWrite: false,
      }),
    [uniforms],
  );
  return (
    <>
      <mesh material={material} renderOrder={-1}>
        <sphereGeometry args={[3000, 48, 24]} />
      </mesh>
      <Stars radius={500} depth={300} count={7000} factor={7} saturation={0.35} fade speed={0.6} />
      <Sparkles
        count={140}
        scale={[layout.crown * 2.6, layout.height * 1.1, layout.crown * 2.6]}
        position={[0, layout.height * 0.6, 0]}
        size={3.2}
        speed={0.22}
        opacity={0.55}
        noise={1.2}
        color="#b3a6ff"
      />
    </>
  );
}

/** A holographic disc under the tree. */
export function Ground({ layout, uniforms }: { layout: GalaxyLayout; uniforms: SharedUniforms }) {
  const radius = layout.crown * 2.8;
  const material = useDisposable(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: uniforms.uTime,
          uRadius: { value: radius },
          uGlow: { value: new Color(0.32, 0.22, 0.95) },
          uLines: { value: new Color(0.35, 0.75, 1.0) },
        },
        vertexShader: groundVertex,
        fragmentShader: groundFragment,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [uniforms, radius],
  );
  return (
    <mesh material={material} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <circleGeometry args={[radius, 128]} />
    </mesh>
  );
}

/** Pulsing rings around the selected commit. */
export function SelectionMarker({ layout, uniforms }: { layout: GalaxyLayout; uniforms: SharedUniforms }) {
  const selected = useGalaxy((state) => state.selected);
  const group = useRef<Group>(null);
  const wave = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const marker = group.current;
    if (!marker || selected < 0) return;
    const x = layout.centers[selected * 3];
    const y = layout.centers[selected * 3 + 1];
    const z = layout.centers[selected * 3 + 2];
    const [dx, , dz] = windOffset(x, y, z, uniforms.uTime.value, uniforms.uWind.value, layout.height);
    marker.position.set(x + dx, y, z + dz);
    const t = clock.elapsedTime;
    marker.scale.setScalar(layout.leafSize[selected] * (1.05 + 0.08 * Math.sin(t * 3)));
    if (wave.current) {
      const phase = (t * 0.7) % 1;
      wave.current.scale.setScalar(1 + phase * 1.6);
      (wave.current.material as MeshBasicMaterial).opacity = (1 - phase) * 0.7;
    }
  });

  if (selected < 0) return null;
  return (
    <group ref={group}>
      <Billboard>
        <mesh>
          <ringGeometry args={[0.86, 1, 64]} />
          <meshBasicMaterial color={[2.2, 2.2, 2.6]} transparent depthWrite={false} blending={AdditiveBlending} />
        </mesh>
        <mesh ref={wave}>
          <ringGeometry args={[0.95, 1, 64]} />
          <meshBasicMaterial color={[1.2, 1.6, 2.4]} transparent depthWrite={false} blending={AdditiveBlending} />
        </mesh>
      </Billboard>
    </group>
  );
}
