import { CatmullRomCurve3, Color, Matrix4, Vector3 } from 'three';
import type { RepoData } from '../types';
import { assignBranches, type BranchInfo } from './branches';
import { authorColor } from './colors';
import { hashString, mulberry32 } from './random';

/** Kind of wood, stored per vertex so the shader can shade each part differently. */
export const WoodKind = { trunk: 0, branch: 1, twig: 2, root: 3 } as const;

/** Per-instance data for an instanced mesh (leaves or merge buds). */
export interface InstanceBuffers {
  count: number;
  /** Commit index drawn by each instance. */
  commit: Float32Array;
  /** 4x4 matrices, 16 floats per instance. */
  matrix: Float32Array;
  /** Linear RGB, 3 floats per instance. */
  color: Float32Array;
  birth: Float32Array;
  author: Float32Array;
  seed: Float32Array;
}

/** All the wood (trunk, branches, twigs, roots) merged into one indexed tube geometry. */
export interface WoodBuffers {
  position: Float32Array;
  normal: Float32Array;
  /** x = distance from the roots along the wood, y = angle around the tube in [0, 1]. */
  uv: Float32Array;
  /** Point on the tube axis: unborn vertices collapse onto it while the tree grows. */
  center: Float32Array;
  birth: Float32Array;
  kind: Float32Array;
  index: Uint32Array;
}

/** Glowing arcs linking merged work to its merge commit (line segment pairs). */
export interface LianaBuffers {
  position: Float32Array;
  /** Position along the arc in [0, 1]. */
  along: Float32Array;
  birth: Float32Array;
}

export interface GalaxyLayout {
  branches: BranchInfo[];
  branchOf: Int32Array;
  /** Growth time of each commit in [0, 1]: its position in the history. */
  rank: Float32Array;
  /** World position where each commit's leaf is attached (xyz). */
  anchors: Float32Array;
  /** World position of the middle of each commit's leaf or bud (xyz). */
  centers: Float32Array;
  leafSize: Float32Array;
  leaves: InstanceBuffers;
  buds: InstanceBuffers;
  wood: WoodBuffers;
  lianas: LianaBuffers;
  authorColors: string[];
  height: number;
  crown: number;
  bounds: {
    center: [number, number, number];
    /** Size of the bounding box. */
    size: [number, number, number];
    /** Radius of the bounding sphere. */
    radius: number;
  };
  /**
   * Dates for the timeline, robust to broken clocks: `times[i]` is commit i's date smoothed
   * with its neighbors, and `first`/`last` the span of the history (seconds).
   */
  timeline: { times: Float64Array; first: number; last: number };
  /** Where each new year starts on the timeline. */
  yearMarks: { rank: number; year: number }[];
  /** Normalized amount of change along the timeline, for the activity sparkline. */
  activity: Float32Array;
}

interface Holder {
  curve: CatmullRomCurve3;
  length: number;
  radius: (u: number) => number;
  birth: (u: number) => number;
  /** Distance from the roots at u = 0 (drives the light flowing through the wood). */
  path: number;
  isTrunk: boolean;
  /** Trunk or a co-dominant stem: its sprouts follow the crown silhouette. */
  isLeader: boolean;
}

interface TubeSpec {
  holder: Holder;
  kind: number;
  rings: number;
  sides: number;
}

const UP = new Vector3(0, 1, 0);
const X_AXIS = new Vector3(1, 0, 0);
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Fraction of the trunk left bare above the roots. */
const TRUNK_BASE = 0.2;
/** Branches with more commits than this carry their leaves on twigs. */
const DIRECT_LEAVES_MAX = 5;
/** A branch carrying this share of all commits grows up as a second stem instead of sideways. */
const LEADER_SHARE = 0.22;
const ACTIVITY_BUCKETS = 160;
/** Commits on each side used to smooth dates (a single broken clock is ignored). */
const DATE_WINDOW = 4;
const MAX_LIANAS = 20_000;
const LIANA_STEPS = 14;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Crown silhouette: how far sprouts reach depending on their height on the trunk (a wide dome). */
function crownProfile(height: number) {
  const s = Math.sin(Math.PI * clamp(0.1 + 0.85 * height, 0, 1));
  return 0.2 + 0.8 * Math.pow(s, 0.55);
}

