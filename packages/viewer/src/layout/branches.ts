import type { RepoData } from '../types';

/**
 * A Git-level branch of the tree: a run of commits linked by first parents.
 * Branch 0 is always the trunk (see `mainline`).
 */
export interface BranchInfo {
  id: number;
  /** Parent branch id, -1 for the trunk. */
  parent: number;
  depth: number;
  /** Commit indices, oldest first. */
  commits: number[];
  /** Commit of the parent branch this one grows from, -1 for the trunk and orphan histories. */
  fork: number;
  /** Commit that merged this branch back, -1 if it was never merged. */
  merge: number;
  /** Branch name when it can be recovered (ref name or merge message). */
  label: string | null;
  /** Number of commits carried by this branch and all of its sub-branches. */
  mass: number;
  /** Child branch ids, in growth order. */
  children: number[];
}

export interface BranchAssignment {
  branches: BranchInfo[];
  /** Branch id of every commit. */
  branchOf: Int32Array;
}

/**
 * Splits the commit graph into branches.
 *
 * The trunk is claimed first. Every other chain starts either at a branch tip
 * or at a non-first parent of a merge, and walks first parents until it meets
 * an already claimed commit: that commit is where the branch forks.
 * Merges are visited newest first so that a branch merged into another branch
 * is nested under it instead of stealing its commits.
 */
export function assignBranches(data: RepoData): BranchAssignment {
  const { commits } = data;
  const branchOf = new Int32Array(commits.length).fill(-1);
  const trunk = mainline(data);
  for (const commit of trunk.commits) branchOf[commit] = 0;
  const branches: BranchInfo[] = [
    { id: 0, parent: -1, depth: 0, commits: trunk.commits, fork: -1, merge: -1, label: null, mass: 0, children: [] },
  ];

  const claim = (start: number, merge: number) => {
    if (start < 0 || start >= commits.length) return;
    if (branchOf[start] !== -1) {
      // A branch tip may already be claimed from its ref: still record the merge.
      const owner = branches[branchOf[start]];
      if (merge >= 0 && owner.id !== 0 && owner.merge === -1 && owner.commits[owner.commits.length - 1] === start) {
        owner.merge = merge;
      }
      return;
    }
    const id = branches.length;
    const chain: number[] = [];
    let current = start;
    while (current !== -1 && branchOf[current] === -1) {
      branchOf[current] = id;
      chain.push(current);
      current = commits[current].parents[0] ?? -1;
    }
    chain.reverse();
    branches.push({
      id,
      parent: current === -1 ? 0 : branchOf[current],
      depth: 0,
      commits: chain,
      fork: current,
      merge,
      label: null,
      mass: 0,
      children: [],
    });
  };

  const refsByRecency = [...data.refs].sort((a, b) => {
    if (a.remote !== b.remote) return a.remote ? 1 : -1;
    return b.commit - a.commit;
  });
  for (const ref of refsByRecency) claim(ref.commit, -1);

  for (let i = commits.length - 1; i >= 0; i--) {
    const parents = commits[i].parents;
    for (let p = 1; p < parents.length; p++) claim(parents[p], i);
  }

  // Unreachable in practice (every commit comes from a ref), but never leave a commit out.
  for (let i = commits.length - 1; i >= 0; i--) {
    if (branchOf[i] === -1) claim(i, -1);
  }

  for (const branch of branches) {
    if (branch.parent >= 0) {
      branch.depth = branches[branch.parent].depth + 1;
      branches[branch.parent].children.push(branch.id);
    }
  }
  // Parents always have a smaller id than their children, so one reverse pass sums the masses.
  for (let id = branches.length - 1; id >= 0; id--) {
    const branch = branches[id];
    branch.mass += branch.commits.length;
    if (branch.parent >= 0) branches[branch.parent].mass += branch.mass;
  }

  labelBranches(data, branches, trunk.names);
  return { branches, branchOf };
}

/** Share of merges above which two histories are considered intertwined. */
const INTERTWINED = 0.5;
/** A branch that merges the trunk this often is a release/deploy branch, not a feature. */
const FEEDS_ON_TRUNK = 0.75;

/**
 * The trunk: the first-parent history of the main branch, plus the history of any
 * branch intertwined with it, so that git-flow repositories grow one trunk instead
 * of a bare pole with all the work hanging on one side:
 * - the main branch mostly merges another, longer branch (`develop` merged at each release);
 * - or another branch mostly merges the main branch (a release or deploy branch).
 * Commits are returned oldest first.
 */
export function mainline(data: RepoData): { commits: number[]; names: string[] } {
  const { commits } = data;
  const onTrunk = new Uint8Array(commits.length);
  const base: number[] = [];
  for (let c = data.trunkTip; c !== -1 && c < commits.length; c = commits[c].parents[0] ?? -1) {
    onTrunk[c] = 1;
    base.push(c);
  }
  const baseMerges = base.filter((c) => commits[c].parents.length > 1);
  const names = [data.trunk];
  const refs = [...data.refs].sort((a, b) => Number(a.remote) - Number(b.remote));

  for (const ref of refs) {
    // This branch's own commits: its first-parent history until it meets the trunk.
    const own: number[] = [];
    for (let c = ref.commit; c !== -1 && !onTrunk[c]; c = commits[c].parents[0] ?? -1) own.push(c);
    if (own.length < 2) continue;
    const ownSet = new Set(own);
    const fed = baseMerges.filter((m) => ownSet.has(commits[m].parents[1])).length;
    const feeds = own.filter((c) => commits[c].parents.length > 1 && onTrunk[commits[c].parents[1]]).length;
    const developLine = fed >= 2 && fed >= baseMerges.length * INTERTWINED && own.length >= base.length;
    const releaseLine = feeds >= 3 && feeds >= own.length * FEEDS_ON_TRUNK;
    if (!developLine && !releaseLine) continue;
    for (const c of own) onTrunk[c] = 1;
    const name = ref.remote ? ref.name.replace(/^[^/]+\//, '') : ref.name;
    if (!names.includes(name)) names.push(name);
  }

  const trunk: number[] = [];
  for (let i = 0; i < commits.length; i++) if (onTrunk[i]) trunk.push(i);
  return { commits: trunk, names };
}

const MERGE_PATTERNS = [
  /^Merge pull request #(\d+) from (\S+)/,
  /^Merge branch '([^']+)'/,
  /^Merge remote-tracking branch '([^']+)'/,
  /^Merged? (?:in )?(\S+) (?:into|to) /,
];

function labelBranches(data: RepoData, branches: BranchInfo[], trunkNames: string[]) {
  const refNames = new Map<number, string>();
  for (const ref of data.refs) {
    const existing = refNames.get(ref.commit);
    // Prefer local branch names over their remote-tracking copies.
    if (!existing || (!ref.remote && existing.includes('/'))) refNames.set(ref.commit, ref.name);
  }

  branches[0].label = trunkNames.join(' + ');
  for (const branch of branches.slice(1)) {
    const tip = branch.commits[branch.commits.length - 1];
    const refName = refNames.get(tip);
    if (refName) {
      branch.label = refName;
      continue;
    }
    if (branch.merge < 0) continue;
    const message = data.commits[branch.merge].message;
    for (const pattern of MERGE_PATTERNS) {
      const match = pattern.exec(message);
      if (!match) continue;
      branch.label = match.length > 2 ? `${match[2]} (#${match[1]})` : match[1];
      break;
    }
  }
}
