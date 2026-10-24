import { FormEvent, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

interface ServerInfo {
  baseUrl: string;
  name: string;
  version: string;
  buildId?: string;
}

const RECENT_KEY = "toph_desktop_recent_servers";
const LOCAL_WORKSPACE_KEY = "toph_desktop_local_workspace";

export default function App() {
  const [url, setUrl] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(() => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

  useEffect(() => {
    invoke<boolean>("is_mobile").then(setMobile).catch(() => undefined);
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw).filter((item: unknown) => typeof item === "string"));
    } catch {
      // Ignore malformed local state.
    }
  }, []);

  function remember(baseUrl: string) {
    const next = [baseUrl, ...recent.filter((item) => item !== baseUrl)].slice(0, 5);
    setRecent(next);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  }

  async function connect(event: FormEvent) {
    event.preventDefault();
    const value = url.trim();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    setStatus("Verificando servidor...");
    try {
      const info = await invoke<ServerInfo>("validate_server", { url: value });
      setStatus(`${info.name} ${info.version} encontrado. Abrindo...`);
      remember(info.baseUrl);
      if (mobile) {
        const target = new URL(`${info.baseUrl.replace(/\/$/, "")}/app/`);
        target.searchParams.set("mobile", "1");
        target.searchParams.set("server", info.baseUrl);
        window.location.assign(target.toString());
        return;
      }
      await invoke("open_server", { url: info.baseUrl });
      setStatus("");
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function localMode() {
    if (busy) return;
    setBusy(true);
    setError("");
    let workspace: string | null = null;
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Escolha a pasta do workspace local",
        defaultPath: localStorage.getItem(LOCAL_WORKSPACE_KEY) ?? undefined,
      });
      workspace = Array.isArray(selected) ? selected[0] ?? null : selected;
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (!workspace) {
      setBusy(false);
      return;
    }

    localStorage.setItem(LOCAL_WORKSPACE_KEY, workspace);
    setStatus("Preparando modo local...");
    try {
      await invoke("start_local_server", { workspace });
      setStatus("");
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="launcher">
        <header className="brand">
          <img src="/toph-mark.png" alt="" />
          <div>
            <h1>Toph</h1>
            <p>{mobile ? "Seu workbench, no seu servidor." : "Seu workbench, no servidor ou neste computador."}</p>
          </div>
        </header>

        <div className="mode-card">
          <div className="mode-heading">
            <span className="eyebrow">Servidor</span>
            <h2>Conectar a um Toph</h2>
            <p>Informe apenas a URL do seu servidor. O Toph cuida do resto.</p>
          </div>
          <form onSubmit={connect}>
            <label className="url-field">
              <span>URL do servidor</span>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://toph.exemplo.com"
                autoFocus
                spellCheck={false}
                autoComplete="url"
              />
            </label>
            <button className="primary" disabled={busy || !url.trim()}>
              {busy ? "Conectando..." : "Conectar"}
            </button>
          </form>
          {recent.length > 0 && (
            <div className="recent">
              <span>Recentes</span>
              {recent.map((item) => (
                <button key={item} type="button" className="recent-item" onClick={() => setUrl(item)}>
                  {item.replace(/^https?:\/\//, "")}
                </button>
              ))}
            </div>
          )}
        </div>

        {!mobile && (
          <>
            <div className="divider">
              <span>ou</span>
            </div>
            <div className="local-card">
              <div>
                <span className="eyebrow">Este computador</span>
                <h2>Usar um workspace local</h2>
                <p>Arquivos, terminal e projetos na própria máquina, sem servidor.</p>
              </div>
              <button className="secondary" type="button" disabled={busy} onClick={() => void localMode()}>
                Escolher pasta e abrir
              </button>
            </div>
          </>
        )}

        {status && <div className="status">{status}</div>}
        {error && <div className="error">{error}</div>}
      </section>
      <footer>Toph Client · cliente self-hosted</footer>
    </main>
  );
}