/** Linear interpolation through sorted knots. */
function piecewise(xs: number[], ys: number[]): (x: number) => number {
  const last = xs.length - 1;
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[last]) return ys[last];
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    const span = xs[hi] - xs[lo];
    return span > 0 ? ys[lo] + ((ys[hi] - ys[lo]) * (x - xs[lo])) / span : ys[hi];
  };
}

/** Two unit vectors perpendicular to `tangent` (and to each other). */
function perpendicularBasis(tangent: Vector3, n: Vector3, b: Vector3) {
  const reference = Math.abs(tangent.y) < 0.9 ? UP : X_AXIS;
  n.crossVectors(tangent, reference).normalize();
  b.crossVectors(tangent, n).normalize();
}

/** Grows a polyline from `start`, bending toward the light (up) like a real branch. */
function growPoints(
  start: Vector3,
  direction: Vector3,
  length: number,
  tropism: number,
  wobble: number,
  random: () => number,
  steps: number,
): Vector3[] {
  const points = [start.clone()];
  const dir = direction.clone().normalize();
  const cursor = start.clone();
  const step = length / steps;
  for (let i = 1; i <= steps; i++) {
    dir.x += (random() - 0.5) * wobble;
    dir.z += (random() - 0.5) * wobble;
    dir.y += (random() - 0.5) * wobble * 0.5 + tropism / steps;
    dir.normalize();
    cursor.addScaledVector(dir, step);
    points.push(cursor.clone());
  }
  return points;
}

function makeCurve(points: Vector3[], divisions: number): CatmullRomCurve3 {
  const curve = new CatmullRomCurve3(points, false, 'centripetal');
  curve.arcLengthDivisions = divisions;
  return curve;
}

/** Radius along a holder from the mass (commits) it still has to carry above each point. */
function radiusFromMasses(
  events: { u: number; mass: number }[],
  radiusOfMass: (mass: number) => number,
  cap: number,
): (u: number) => number {
  events.sort((a, b) => a.u - b.u);
  const xs = [0];
  const total = events.reduce((sum, e) => sum + e.mass, 0);
  const ys = [Math.min(cap, radiusOfMass(total))];
  let remaining = total;
  for (const event of events) {
    xs.push(event.u);
    ys.push(Math.min(cap, radiusOfMass(remaining)));
    remaining -= event.mass;
  }
  xs.push(1);
  ys.push(Math.min(cap, radiusOfMass(Math.max(remaining, 0.5)) * 0.6));
  return piecewise(xs, ys);
}

function emptyInstances(count: number): InstanceBuffers {
  return {
    count,
    commit: new Float32Array(count),
    matrix: new Float32Array(count * 16),
    color: new Float32Array(count * 3),
    birth: new Float32Array(count),
    author: new Float32Array(count),
    seed: new Float32Array(count),
  };
}

/**
 * Turns a repository history into a tree: positions of the wood, of every
 * leaf, and everything the shaders need to replay its growth.
 *
 * Pure function (no WebGL), so it can later move to a Web Worker.
 */
