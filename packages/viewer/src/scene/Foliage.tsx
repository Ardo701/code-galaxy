import { useLayoutEffect, useRef } from 'react';
import {
  DoubleSide,
  FrontSide,
  InstancedBufferAttribute,
  ShaderMaterial,
  type BufferGeometry,
  type InstancedMesh,
} from 'three';
import type { InstanceBuffers } from '../layout/tree';
import { foliageFragment, foliageVertex } from './shaders';
import { useDisposable, type SharedUniforms } from './Tree';

interface FoliageProps {
  buffers: InstanceBuffers;
  baseGeometry: BufferGeometry;
  uniforms: SharedUniforms;
  /** Merge commits are drawn as glowing buds instead of leaves. */
  bud?: boolean;
}

/** Every commit of one kind (leaves or buds) in a single instanced draw call. */
export function Foliage({ buffers, baseGeometry, uniforms, bud = false }: FoliageProps) {
  const mesh = useRef<InstancedMesh>(null);

  const geometry = useDisposable(() => {
    const g = baseGeometry.clone();
    g.setAttribute('aColor', new InstancedBufferAttribute(buffers.color, 3));
    g.setAttribute('aBirth', new InstancedBufferAttribute(buffers.birth, 1));
    g.setAttribute('aCommit', new InstancedBufferAttribute(buffers.commit, 1));
    g.setAttribute('aAuthor', new InstancedBufferAttribute(buffers.author, 1));
    g.setAttribute('aSeed', new InstancedBufferAttribute(buffers.seed, 1));
    return g;
  }, [buffers, baseGeometry]);

  const material = useDisposable(
    () =>
      new ShaderMaterial({
        uniforms: { ...uniforms, uGlow: { value: bud ? 1.6 : 1.2 } },
        vertexShader: foliageVertex,
        fragmentShader: foliageFragment,
        side: bud ? FrontSide : DoubleSide,
        defines: bud ? { BUD: '' } : {},
      }),
    [uniforms, bud],
  );

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    instanced.instanceMatrix.array.set(buffers.matrix);
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
  }, [buffers, geometry, material]);

  if (buffers.count === 0) return null;

  return <instancedMesh ref={mesh} args={[geometry, material, buffers.count]} frustumCulled={false} />;
}
