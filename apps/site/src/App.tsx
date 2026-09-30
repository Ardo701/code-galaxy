import { Galaxy, GalaxyLoader, Logo, REPO_DATA_SCHEMA, type RepoData } from '@code-galaxy/viewer';
import { Check, Copy, Maximize2 } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

interface DemoEntry {
  id: string;
  name: string;
  description: string;
  commits: number;
  authors: number;
  file: string;
}

const GITHUB_URL = import.meta.env.VITE_GITHUB_URL || 'https://github.com/Ardo701/code-galaxy';
const numbers = new Intl.NumberFormat('en-US');

function isRepoData(value: unknown): value is RepoData {
  const data = value as Partial<RepoData> | null;
  return (
    !!data &&
    data.schema === REPO_DATA_SCHEMA &&
    Array.isArray(data.commits) &&
    data.commits.length > 0 &&
    Array.isArray(data.authors) &&
    Array.isArray(data.refs) &&
    typeof data.trunkTip === 'number'
  );
}

function CopyCommand({ command, compact = false }: { command: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className={`command${compact ? ' is-compact' : ''}`}
      onClick={() =>
        navigator.clipboard?.writeText(command).then(
          () => setCopied(true),
          () => undefined,
        )
      }
      aria-label={`Copy "${command}"`}
    >
      <span className="command-prompt">$</span>
      <code>{command}</code>
      <span className="command-copy">{copied ? <Check size={14} /> : <Copy size={14} />}</span>
    </button>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <nav className={`nav${scrolled ? ' is-scrolled' : ''}`}>
      <a className="brand" href="#top">
        <Logo size={22} />
        <span>Code Galaxy</span>
      </a>
      <div className="nav-links">
        <a href="#how">How to read it</a>
        <a href="#features">Features</a>
        <a href="#start">Get started</a>
        {GITHUB_URL && (
          <a className="nav-github" href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        )}
      </div>
    </nav>
  );
}

function SectionHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="section-head">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </header>
  );
}

const KEY = [
  {
    glyph: 'trunk',
    term: 'Trunk',
    text: 'The first-parent history of the main branch. The first commit sits at the roots, today at the top.',
  },
  {
    glyph: 'branch',
    term: 'Branches',
    text: 'Git branches, growing from the exact commit they started from. The more work a branch carries, the thicker it gets.',
  },
  {
    glyph: 'leaf',
    term: 'Leaves',
    text: 'One per commit. The color says who wrote it, the size how many lines it added and deleted.',
  },
  {
    glyph: 'bud',
    term: 'Buds',
    text: 'Merge commits. They light up where a branch joined another one.',
  },
  {
    glyph: 'arc',
    term: 'Arcs',
    text: 'A merged branch flowing back to its merge commit. They can be hidden in the explorer.',
  },
];

const FEATURES = [
  {
    title: 'Private by design',
    text: 'Everything runs on your machine. No account, no upload, no server: your code never leaves your computer.',
  },
  {
    title: 'Replay the growth',
    text: 'Watch years of history grow in seconds, or scrub the timeline to see the tree at any date.',
  },
  {
    title: 'Grows while you work',
    text: 'Keep the tab open and commit: new leaves appear on the tree as you make them.',
  },
  {
    title: 'Every commit, one click away',
    text: 'Hover a leaf for a summary, click it for the details, its parents, its branch and a link to your forge.',
  },
  {
    title: 'See who built what',
    text: 'Pick a contributor to light up their leaves across the whole history.',
  },
  {
    title: 'Any repository',
    text: 'The one you are in, any folder on your computer, or a GitHub, GitLab or Bitbucket address to clone.',
  },
];

/** Small drawings for the key, in the colors the tree uses. */
function Glyph({ kind }: { kind: string }) {
  return (
    <svg className="glyph" viewBox="0 0 48 32" aria-hidden="true">
      {kind === 'trunk' && <path d="M20 31 C21 22 21.5 12 22.5 2 H25.5 C26.5 12 27 22 28 31 Z" fill="#6b609e" />}
      {kind === 'branch' && (
        <>
          <path d="M24 31 V2" stroke="#6b609e" strokeWidth="4" strokeLinecap="round" />
          <path d="M24 20 C31 17 36 12 40 5" stroke="#9489d0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M24 13 C18 11 13 7 9 3" stroke="#9489d0" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </>
      )}
      {kind === 'leaf' && (
        <>
          <path d="M6 26 C6 15 14 9 22 8 C22 18 15 25 6 26 Z" fill="#8f82f0" />
          <path d="M24 22 C25 12 33 6 42 5 C41 16 33 22 24 22 Z" fill="#f07ab5" />
          <path d="M30 30 C30.5 26 34 23.5 38 23 C37.5 27 34.5 30 30 30 Z" fill="#f2c14e" />
        </>
      )}
      {kind === 'bud' && (
        <>
          <path d="M24 31 V4" stroke="#6b609e" strokeWidth="3" strokeLinecap="round" />
          <circle cx="24" cy="15" r="4.5" fill="#8ff0e4" />
        </>
      )}
      {kind === 'arc' && (
        <>
          <path
            d="M8 28 C12 6 36 4 40 22"
            stroke="#6fd8f0"
            strokeWidth="1.6"
            fill="none"
            strokeDasharray="3 3"
            strokeLinecap="round"
          />
          <circle cx="8" cy="28" r="2.5" fill="#9489d0" />
          <circle cx="40" cy="22" r="3" fill="#8ff0e4" />
        </>
      )}
    </svg>
  );
}

