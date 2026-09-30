#!/usr/bin/env bash
# Generates small synthetic repositories whose history is known to stress the tree layout.
# Open one in the local app with: CG_REPO=.cache/edge-cases/<name> npm run dev
# Usage: npm run edge-cases
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/.cache/edge-cases"
rm -rf "$out" && mkdir -p "$out"
cd "$out"

export GIT_AUTHOR_NAME=Alice GIT_AUTHOR_EMAIL=alice@example.com
export GIT_COMMITTER_NAME=Alice GIT_COMMITTER_EMAIL=alice@example.com
commit() { echo "$RANDOM $1" >> "f$((RANDOM % 5)).txt"; git add -A; git commit -qm "$1"; }

# A sapling: only three commits.
git init -qb main tiny && (cd tiny && for i in 1 2 3; do commit "commit $i"; done)

# git-flow: all the work lands on develop, main only receives release merges.
git init -qb main gitflow && (
  cd gitflow && commit init && git checkout -qb develop
  for r in 1 2 3 4; do
    for f in 1 2 3 4 5 6; do
      git checkout -qb "feat-$r-$f" develop
      for k in 1 2 3 4; do GIT_AUTHOR_NAME="Dev$f" GIT_AUTHOR_EMAIL="dev$f@example.com" commit "feat $r.$f.$k"; done
      git checkout -q develop && git merge -q --no-ff "feat-$r-$f" -m "Merge branch 'feat-$r-$f' into develop"
      git branch -qD "feat-$r-$f"
    done
    for k in $(seq 1 15); do commit "develop work $r.$k"; done
    git checkout -q main && git merge -q --no-ff develop -m "Release $r" && git checkout -q develop
  done
  git checkout -q main
)

# An orphan branch (like gh-pages) with no common history.
git init -qb main orphan && (
  cd orphan && for i in $(seq 1 150); do commit "main $i"; done
  git checkout -q --orphan gh-pages && git rm -rfq . && for i in $(seq 1 120); do commit "docs build $i"; done
  git checkout -q main
)

# Broken clocks: one commit dated 2099, one dated 1970.
git init -qb main timewarp && (
  cd timewarp
  for i in $(seq 1 120); do
    case $i in
      40) GIT_AUTHOR_DATE="2099-01-01T12:00:00" commit "from the future" ;;
      80) GIT_AUTHOR_DATE="1970-01-02T12:00:00" commit "from 1970" ;;
      *) commit "normal $i" ;;
    esac
  done
)

# A never-merged branch carrying most of the work.
git init -qb main bigfeature && (
  cd bigfeature && for i in $(seq 1 30); do commit "main $i"; done
  git checkout -qb rewrite && for i in $(seq 1 260); do GIT_AUTHOR_NAME=Bob GIT_AUTHOR_EMAIL=bob@example.com commit "rewrite $i"; done
  git checkout -q main && for i in $(seq 31 120); do commit "main $i"; done
)

echo "Generated in $out:"
for repo in tiny gitflow orphan timewarp bigfeature; do echo "  CG_REPO=.cache/edge-cases/$repo npm run dev"; done
echo "  CG_REPO=.cache/edge-cases/gitflow CG_TRUNK=develop npm run dev   # git-flow with develop as default branch"
