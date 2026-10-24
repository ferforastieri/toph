import {
  ArrowRight,
  Bot,
  Database,
  Code2,
  Globe2,
  Layers3,
  MonitorSmartphone,
  TerminalSquare,
} from "lucide-react";
import BrandMark from "@toph/brand";

const features = [
  {
    icon: Layers3,
    title: "One workbench",
    text: "Code, databases, AI sessions, terminals and self-hosted apps in the same tab strip.",
  },
  {
    icon: Database,
    title: "Real database console",
    text: "Postgres, MySQL, SQLite, SQL Server, Oracle, ClickHouse, MongoDB and Redis.",
  },
  {
    icon: Bot,
    title: "OpenCode inside",
    text: "Native sessions with streaming, tool calls and permission prompts.",
  },
  {
    icon: MonitorSmartphone,
    title: "Browser and Android",
    text: "The same self-hosted backend. A Tauri APK for the phone, a fast web client for the desk.",
  },
  {
    icon: Globe2,
    title: "Self-hosted tabs",
    text: "Keep Grafana, your dashboards and internal tools next to the code that runs them.",
  },
  {
    icon: TerminalSquare,
    title: "Server-side power",
    text: "PTYs, files, database drivers and AI run on the server. Clients stay thin.",
  },
];

export default function Landing() {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <a className="landing-brand" href="/">
          <BrandMark size="small" />
        </a>
        <div className="landing-links">
          <a href="#features">Features</a>
          <a href="#architecture">Architecture</a>
          <a href="/docs.html">Docs</a>
          <a href="https://github.com/ferforastieri/toph" target="_blank" rel="noreferrer">
            <Code2 size={15} /> GitHub
          </a>
          <a className="landing-open" href="/app">
            Open Toph <ArrowRight size={14} />
          </a>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy">
          <span className="eyebrow">Self-hosted workbench for your servers</span>
          <h1>
            Your servers,
            <br />
            <span>in one workbench.</span>
          </h1>
          <p>
            Toph puts code, databases, AI agents, terminals and web apps in the same
            workspace. It runs on your server, in your browser and on your phone.
          </p>
          <div className="hero-actions">
            <a className="primary landing-cta" href="/app">
              Open Toph <ArrowRight size={16} />
            </a>
            <a className="ghost landing-cta" href="/docs.html">
              Read the docs
            </a>
          </div>
          <div className="hero-meta">
            <span>MIT licensed</span>
            <span>No cloud account</span>
            <span>Docker or single binary</span>
          </div>
        </div>

        <div className="hero-workbench" aria-hidden="true">
          <div className="mock-titlebar">
            <span className="mock-dot" />
            <span className="mock-dot" />
            <span className="mock-dot" />
            <span className="mock-project">workspace</span>
            <span className="mock-status">main</span>
          </div>
          <div className="mock-tabs">
            <span className="mock-tab active">app.tsx</span>
            <span className="mock-tab">database</span>
            <span className="mock-tab">OpenCode</span>
            <span className="mock-tab">Grafana</span>
          </div>
          <div className="mock-body">
            <div className="mock-tree">
              <span>src</span>
              <span className="indent">components</span>
              <span className="indent active">Workbench.tsx</span>
              <span className="indent">api.ts</span>
              <span>compose.yaml</span>
              <span>README.md</span>
            </div>
            <div className="mock-code">
              <span>
                <i>const</i> workspace = <b>await</b> toph.open(
              </span>
              <span className="indent">
                <em>"workspace"</em>,
              </span>
              <span className="indent">{"{ tabs: [code, data, ai] }"},</span>
              <span>);</span>
              <br />
              <span className="muted">// one server, one session, every tool</span>
            </div>
          </div>
          <div className="mock-terminal">
            <span className="prompt">~/workspace $</span> docker compose up -d
            <br />
            <span className="ok">✓ toph ready on :8787</span>
          </div>
        </div>
      </section>

      <section className="landing-section" id="features">
        <div className="section-heading">
          <span className="eyebrow">What is inside</span>
          <h2>Less context switching. More work.</h2>
          <p>
            Toph is not a dashboard with links. It is a real workbench with first-class
            tabs for the things you use every day.
          </p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article className="feature-card" key={feature.title}>
                <Icon size={21} />
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="landing-section architecture-section" id="architecture">
        <div className="section-heading">
          <span className="eyebrow">Architecture</span>
          <h2>Thin clients. Heavy lifting on your server.</h2>
          <p>
            The Go backend owns files, shells, credentials, database drivers and AI
            sessions. The browser and the APK only render and stream.
          </p>
        </div>
        <div className="architecture-grid">
          <pre>{`Browser (React)            Android (Compose)
        │                          │
        └──── HTTPS / WSS ─────────┘
                     │
                 toph (Go)
        ├── auth + projects
        ├── files + git + search
        ├── PTY terminal
        ├── database gateway
        ├── OpenCode proxy
        └── web targets`}</pre>
          <div className="architecture-notes">
            <div>
              <strong>One backend</strong>
              <span>Install once, use from every client.</span>
            </div>
            <div>
              <strong>No browser iframe dependency</strong>
              <span>Android uses native WebView; the web client uses tabs.</span>
            </div>
            <div>
              <strong>Your data stays home</strong>
              <span>Repositories, credentials and sessions never leave the server.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-install">
        <div>
          <span className="eyebrow">Run it</span>
          <h2>One command. Your server.</h2>
          <p>Docker Compose, a single Go binary, or the Android debug APK.</p>
        </div>
        <code>
          <span>$</span> docker compose -f deploy/compose.yaml up --build
        </code>
        <a className="primary landing-cta" href="/app">
          Open the workbench <ArrowRight size={16} />
        </a>
      </section>

      <footer className="landing-footer">
        <span>Toph · MIT · self-hosted</span>
        <div>
          <a href="/docs.html">Docs</a>
          <a href="https://github.com/ferforastieri/toph" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </footer>
    </main>
  );
}
