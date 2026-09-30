import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ShaderMaterial,
  type IUniform,
  type LineSegments,
} from 'three';
import type { GalaxyLayout } from '../layout/tree';
import { useGalaxy } from '../store';
import { lianaFragment, lianaVertex, woodFragment, woodVertex } from './shaders';

export interface SharedUniforms {
  uTime: IUniform<number>;
  uProgress: IUniform<number>;
  uWind: IUniform<number>;
  uHeight: IUniform<number>;
  uHover: IUniform<number>;
  uSelected: IUniform<number>;
  uFocusAuthor: IUniform<number>;
  [name: string]: IUniform;
}

export function createSharedUniforms(height: number): SharedUniforms {
  return {
    uTime: { value: 0 },
    uProgress: { value: 1 },
    uWind: { value: 1 },
    uHeight: { value: height },
    uHover: { value: -1 },
    uSelected: { value: -1 },
    uFocusAuthor: { value: -1 },
  };
}

export function useDisposable<T extends { dispose: () => void }>(factory: () => T, deps: unknown[]): T {
  const value = useMemo(factory, deps);
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

export function Wood({ layout, uniforms }: { layout: GalaxyLayout; uniforms: SharedUniforms }) {
  const geometry = useDisposable(() => {
    const { wood } = layout;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(wood.position, 3));
    g.setAttribute('normal', new BufferAttribute(wood.normal, 3));
    g.setAttribute('uv', new BufferAttribute(wood.uv, 2));
    g.setAttribute('aCenter', new BufferAttribute(wood.center, 3));
    g.setAttribute('aBirth', new BufferAttribute(wood.birth, 1));
    g.setAttribute('aKind', new BufferAttribute(wood.kind, 1));
    g.setIndex(new BufferAttribute(wood.index, 1));
    g.computeBoundingSphere();
    return g;
  }, [layout]);

  const material = useDisposable(
    () =>
      new ShaderMaterial({
        uniforms: {
          ...uniforms,
          uBarkLow: { value: new Color(0.045, 0.03, 0.11) },
          uBarkHigh: { value: new Color(0.15, 0.1, 0.32) },
          uRim: { value: new Color(0.3, 0.26, 0.9) },
          uSap: { value: new Color(0.3, 0.85, 1.0) },
        },
        vertexShader: woodVertex,
        fragmentShader: woodFragment,
      }),
    [uniforms],
  );

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}

const LIANA_OPACITY = 0.32;

export function Lianas({
  layout,
  uniforms,
  alwaysVisible = false,
}: {
  layout: GalaxyLayout;
  uniforms: SharedUniforms;
  /** Ignore the viewer's show/hide setting (the showcase has no controls). */
  alwaysVisible?: boolean;
}) {
  const lines = useRef<LineSegments>(null);
  const geometry = useDisposable(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(layout.lianas.position, 3));
    g.setAttribute('aAlong', new BufferAttribute(layout.lianas.along, 1));
    g.setAttribute('aBirth', new BufferAttribute(layout.lianas.birth, 1));
    return g;
  }, [layout]);

  const material = useDisposable(
    () =>
      new ShaderMaterial({
        uniforms: {
          ...uniforms,
          uColorA: { value: new Color(0.35, 0.9, 1.0) },
          uColorB: { value: new Color(0.65, 0.45, 1.0) },
          uOpacity: { value: LIANA_OPACITY },
        },
        vertexShader: lianaVertex,
        fragmentShader: lianaFragment,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [uniforms],
  );

  // Fade in and out when the arcs are toggled.
  useFrame((_, delta) => {
    const shown = alwaysVisible || useGalaxy.getState().lianas;
    const opacity = material.uniforms.uOpacity;
    opacity.value += ((shown ? LIANA_OPACITY : 0) - opacity.value) * Math.min(1, delta * 6);
    if (lines.current) lines.current.visible = opacity.value > 0.002;
  });

  if (layout.lianas.position.length === 0) return null;
  return <lineSegments ref={lines} geometry={geometry} material={material} frustumCulled={false} />;
}
