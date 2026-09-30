/**
 * The data format exchanged between the CLI (which reads Git) and the viewer
 * (which draws the tree). It is also the format of exported `.galaxy.json`
 * files, so keep it backward compatible and bump `schema` on breaking changes.
 *
 * This file must stay free of imports: the CLI imports it as types only.
 */

export const REPO_DATA_SCHEMA = 1;

export interface RepoData {
  schema: typeof REPO_DATA_SCHEMA;
  /** Repository name, usually the folder name. */
  name: string;
  /** ISO date of when the data was generated. */
  generatedAt: string;
  /** Link template for a commit, with `{hash}` as placeholder. Null when the remote is unknown. */
  commitUrl: string | null;
  /** Name of the branch drawn as the trunk (e.g. "main"). */
  trunk: string;
  /** Index in `commits` of the trunk tip. */
  trunkTip: number;
  /** Authors, sorted by number of commits (most active first). */
  authors: AuthorInfo[];
  /** Commits sorted oldest first. A commit always comes after all of its parents. */
  commits: CommitInfo[];
  /** Branch tips (local and remote-tracking branches). */
  refs: RefInfo[];
}

export interface AuthorInfo {
  name: string;
  commits: number;
}

export interface CommitInfo {
  hash: string;
  /** Indices of the parent commits in `RepoData.commits`. The first one is the first parent. */
  parents: number[];
  /** Index of the author in `RepoData.authors`. */
  author: number;
  /** Author date, in seconds since the Unix epoch. */
  time: number;
  /** First line of the commit message. */
  message: string;
  additions: number;
  deletions: number;
  /** Number of files changed. */
  files: number;
}

export interface RefInfo {
  /** Short name, e.g. "main" or "origin/feature-x". */
  name: string;
  /** Index of the tip commit in `RepoData.commits`. */
  commit: number;
  remote: boolean;
}