function useDemos() {
  const [demos, setDemos] = useState<DemoEntry[]>([]);
  useEffect(() => {
    fetch('/demos/index.json')
      .then((response) => (response.ok ? (response.json() as Promise<DemoEntry[]>) : []))
      .then(setDemos, () => setDemos([]));
  }, []);
  return demos;
}

export function App() {
  const demos = useDemos();
  const [active, setActive] = useState<string | null>(null);
  const [data, setData] = useState<RepoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exploring, setExploring] = useState(false);

  const loadDemo = useCallback(async (demo: DemoEntry) => {
    setActive(demo.id);
    try {
      const response = await fetch(demo.file);
      const json: unknown = await response.json();
      if (!isRepoData(json)) throw new Error('Invalid demo file.');
      setData(json);
      setError(null);
    } catch {
      setError(`Could not load the ${demo.name} demo.`);
    }
  }, []);

  useEffect(() => {
    if (demos.length && !active) void loadDemo(demos[0]);
  }, [demos, active, loadDemo]);

  // The explorer covers the page: freeze the page scroll underneath.
  useEffect(() => {
    if (!exploring) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [exploring]);

  const current = demos.find((demo) => demo.id === active);

  return (
    <>
      <Nav />
      <main id="top">
        <section className="hero">
          <div className="hero-stage">
            {/* A showcase: it grows and turns, but never captures the scroll. One scene at a time. */}
            {data && !exploring ? (
              <Galaxy data={data} interactive={false} viewOffset={0.14} className="hero-galaxy" />
            ) : data ? null : (
              <GalaxyLoader label={error ?? 'Growing a demo tree…'} />
            )}
          </div>

          <div className="hero-card">
            <h1>Your Git history, grown into a living tree.</h1>
            <p className="hero-lead">
              The main branch becomes the trunk and every commit a leaf, colored by its author and sized by the lines it
              changed. Explore years of work in 3D, right in your browser.
            </p>
            <div className="hero-actions">
              <CopyCommand command="npx code-galaxy" />
              <button type="button" className="explore-button" onClick={() => setExploring(true)} disabled={!data}>
                <Maximize2 size={15} /> Explore in 3D
              </button>
            </div>
            <p className="hero-meta">Open source, MIT license. Runs on your machine.</p>

            <div className="hero-demos">
              <div className="demo-tabs" role="group" aria-label="Demo repository">
                <span className="demo-tabs-label">Demo</span>
                {demos.map((demo) => (
                  <button
                    key={demo.id}
                    type="button"
                    className={`demo-tab${active === demo.id ? ' is-active' : ''}`}
                    aria-pressed={active === demo.id}
                    onClick={() => void loadDemo(demo)}
                    title={demo.description}
                  >
                    {demo.name}
                  </button>
                ))}
              </div>
              <p className="hero-demo-caption">
                {current
                  ? `${current.description} ${numbers.format(current.commits)} commits by ${numbers.format(current.authors)} contributors.`
                  : ' '}
              </p>
              {error && data && <p className="hero-error">{error}</p>}
            </div>
          </div>
        </section>

        <section id="how" className="section split">
          <SectionHead title="How to read the tree">
            Code Galaxy reads your Git history and grows it into a tree. Every shape stands for something in the
            repository.
          </SectionHead>
          <dl className="key">
            {KEY.map((item) => (
              <div key={item.glyph} className="key-row">
                <dt>
                  <Glyph kind={item.glyph} />
                  {item.term}
                </dt>
                <dd>{item.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="features" className="section">
          <SectionHead title="What you can do with it" />
          <div className="features">
            {FEATURES.map(({ title, text }) => (
              <article key={title} className="feature">
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="start" className="section start">
          <SectionHead title="Get started">
            You need Node.js 20 or newer and Git. Nothing to install globally.
          </SectionHead>
          <div className="start-grid">
            <pre className="terminal" aria-label="Terminal running npx code-galaxy">
              <span className="t-dim">~/projects/my-app</span>
              {'\n'}
              <span className="t-dim">$</span> npx code-galaxy{'\n\n'}
              {'  '}
              <b>Code Galaxy</b> <span className="t-dim">v0.1.0</span>
              {'\n\n'}
              {'  '}
              <span className="t-ok">✔</span> <b>my-app</b> · Read <b>3,482</b> commits · 14 branches · 23 authors{' '}
              <span className="t-dim">(0.4s)</span>
              {'\n\n'}
              {'  '}
              <span className="t-accent">➜</span> <b>Code Galaxy</b> is growing at{' '}
              <span className="t-link">http://localhost:3141</span>
              {'\n\n'}
              {'  '}
              <span className="t-dim">Watching for new commits. Press Ctrl+C to stop.</span>
            </pre>
            <div className="start-commands">
              <div className="start-command">
                <h3>Open the repository you are in</h3>
                <CopyCommand command="npx code-galaxy" compact />
                <p>Anywhere else, it opens a picker: your repositories, a folder browser, or an address to clone.</p>
              </div>
              <div className="start-command">
                <h3>Open another folder</h3>
                <CopyCommand command="npx code-galaxy ../another-repo" compact />
              </div>
              <div className="start-command">
                <h3>Choose the branch drawn as the trunk</h3>
                <CopyCommand command="npx code-galaxy --trunk develop" compact />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-brand">
          <Logo size={18} />
          <span>Code Galaxy</span>
        </div>
        <p>Open source under the MIT license. Built with React Three Fiber.</p>
        {GITHUB_URL && (
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="footer-link">
            Source on GitHub
          </a>
        )}
      </footer>

      {exploring && data && (
        <div className="explorer" role="dialog" aria-modal="true" aria-label={`Explore ${data.name}`}>
          <Galaxy data={data} autoFocus onClose={() => setExploring(false)} />
        </div>
      )}
    </>
  );
}
