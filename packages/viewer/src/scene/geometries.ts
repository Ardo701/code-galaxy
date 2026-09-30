import { BufferGeometry, Float32BufferAttribute, IcosahedronGeometry } from 'three';

/**
 * A lanceolate leaf, 1 unit long along +Y with its base at the origin.
 * uv.x runs across the blade (-1 edge, 0 midrib, 1 edge), uv.y from base to tip.
 */
export function createLeafGeometry(): BufferGeometry {
  const rows = 10;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const width = Math.sin(Math.PI * Math.pow(v, 0.72)) * 0.38;
    // Curl toward the tip and fold along the midrib, so the blade catches the light.
    const curl = Math.sin(v * Math.PI) * 0.05 + v * v * 0.1;
    for (const side of [-1, 0, 1]) {
      positions.push(side * width, v, curl - Math.abs(side) * width * 0.32);
      uvs.push(side, v);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 2; c++) {
      const a = r * 3 + c;
      indices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A small glowing sphere for merge commits. */
export function createBudGeometry(): BufferGeometry {
  return new IcosahedronGeometry(0.5, 2);
}
