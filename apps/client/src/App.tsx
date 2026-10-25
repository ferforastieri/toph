import { FormEvent, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

interface ServerInfo {
  baseUrl: string;
  name: string;
  version: string;
  buildId?: string;
}

const SERVER_KEY = "toph_desktop_server";
const LEGACY_RECENT_KEY = "toph_desktop_recent_servers";
const LOCAL_WORKSPACE_KEY = "toph_desktop_local_workspace";

function mobileUserAgent(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function readSavedServer(): string {
  try {
    const saved = localStorage.getItem(SERVER_KEY)?.trim();
    if (saved) {
      localStorage.removeItem(LEGACY_RECENT_KEY);
      return saved;
    }
    const legacy = localStorage.getItem(LEGACY_RECENT_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as unknown;
      const first = Array.isArray(parsed)
        ? parsed.find((item): item is string => typeof item === "string" && item.trim().length > 0)
        : null;
      localStorage.removeItem(LEGACY_RECENT_KEY);
      if (first) {
        localStorage.setItem(SERVER_KEY, first);
        return first;
      }
    }
  } catch {
    // Ignore malformed local state.
  }
  return "";
}

function mobileTarget(baseUrl: string): string {
  const target = new URL(`${baseUrl.replace(/\/$/, "")}/app/`);
  target.searchParams.set("mobile", "1");
  target.searchParams.set("server", baseUrl);
  return target.toString();
}

export default function App() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(mobileUserAgent);
  const bootStarted = useRef(false);

  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;

    void (async () => {
      const isMobile = await invoke<boolean>("is_mobile").catch(() => mobileUserAgent());
      setMobile(isMobile);

      const params = new URLSearchParams(window.location.search);
      if (params.get("change") === "1") {
        localStorage.removeItem(SERVER_KEY);
        localStorage.removeItem(LEGACY_RECENT_KEY);
        params.delete("change");
        const query = params.toString();
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
        );
        return;
      }

      const saved = readSavedServer();
      if (!saved) return;
      setUrl(saved);
      const navigationType = (
        performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined
      )?.type;
      if (navigationType === "back_forward") return;
      setBusy(true);
      setStatus("Reconectando ao último servidor...");
      try {
        const info = await invoke<ServerInfo>("validate_server", { url: saved });
        localStorage.setItem(SERVER_KEY, info.baseUrl);
        setStatus(`${info.name} ${info.version} encontrado. Abrindo...`);
        if (isMobile) {
          window.location.assign(mobileTarget(info.baseUrl));
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
    })();
  }, []);

  async function connect(event: FormEvent) {
    event.preventDefault();
    const value = url.trim();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    setStatus("Verificando servidor...");
    try {
      const info = await invoke<ServerInfo>("validate_server", { url: value });
      localStorage.setItem(SERVER_KEY, info.baseUrl);
      setStatus(`${info.name} ${info.version} encontrado. Abrindo...`);
      if (mobile) {
        window.location.assign(mobileTarget(info.baseUrl));
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
    // A local workspace gets an ephemeral loopback port. Starting the app again
    // should show the launcher instead of trying to reconnect to an old port.
    localStorage.removeItem(SERVER_KEY);
    localStorage.removeItem(LEGACY_RECENT_KEY);
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
          <img src="/toph-app-icon.png" alt="" />
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
