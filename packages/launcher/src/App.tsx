import { FormEvent, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { QRCodeSVG } from "qrcode.react";

interface ServerInfo {
  baseUrl: string;
  name: string;
  version: string;
  buildId?: string;
}

interface ToolStatus {
  id: string;
  label: string;
  installed: boolean;
  version: string;
}

interface LocalServerInfo {
  baseUrl: string;
  lanUrl?: string | null;
  port: number;
  password: string;
}

interface PairingInfo {
  url: string;
  expiresIn: number;
}

const SERVER_KEY = "toph_desktop_server";
const LEGACY_RECENT_KEY = "toph_desktop_recent_servers";
const LOCAL_WORKSPACE_KEY = "toph_desktop_local_workspace";
const SHARE_NETWORK_KEY = "toph_desktop_share_network";

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
  target.searchParams.set("server", baseUrl);
  return target.toString();
}

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const field = document.createElement("textarea");
      field.value = value;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      return copied;
    } catch {
      return false;
    }
  }
}

function scannedServerBase(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const server = url.searchParams.get("server")?.trim();
    return (server || url.origin).replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export default function App() {
  const [initialServer] = useState(readSavedServer);
  const [mobileRedirect] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("change") === "1") return null;
    if (!mobileUserAgent()) return null;
    const saved = readSavedServer();
    if (!saved) return null;
    try {
      return mobileTarget(saved);
    } catch {
      return null;
    }
  });
  const [url, setUrl] = useState(initialServer);
  const [booting, setBooting] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    return Boolean(initialServer) && query.get("change") !== "1" && !mobileUserAgent();
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(mobileUserAgent);
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [environmentBusy, setEnvironmentBusy] = useState(false);
  const [installProgress, setInstallProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [environmentLog, setEnvironmentLog] = useState("");
  const [environmentError, setEnvironmentError] = useState("");
  const [shareNetwork, setShareNetwork] = useState(
    () => localStorage.getItem(SHARE_NETWORK_KEY) === "1",
  );
  const [localServer, setLocalServer] = useState<LocalServerInfo | null>(null);
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState<"url" | "password" | "">("");
  const [scanning, setScanning] = useState(false);
  const bootStarted = useRef(false);

  useEffect(() => {
    if (mobileRedirect) {
      window.location.replace(mobileRedirect);
      return;
    }
    if (bootStarted.current) return;
    bootStarted.current = true;

    void (async () => {
      const isMobile = await invoke<boolean>("is_mobile").catch(() => mobileUserAgent());
      setMobile(isMobile);

      const reset = await invoke<boolean>("take_launcher_reset").catch(() => false);
      if (reset) {
        localStorage.removeItem(SERVER_KEY);
        localStorage.removeItem(LEGACY_RECENT_KEY);
        setUrl("");
        setBooting(false);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      if (params.get("change") === "1") {
        localStorage.removeItem(SERVER_KEY);
        localStorage.removeItem(LEGACY_RECENT_KEY);
        setUrl("");
        params.delete("change");
        const query = params.toString();
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
        );
        setBooting(false);
        return;
      }

      const saved = readSavedServer();
      if (!saved) {
        setBooting(false);
        return;
      }
      setUrl(saved);
      const navigationType = (
        performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined
      )?.type;
      if (navigationType === "back_forward") {
        setBooting(false);
        return;
      }
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
        setBooting(false);
        setStatus("");
      } catch (err) {
        setStatus("");
        setError(err instanceof Error ? err.message : String(err));
        setBooting(false);
      } finally {
        setBusy(false);
      }
    })();
  }, [mobileRedirect]);

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

  async function openEnvironment() {
    setEnvironmentOpen(true);
    setEnvironmentError("");
    setEnvironmentLog("");
    try {
      const status = await invoke<ToolStatus[]>("environment_status");
      setTools(status);
      setSelectedTools(new Set(status.filter((tool) => !tool.installed).map((tool) => tool.id)));
    } catch (err) {
      setEnvironmentError(err instanceof Error ? err.message : String(err));
    }
  }

  function toggleTool(id: string) {
    setSelectedTools((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function installEnvironment() {
    if (environmentBusy) return;
    const selected = [...selectedTools];
    if (selected.length === 0) return;
    setEnvironmentBusy(true);
    setEnvironmentError("");
    setEnvironmentLog("");
    let current = 0;
    try {
      for (const id of selected) {
        const label = tools.find((tool) => tool.id === id)?.label ?? id;
        setInstallProgress({ current, total: selected.length, label });
        setEnvironmentLog((log) => `${log}Instalando ${label}...\n`);
        const output = await invoke<string>("install_environment", { components: [id] });
        setEnvironmentLog((log) => `${log}${output}\n`);
        current += 1;
        setInstallProgress({ current, total: selected.length, label });
        setTools(await invoke<ToolStatus[]>("environment_status"));
        setSelectedTools((value) => {
          const next = new Set(value);
          next.delete(id);
          return next;
        });
      }
      setEnvironmentLog((log) => `${log}\nAmbiente instalado. Reinicie o Toph para carregar o PATH atualizado.\n`);
    } catch (err) {
      setEnvironmentError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnvironmentBusy(false);
      setInstallProgress(null);
    }
  }

  async function restartToph() {
    await invoke("restart_app");
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
      const info = await invoke<LocalServerInfo>("start_local_server", {
        workspace,
        shareNetwork,
      });
      setLocalServer(info);
      if (shareNetwork) {
        setPairingError("");
        setQrOpen(true);
        try {
          setPairing(await invoke<PairingInfo>("local_pairing"));
          setStatus("");
        } catch (err) {
          setPairing(null);
          setPairingError(err instanceof Error ? err.message : String(err));
          setStatus("");
        }
      } else {
        await invoke("open_local_server", { network: false });
        setStatus("");
      }
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function refreshPairing() {
    if (pairingBusy) return;
    setPairingBusy(true);
    setPairingError("");
    try {
      setPairing(await invoke<PairingInfo>("local_pairing"));
    } catch (err) {
      setPairingError(err instanceof Error ? err.message : String(err));
    } finally {
      setPairingBusy(false);
    }
  }

  async function openWorkbench() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await invoke("open_local_server", { network: false });
      setPairing(null);
      setQrOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyValue(kind: "url" | "password", value: string) {
    if (await copyToClipboard(value)) {
      setCopied(kind);
      window.setTimeout(() => setCopied(""), 1600);
    }
  }

  async function scanQr() {
    if (scanning) return;
    setScanning(true);
    setError("");
    try {
      const { scan, Format } = await import("@tauri-apps/plugin-barcode-scanner");
      const result = await scan({ formats: [Format.QRCode] });
      const content = result.content.trim();
      const base = scannedServerBase(content);
      if (!base) throw new Error("Este QR code não aponta para um servidor Toph.");
      localStorage.setItem(SERVER_KEY, base);
      localStorage.removeItem(LEGACY_RECENT_KEY);
      try {
        await invoke("open_scanned_url", { url: content });
      } catch {
        window.location.assign(content);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/cancel/i.test(message)) setError(message);
    } finally {
      setScanning(false);
    }
  }

  if (mobileRedirect) return <main className="shell" />;

  if (booting) {
    return (
      <main className="shell boot-shell">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <section className="boot-card">
          <img src="/toph-app-icon.png?v=3" alt="" />
          <h1>Toph</h1>
          <p>Conectando ao servidor...</p>
          <span className="boot-pulse" />
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="launcher">
        <header className="brand">
          <img src="/toph-app-icon.png?v=3" alt="" />
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
          {mobile && (
            <button
              className="primary scan-button"
              type="button"
              disabled={scanning || busy}
              onClick={() => void scanQr()}
            >
              {scanning ? "Abrindo a câmera..." : "Escanear QR do computador"}
            </button>
          )}
          {mobile && (
            <div className="divider compact">
              <span>ou informe a URL</span>
            </div>
          )}
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
              <label className="share-toggle">
                <input
                  type="checkbox"
                  checked={shareNetwork}
                  disabled={busy}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setShareNetwork(next);
                    localStorage.setItem(SHARE_NETWORK_KEY, next ? "1" : "0");
                  }}
                />
                <span>
                  <strong>Acessar pelo celular nesta rede</strong>
                  <small>
                    Mostra um QR para o app Android. O Toph fica visível na rede Wi-Fi
                    enquanto estiver aberto.
                  </small>
                </span>
              </label>
              <button className="secondary" type="button" disabled={busy} onClick={() => void localMode()}>
                {busy
                  ? "Preparando..."
                  : shareNetwork
                    ? "Escolher pasta e mostrar QR"
                    : "Escolher pasta e abrir"}
              </button>
            </div>
            <div className="local-card environment-card">
              <div>
                <span className="eyebrow">Opcional</span>
                <h2>Ambiente de desenvolvimento</h2>
                <p>Instale Git, Node.js, pnpm, Rust, Go e Python para usar no terminal local.</p>
              </div>
              <button className="secondary" type="button" disabled={busy} onClick={() => void openEnvironment()}>
                Escolher ferramentas
              </button>
            </div>
          </>
        )}

        {status && <div className="status">{status}</div>}
        {error && <div className="error">{error}</div>}
      </section>

      {environmentOpen && (
        <div className="environment-backdrop" role="presentation" onClick={() => !environmentBusy && setEnvironmentOpen(false)}>
          <section
            className="environment-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Ambiente de desenvolvimento"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="environment-modal-head">
              <div>
                <span className="eyebrow">Ambiente local</span>
                <h2>Ferramentas de desenvolvimento</h2>
                <p>As ferramentas escolhidas serão instaladas neste computador.</p>
              </div>
              <button
                type="button"
                className="environment-close"
                disabled={environmentBusy}
                onClick={() => setEnvironmentOpen(false)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="environment-tools">
              {tools.map((tool) => (
                <label key={tool.id} className={`environment-tool ${tool.installed ? "installed" : ""}`}>
                  <input
                    type="checkbox"
                    checked={tool.installed || selectedTools.has(tool.id)}
                    disabled={tool.installed || environmentBusy}
                    onChange={() => toggleTool(tool.id)}
                  />
                  <span className="environment-tool-copy">
                    <strong>{tool.label}</strong>
                    <small>{tool.installed ? tool.version || "instalado" : "não instalado"}</small>
                  </span>
                  {tool.installed && <span className="environment-tool-badge">pronto</span>}
                </label>
              ))}
            </div>
            <p className="environment-note">
              No Linux, o sistema pode pedir sua senha de administrador. No Windows, o instalador usa o winget.
            </p>
            {environmentBusy && installProgress ? (
              <div className="environment-progress" role="status" aria-label="Progresso da instalação">
                <div className="environment-progress-track">
                  <span style={{ width: `${Math.round((installProgress.current / Math.max(1, installProgress.total)) * 100)}%` }} />
                </div>
                <small>{installProgress.label} · {installProgress.current}/{installProgress.total}</small>
              </div>
            ) : null}
            {environmentError && <div className="error">{environmentError}</div>}
            {environmentLog && <pre className="environment-log">{environmentLog}</pre>}
            <div className="environment-actions">
              <button type="button" className="secondary" disabled={environmentBusy} onClick={() => setEnvironmentOpen(false)}>
                Fechar
              </button>
              <button
                type="button"
                className="secondary"
                disabled={environmentBusy}
                onClick={() => void restartToph()}
              >
                Reiniciar Toph
              </button>
              {tools.length > 0 && tools.every((tool) => tool.installed) ? (
                <button type="button" className="primary" disabled={environmentBusy} onClick={() => setEnvironmentOpen(false)}>
                  Continuar
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={environmentBusy || selectedTools.size === 0}
                  onClick={() => void installEnvironment()}
                >
                  {environmentBusy ? "Instalando..." : "Instalar selecionadas"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {qrOpen && localServer && (
        <div className="environment-backdrop" role="presentation">
          <section
            className="environment-modal pairing-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Conectar celular"
          >
            <div className="environment-modal-head">
              <div>
                <span className="eyebrow">Pareamento</span>
                <h2>Conecte o celular</h2>
                <p>
                  Abra o Toph no Android e toque em <strong>Escanear QR do computador</strong>.
                </p>
              </div>
            </div>

            {pairing ? (
              <div className="pairing-grid">
                <div className="pairing-qr">
                  <QRCodeSVG
                    value={pairing.url}
                    size={212}
                    level="M"
                    marginSize={2}
                    bgColor="#ffffff"
                    fgColor="#050505"
                    title="QR de pareamento do Toph"
                  />
                </div>
                <div className="pairing-details">
                  <span className="eyebrow">Endereço na rede local</span>
                  <div className="pairing-copy">
                    <code>{localServer.lanUrl ?? localServer.baseUrl}</code>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        void copyValue("url", localServer.lanUrl ?? localServer.baseUrl)
                      }
                    >
                      {copied === "url" ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                  <p>
                    O código expira em {Math.max(1, Math.round(pairing.expiresIn / 60))} minutos e
                    só pode ser usado uma vez.
                  </p>
                  <details>
                    <summary>Entrar manualmente com senha</summary>
                    <div className="pairing-copy">
                      <code>{localServer.password}</code>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void copyValue("password", localServer.password)}
                      >
                        {copied === "password" ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            ) : (
              <div className="error">
                {pairingError || "Não foi possível gerar o QR code de pareamento."}
              </div>
            )}

            {pairingError && pairing && <div className="error">{pairingError}</div>}
            {error && <div className="error">{error}</div>}

            <p className="environment-note pairing-note">
              O computador e o celular precisam estar na mesma rede. Se o Windows pedir permissão
              de firewall, permita o acesso em redes privadas. O acesso fica ativo enquanto o Toph
              estiver aberto.
            </p>

            <div className="environment-actions">
              <button
                type="button"
                className="secondary"
                disabled={pairingBusy || busy}
                onClick={() => void refreshPairing()}
              >
                {pairingBusy ? "Gerando..." : "Gerar novo QR"}
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void openWorkbench()}
              >
                {busy ? "Abrindo..." : "Abrir workbench neste computador"}
              </button>
            </div>
          </section>
        </div>
      )}

      <footer>Toph Client · cliente self-hosted</footer>
    </main>
  );
}