export function computeLayout(data: RepoData): GalaxyLayout {
  const { commits } = data;
  const n = commits.length;
  const { branches, branchOf } = assignBranches(data);

  const rank = new Float32Array(n);
  for (let i = 0; i < n; i++) rank[i] = n > 1 ? i / (n - 1) : 1;

  // --- Scale ---------------------------------------------------------------
  // Small histories grow a sapling, big ones a tall tree.
  const height = n < 150 ? 34 * Math.pow(Math.max(n, 1) / 150, 0.4) : 34 + 12 * Math.log10(n / 150);
  // Fewer leaves need a tighter crown and bigger leaves to still look lush.
  const crown = height * 0.62 * clamp(Math.pow(n / 800, 0.22), 0.55, 1);
  const leafBase = height * 0.027 * clamp(Math.pow(600 / Math.max(n, 1), n < 600 ? 0.28 : 0.14), 0.55, 4.5);
  /** Wood never grows much longer than the leaves it carries need. */
  const reachFor = (leafCount: number) => leafCount * leafBase * 0.8 + leafBase * 1.5;
  /** Height on the crown in [0, 1] of a world-space y. */
  const crownHeight = (y: number) => clamp((y / height - TRUNK_BASE) / (1 - TRUNK_BASE), 0, 1);
  // Saplings are slender; big trees get a massive trunk.
  const girth = height * 0.03 * clamp(Math.pow(n / 150, 0.25), 0.45, 1);
  const radiusOfMass = (mass: number) =>
    Math.max(girth * Math.pow(Math.max(mass, 0) / Math.max(n, 1), 0.45), height * 0.0014);
  const clusterSizeFor = (count: number) => clamp(Math.round(1.5 * Math.pow(count, 0.42)), 3, 30);

  // Leaf size follows lines changed, relative to this repository's usual commit.
  const changeSizes = commits
    .filter((c) => c.parents.length < 2)
    .map((c) => c.additions + c.deletions)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const typicalChange = changeSizes.length ? changeSizes[Math.floor((changeSizes.length - 1) * 0.95)] : 10;
  const sizeNorm = Math.log1p(Math.max(typicalChange, 4));
  const leafSize = new Float32Array(n);
  let budCount = 0;
  for (let i = 0; i < n; i++) {
    const commit = commits[i];
    if (commit.parents.length >= 2) {
      budCount++;
      leafSize[i] = leafBase * 0.4;
      continue;
    }
    const lines = commit.additions + commit.deletions;
    leafSize[i] = lines > 0 ? leafBase * (0.5 + 0.75 * Math.min(1.3, Math.log1p(lines) / sizeNorm)) : leafBase * 0.45;
  }

  // --- Outputs -------------------------------------------------------------
  const anchors = new Float32Array(n * 3);
  const centers = new Float32Array(n * 3);
  const uOf = new Float32Array(n);
  const holders: Holder[] = new Array(branches.length);
  const sproutPhi = new Float32Array(branches.length);
  const tubes: TubeSpec[] = [];
  const leaves = emptyInstances(n - budCount);
  const buds = emptyInstances(budCount);
  const authorColors = data.authors.map((_, i) => authorColor(i));
  const authorLinear = authorColors.map((hex) => new Color(hex));
  const boundsMin = new Vector3(Infinity, Infinity, Infinity);
  const boundsMax = new Vector3(-Infinity, -Infinity, -Infinity);

  // Scratch objects reused in the hot loops.
  const point = new Vector3();
  const tangent = new Vector3();
  const normal = new Vector3();
  const binormal = new Vector3();
  const radial = new Vector3();
  const axisX = new Vector3();
  const axisY = new Vector3();
  const axisZ = new Vector3();
  const matrix = new Matrix4();

  let leafCursor = 0;
  let budCursor = 0;

  const placeLeaf = (
    commitIndex: number,
    holder: Holder,
    u: number,
    theta: number,
    terminal: boolean,
    random: () => number,
  ) => {
    holder.curve.getPointAt(u, point);
    holder.curve.getTangentAt(u, tangent);
    perpendicularBasis(tangent, normal, binormal);
    radial.copy(normal).multiplyScalar(Math.cos(theta)).addScaledVector(binormal, Math.sin(theta));
    point.addScaledVector(radial, holder.radius(u) * 0.85);
    anchors.set([point.x, point.y, point.z], commitIndex * 3);
    boundsMin.min(point);
    boundsMax.max(point);

    const commit = commits[commitIndex];
    const size = leafSize[commitIndex];
    const isBud = commit.parents.length >= 2;
    const target = isBud ? buds : leaves;
    const slot = isBud ? budCursor++ : leafCursor++;

    if (isBud) {
      point.addScaledVector(radial, size * 0.45);
      matrix.makeScale(size, size, size).setPosition(point);
      centers.set([point.x, point.y, point.z], commitIndex * 3);
    } else {
      if (terminal) axisY.copy(tangent).addScaledVector(UP, 0.25);
      else axisY.copy(radial).multiplyScalar(0.9).addScaledVector(tangent, 0.55).addScaledVector(UP, 0.3);
      axisY.normalize();
      // The blade faces outward and up, so leaves are seen face-on from around the tree.
      axisZ.copy(radial).addScaledVector(UP, 0.6).normalize();
      axisX.crossVectors(axisY, axisZ);
      if (axisX.lengthSq() < 1e-6) axisX.crossVectors(Math.abs(axisY.y) < 0.97 ? UP : X_AXIS, axisY);
      axisX.normalize();
      axisZ.crossVectors(axisX, axisY);
      // Random roll around the leaf's own axis so the foliage does not look combed.
      const roll = (random() - 0.5) * 1.6;
      const cos = Math.cos(roll);
      const sin = Math.sin(roll);
      const x = axisX.clone().multiplyScalar(cos).addScaledVector(axisZ, sin);
      axisZ.crossVectors(x, axisY);
      matrix
        .makeBasis(x, axisY, axisZ)
        .scale(new Vector3(size, size, size))
        .setPosition(point);
      const middle = point.clone().addScaledVector(axisY, size * 0.5);
      centers.set([middle.x, middle.y, middle.z], commitIndex * 3);
    }

    matrix.toArray(target.matrix, slot * 16);
    const color = authorLinear[commit.author] ?? authorLinear[0];
    target.color.set([color.r, color.g, color.b], slot * 3);
    target.commit[slot] = commitIndex;
    target.birth[slot] = rank[commitIndex];
    target.author[slot] = commit.author;
    target.seed[slot] = random();
  };

  /** Start point and initial direction of a sprout (branch or twig) growing from a holder. */
  const sprout = (holder: Holder, u: number, phi: number, elevation: number) => {
    const start = holder.curve.getPointAt(u, new Vector3());
    const t = holder.curve.getTangentAt(u, new Vector3());
    perpendicularBasis(t, normal, binormal);
    const outward = normal.clone().multiplyScalar(Math.cos(phi)).addScaledVector(binormal, Math.sin(phi));
    if (!holder.isTrunk) {
      // Never grow back toward the trunk.
      const away = new Vector3(start.x, 0, start.z);
      if (away.lengthSq() > 1e-6 && outward.dot(away.normalize()) < -0.2) outward.negate();
    }
    const direction = outward.clone().multiplyScalar(Math.cos(elevation)).addScaledVector(t, Math.sin(elevation));
    if (direction.y < -0.25) direction.y = -0.25;
    direction.normalize();
    start.addScaledVector(outward, holder.radius(u) * 0.4);
    return { start, direction };
  };

  const buildTwig = (parent: Holder, group: number[], phi: number, clusterSize: number, random: () => number) => {
    const u0 = uOf[group[0]];
    const m = group.length;
    const fill = 0.6 + 0.4 * Math.sqrt(m / clusterSize);
    let length: number;
    let elevation: number;
    if (parent.isLeader) {
      const h = crownHeight(parent.curve.getPointAt(u0, point).y);
      length = crown * crownProfile(h) * fill * 0.8;
      elevation = lerp(-0.05, 0.85, h * h);
    } else {
      length = Math.min(parent.length * 0.38, crown * 0.45) * fill;
      elevation = 0.55;
    }
    length = Math.min(length, reachFor(m));
    const { start, direction } = sprout(parent, u0, phi, elevation);
    const curve = makeCurve(growPoints(start, direction, length, 0.28, 0.3, random, 4), 24);
    const vs = group.map((_, j) => 0.28 + (0.72 * (j + 1)) / m);
    const holder: Holder = {
      curve,
      length: curve.getLength(),
      radius: radiusFromMasses(
        vs.map((u) => ({ u, mass: 1 })),
        radiusOfMass,
        // Twigs stay slender next to their leaves, whatever the size of the repository.
        Math.min(parent.radius(u0) * 0.6, leafBase * 0.09),
      ),
      birth: piecewise([0, ...vs], [rank[group[0]] - 0.003, ...group.map((c) => rank[c])]),
      path: parent.path + u0 * parent.length,
      isTrunk: false,
      isLeader: false,
    };
    tubes.push({ holder, kind: WoodKind.twig, rings: 5, sides: 5 });
    const phase = random() * Math.PI * 2;
    group.forEach((commitIndex, j) =>
      placeLeaf(commitIndex, holder, vs[j], phase + j * GOLDEN_ANGLE, j === m - 1, random),
    );
    boundsMax.max(curve.getPointAt(1, point));
    boundsMin.min(point);
  };

  // --- Branches, from the trunk outward -------------------------------------
  for (const branch of branches) {
    const random = mulberry32(hashString(commits[branch.commits[0]].hash));
    const count = branch.commits.length;
    let holder: Holder;

    if (branch.id === 0) {
      const lean = random() * Math.PI * 2;
      const points: Vector3[] = [];
      for (let i = 0; i < 9; i++) {
        const f = i / 8;
        const sway = Math.sin(f * Math.PI * 1.25 + random() * 0.5) * height * 0.022 * f;
        points.push(
          new Vector3(
            Math.cos(lean) * sway + (random() - 0.5) * height * 0.008 * f,
            height * f,
            Math.sin(lean) * sway + (random() - 0.5) * height * 0.008 * f,
          ),
        );
      }
      const curve = makeCurve(points, 200);
      // A sapling (few commits, no twigs) keeps its leaves near the top, like a young shoot.
      const firstU = count > DIRECT_LEAVES_MAX ? TRUNK_BASE : 0.55;
      branch.commits.forEach((c, k) => (uOf[c] = firstU + ((1 - firstU) * (k + 1)) / count));
      const events = branch.commits.map((c) => ({ u: uOf[c], mass: 1 }));
      for (const childId of branch.children) {
        const child = branches[childId];
        events.push({ u: child.fork >= 0 ? uOf[child.fork] : TRUNK_BASE, mass: child.mass });
      }
      const base = radiusFromMasses(events, radiusOfMass, Infinity);
      holder = {
        curve,
        length: curve.getLength(),
        // Flared at the roots, pointed at the top.
        radius: (u) => base(u) * (1 + 0.9 * Math.exp(-u * 16)) * (1 - 0.7 * Math.pow(u, 6)),
        birth: piecewise([0, ...branch.commits.map((c) => uOf[c])], [0, ...branch.commits.map((c) => rank[c])]),
        path: 0,
        isTrunk: true,
        isLeader: true,
      };
      tubes.push({ holder, kind: WoodKind.trunk, rings: 96, sides: 28 });
    } else {
      const parent = holders[branch.parent];
      const forkU = branch.fork >= 0 ? uOf[branch.fork] : TRUNK_BASE;
      const forkY = parent.curve.getPointAt(forkU, point).y;
      const growth = clamp(0.12 + 0.16 * Math.log2(1 + branch.mass), 0.18, 1.1);
      // A branch carrying a big share of the work becomes a second stem, like a forked tree.
      const leader = parent.isTrunk && branch.mass >= n * LEADER_SHARE && count >= 12;
      let length: number;
      let elevation: number;
      let tropism = 0.4;
      if (leader) {
        length = Math.max(crown * 0.6, (height - forkY) * 0.95);
        elevation = 0.85;
        tropism = 0.75;
      } else if (parent.isLeader) {
        const h = crownHeight(forkY);
        length = Math.min(crown * crownProfile(h) * growth, reachFor(branch.mass));
        elevation = lerp(0.05, 0.9, h * h);
      } else {
        length = Math.min(parent.length * clamp(growth * 0.6, 0.3, 0.8) * (1 - 0.35 * forkU), reachFor(branch.mass));
        elevation = 0.5;
      }
      const { start, direction } = sprout(parent, forkU, sproutPhi[branch.id], elevation);
      const curve = makeCurve(growPoints(start, direction, length, tropism, 0.2, random, leader ? 8 : 6), 48);
      // Leaves spread over the outer part of the branch, the newest at the tip.
      branch.commits.forEach((c, k) => (uOf[c] = count === 1 ? 1 : 0.3 + (0.7 * (k + 1)) / count));
      const events = branch.commits.map((c) => ({ u: uOf[c], mass: 1 }));
      for (const childId of branch.children) {
        events.push({ u: uOf[branches[childId].fork], mass: branches[childId].mass });
      }
      const first = branch.commits[0];
      holder = {
        curve,
        length: curve.getLength(),
        radius: radiusFromMasses(
          events,
          radiusOfMass,
          Math.min(parent.radius(forkU) * 0.8, leader ? Infinity : leafBase * (0.08 + 0.05 * Math.sqrt(branch.mass))),
        ),
        birth: piecewise(
          [0, ...branch.commits.map((c) => uOf[c])],
          [rank[first] - 0.003, ...branch.commits.map((c) => rank[c])],
        ),
        path: parent.path + forkU * parent.length,
        isTrunk: false,
        isLeader: leader,
      };
      const small = branch.mass < 4;
      tubes.push({
        holder,
        kind: leader ? WoodKind.trunk : WoodKind.branch,
        rings: leader ? 48 : clamp(4 + count * 2, 6, 20),
        sides: leader ? 18 : small ? 6 : branch.depth === 1 ? 10 : 7,
      });
      boundsMax.max(curve.getPointAt(1, point));
      boundsMin.min(point);
    }
    holders[branch.id] = holder;

    // Sprouts (twigs and child branches) share one phyllotaxis spiral around the holder.
    const clusterSize = clusterSizeFor(count);
    const useTwigs = count > DIRECT_LEAVES_MAX;
    const sprouts: { u: number; child?: number; group?: number[] }[] = branch.children.map((child) => ({
      u: branches[child].fork >= 0 ? uOf[branches[child].fork] : TRUNK_BASE,
      child,
    }));
    if (useTwigs) {
      for (let k = 0; k < count; k += clusterSize) {
        const group = branch.commits.slice(k, k + clusterSize);
        sprouts.push({ u: uOf[group[0]], group });
      }
    }
    sprouts.sort((a, b) => a.u - b.u);
    const phase = random() * Math.PI * 2;
    sprouts.forEach((s, i) => {
      const phi = phase + i * GOLDEN_ANGLE + (random() - 0.5) * 0.35;
      if (s.child !== undefined) sproutPhi[s.child] = phi;
      else if (s.group) buildTwig(holder, s.group, phi, clusterSize, random);
    });
    if (!useTwigs) {
      branch.commits.forEach((c, k) => placeLeaf(c, holder, uOf[c], phase + k * GOLDEN_ANGLE, k === count - 1, random));
    }
  }

  // --- Roots (decorative) -----------------------------------------------------
  const trunk = holders[0];
  const rootRandom = mulberry32(hashString(data.name));
  const rootCount = 7;
  const trunkBaseRadius = trunk.radius(0);
  const rootPhase = rootRandom() * Math.PI * 2;
  for (let i = 0; i < rootCount; i++) {
    const angle = rootPhase + (i / rootCount) * Math.PI * 2 + (rootRandom() - 0.5) * 0.5;
    const direction = new Vector3(Math.cos(angle), -0.45 - rootRandom() * 0.25, Math.sin(angle));
    const start = trunk.curve.getPointAt(0.012, new Vector3());
    const curve = makeCurve(
      growPoints(start, direction, height * (0.13 + rootRandom() * 0.09), 0.45, 0.25, rootRandom, 6),
      32,
    );
    tubes.push({
      holder: {
        curve,
        length: curve.getLength(),
        radius: (u) => trunkBaseRadius * 0.5 * Math.pow(1 - u, 1.4),
        birth: () => 0,
        path: 0,
        isTrunk: false,
        isLeader: false,
      },
      kind: WoodKind.root,
      rings: 14,
      sides: 8,
    });
  }

  // --- Lianas: merged work flows back to its merge commit --------------------
  // One arc per merge edge between two different branches, newest merges first.
  const lianaPoints: number[] = [];
  const lianaAlong: number[] = [];
  const lianaBirth: number[] = [];
  const from = new Vector3();
  const to = new Vector3();
  const control = new Vector3();
  const previous = new Vector3();
  const current = new Vector3();
  let lianaCount = 0;
  for (let m = n - 1; m >= 0 && lianaCount < MAX_LIANAS; m--) {
    const parents = commits[m].parents;
    for (let p = 1; p < parents.length && lianaCount < MAX_LIANAS; p++) {
      const source = parents[p];
      if (branchOf[source] === branchOf[m]) continue;
      lianaCount++;
      from.fromArray(anchors, source * 3);
      to.fromArray(anchors, m * 3);
      const distance = from.distanceTo(to);
      control.addVectors(from, to).multiplyScalar(0.5);
      const outward = new Vector3(control.x, 0, control.z);
      if (outward.lengthSq() > 1e-6) control.addScaledVector(outward.normalize(), distance * 0.3);
      control.addScaledVector(UP, distance * 0.15);
      previous.copy(from);
      for (let s = 1; s <= LIANA_STEPS; s++) {
        const t = s / LIANA_STEPS;
        const a = (1 - t) * (1 - t);
        const b = 2 * (1 - t) * t;
        const c = t * t;
        current.set(
          a * from.x + b * control.x + c * to.x,
          a * from.y + b * control.y + c * to.y,
          a * from.z + b * control.z + c * to.z,
        );
        lianaPoints.push(previous.x, previous.y, previous.z, current.x, current.y, current.z);
        lianaAlong.push((s - 1) / LIANA_STEPS, t);
        lianaBirth.push(rank[m], rank[m]);
        previous.copy(current);
      }
    }
  }

  // --- Timeline -------------------------------------------------------------
  // Smooth each date with its neighbors: one commit made with a broken clock (1970, 2099…)
  // must not stretch the timeline. The history is ordered, so dates only move forward.
  const times = new Float64Array(n);
  const generated = Date.parse(data.generatedAt) / 1000;
  const window: number[] = [];
  let latest = -Infinity;
  for (let i = 0; i < n; i++) {
    window.length = 0;
    for (let j = Math.max(0, i - DATE_WINDOW); j <= Math.min(n - 1, i + DATE_WINDOW); j++) window.push(commits[j].time);
    window.sort((a, b) => a - b);
    let time = window[window.length >> 1];
    if (Number.isFinite(generated)) time = Math.min(time, generated);
    latest = Math.max(latest, time);
    times[i] = latest;
  }

  const yearMarks: { rank: number; year: number }[] = [];
  let lastYear: number | null = null;
  const activity = new Float32Array(ACTIVITY_BUCKETS);
  for (let i = 0; i < n; i++) {
    const year = new Date(times[i] * 1000).getUTCFullYear();
    if (lastYear !== null && year !== lastYear) yearMarks.push({ rank: rank[i], year });
    lastYear = year;
    const bucket = Math.min(ACTIVITY_BUCKETS - 1, Math.floor(rank[i] * ACTIVITY_BUCKETS));
    activity[bucket] += 0.5 + Math.log1p(commits[i].additions + commits[i].deletions);
  }
  const peak = Math.max(...activity, 1e-6);
  for (let i = 0; i < ACTIVITY_BUCKETS; i++) activity[i] /= peak;

  boundsMin.min(new Vector3(-crown * 0.3, 0, -crown * 0.3));
  boundsMax.max(new Vector3(crown * 0.3, height, crown * 0.3));
  const center = boundsMin.clone().add(boundsMax).multiplyScalar(0.5);
  const size = boundsMax.clone().sub(boundsMin);

  return {
    branches,
    branchOf,
    rank,
    anchors,
    centers,
    leafSize,
    leaves,
    buds,
    wood: buildWood(tubes),
    lianas: {
      position: new Float32Array(lianaPoints),
      along: new Float32Array(lianaAlong),
      birth: new Float32Array(lianaBirth),
    },
    authorColors,
    height,
    crown,
    bounds: { center: [center.x, center.y, center.z], size: [size.x, size.y, size.z], radius: size.length() / 2 },
    timeline: { times, first: n ? times[0] : 0, last: n ? times[n - 1] : 0 },
    yearMarks,
    activity,
  };
}

