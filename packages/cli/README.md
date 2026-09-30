# code-galaxy-tree

**Your Git history, grown into a living 3D tree.**

![The history of react-three-fiber as a 3D tree, one leaf per commit, colored by author](https://raw.githubusercontent.com/Ardo701/code-galaxy/main/docs/images/tree.jpg)

```bash
npx code-galaxy-tree
```

Run it in a Git repository and the tree opens in your browser. The main branch is the trunk, Git branches grow from the
commit they started from, and every commit is a leaf, colored by its author and sized by the lines it changed. Merge
commits light up like buds.

Run it anywhere else to pick a repository: those found on your computer, recent ones, any folder, or the address of a
repository to clone (GitHub, GitLab, Bitbucket, Codeberg or any Git host).

- Click a leaf to read the commit, with a link to your forge.
- Replay the growth, or scrub the timeline to any date.
- Highlight one contributor's work across the whole history.
- Keep the tab open: the tree follows your new commits.

Everything runs on your machine: the viewer is served on `localhost` only, and nothing is uploaded.

## Usage

```text
code-galaxy-tree [path]                   Open the tree of the repository at path (default: this folder, or the picker)
code-galaxy-tree export [path] [-o file]  Save the history as a .galaxy.json file

-p, --port <number>    Port of the local server (default: 3141)
-t, --trunk <branch>   Branch drawn as the trunk (default: the main branch)
    --no-open          Do not open the browser
    --no-watch         Do not update the tree when new commits are made
-h, --help             Show the help
-v, --version          Show the version
```

Requires Node.js 20.19+ and Git. Documentation and source: [github.com/Ardo701/code-galaxy](https://github.com/Ardo701/code-galaxy).

## License

MIT