function buildWood(tubes: TubeSpec[]): WoodBuffers {
  let vertexCount = 0;
  let indexCount = 0;
  for (const tube of tubes) {
    vertexCount += (tube.rings + 1) * (tube.sides + 1);
    indexCount += tube.rings * tube.sides * 6;
  }
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  const center = new Float32Array(vertexCount * 3);
  const birth = new Float32Array(vertexCount);
  const kind = new Float32Array(vertexCount);
  const index = new Uint32Array(indexCount);

  const p = new Vector3();
  const dir = new Vector3();
  let v = 0;
  let k = 0;
  for (const { holder, kind: woodKind, rings, sides } of tubes) {
    const frames = holder.curve.computeFrenetFrames(rings, false);
    const first = v;
    for (let i = 0; i <= rings; i++) {
      const u = i / rings;
      holder.curve.getPointAt(u, p);
      const n = frames.normals[i];
      const b = frames.binormals[i];
      const r = i === rings ? 0 : holder.radius(u);
      const born = holder.birth(u);
      const along = holder.path + u * holder.length;
      for (let j = 0; j <= sides; j++) {
        const angle = (j / sides) * Math.PI * 2;
        dir.copy(n).multiplyScalar(Math.cos(angle)).addScaledVector(b, Math.sin(angle));
        position[v * 3] = p.x + dir.x * r;
        position[v * 3 + 1] = p.y + dir.y * r;
        position[v * 3 + 2] = p.z + dir.z * r;
        normal[v * 3] = dir.x;
        normal[v * 3 + 1] = dir.y;
        normal[v * 3 + 2] = dir.z;
        uv[v * 2] = along;
        uv[v * 2 + 1] = j / sides;
        center[v * 3] = p.x;
        center[v * 3 + 1] = p.y;
        center[v * 3 + 2] = p.z;
        birth[v] = born;
        kind[v] = woodKind;
        v++;
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < sides; j++) {
        const a = first + i * (sides + 1) + j;
        const c = a + sides + 1;
        // Counter-clockwise seen from outside (binormal = tangent × normal).
        index[k++] = a;
        index[k++] = a + 1;
        index[k++] = c;
        index[k++] = a + 1;
        index[k++] = c + 1;
        index[k++] = c;
      }
    }
  }
  return { position, normal, uv, center, birth, kind, index };
}
