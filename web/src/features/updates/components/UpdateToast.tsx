import { useEffect, useRef, useState } from "react";
import { api, ApiError, type UpdateInstaller, type UpdateStatus } from "../../../shared/api";
import { Icon } from "@toph/ui";
import { ProgressBar } from "@toph/ui/app";
import { isMobileViewport } from "../../../shared/ui/useIsMobile";

type Phase = "idle" | "updating" | "error";

interface TauriInternals {
  invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
}

async function clearClientCaches() {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.update()));
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function downloadApk(url: string, version: string) {
  // Android WebView ignores anchor downloads. Use the native opener so the APK
  // opens in the system browser/download manager. If the client is too old to
  // have the opener plugin, fall back to navigating to the APK URL.
  const internals = (window as unknown as {
    __TAURI_INTERNALS__?: { invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
  }).__TAURI_INTERNALS__;
  if (internals?.invoke) {
    let settled = false;
    const fallback = () => {
      if (settled) return;
      settled = true;
      window.location.href = url;
    };
    const timer = window.setTimeout(fallback, 1500);
    void internals
      .invoke("plugin:opener|open_url", { url })
      .then(() => { settled = true; window.clearTimeout(timer); })
      .catch(() => { window.clearTimeout(timer); fallback(); });
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = `toph-v${version}.apk`;
  link.rel = "noopener";
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function isMobile(): boolean {
  return isMobileViewport();
}

function platform(): "windows" | "linux" | "mac" | "other" {
  const value = `${navigator.userAgent} ${navigator.platform}`;
  if (/windows|win32|win64/i.test(value)) return "windows";
  if (/linux|x11/i.test(value)) return "linux";
  if (/macintosh|mac os|darwin/i.test(value)) return "mac";
  return "other";
}

function findInstaller(
  installers: UpdateInstaller[] | undefined,
  kind: UpdateInstaller["kind"],
): UpdateInstaller | undefined {
  return installers?.find((installer) => installer.kind === kind);
}

function preferredInstaller(status: UpdateStatus): UpdateInstaller | undefined {
  const installers = status.installers;
  switch (platform()) {
    case "windows":
      return (
        findInstaller(installers, "windows-nsis") ??
        findInstaller(installers, "windows-msi")
      );
    case "linux":
      return (
        findInstaller(installers, "linux-appimage") ??
        findInstaller(installers, "linux-deb") ??
        findInstaller(installers, "linux-rpm")
      );
    default:
      return undefined;
  }
}

function browserDownload(installer: UpdateInstaller) {
  const link = document.createElement("a");
  link.href = installer.url;
  link.download = installer.name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function downloadInstaller(installer: UpdateInstaller): Promise<string> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  if (internals?.invoke) {
    const path = await internals.invoke("download_update", {
      url: installer.url,
      filename: installer.name,
      sha256: installer.sha256 ?? "",
    });
    if (typeof path === "string" && path.trim()) return path;
    throw new Error("O download nativo não retornou o caminho do instalador.");
  }
  browserDownload(installer);
  return "";
}

export default function UpdateToast() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const dismissed = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // A hidden tab has nothing to show; the visibility handler checks again.
      if (document.visibilityState !== "visible") return;
      try {
        const next = await api.updateStatus();
        if (!cancelled) setStatus(next);
      } catch {
        // Older servers do not expose the update endpoint yet.
      }
    }

    void check();
    const timer = window.setInterval(check, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);


  async function update() {
    if (!status || phase === "updating") return;
    const target = status.latestVersion;
    const mobileClient = isMobile();
    const installer = mobileClient ? undefined : preferredInstaller(status);

    setPhase("updating");
    setError("");
    try {
      if (mobileClient && status.apkUrl) {
        downloadApk(status.apkUrl, target);
      } else if (installer) {
        await downloadInstaller(installer);
      }
    } catch (err) {
      setPhase("error");
      setError(
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Não foi possível baixar o instalador.",
      );
      return;
    }

    const startedAt = Date.now();
    try {
      const start = await api.startUpdate();
      if (start.status === "current") {
        setStatus((current) => current ? {
          ...current,
          available: false,
          currentVersion: start.version,
          latestVersion: start.version,
        } : current);
        setPhase("idle");
        return;
      }
    } catch (err) {
      // 409 means another update request is already in flight. Keep polling
      // it instead of showing a dead-end error.
      if (!(err instanceof ApiError && err.status === 409)) {
        setPhase("error");
        setError(err instanceof Error ? err.message : "Não foi possível iniciar a atualização.");
        return;
      }
    }

    const deadline = startedAt + 180_000;
    while (Date.now() < deadline) {
      await wait(2_000);
      try {
        const update = await api.updateStatus();
        const elapsed = Date.now() - startedAt;
        if (!update.busy && update.error && elapsed > 5_000) {
          setPhase("error");
          setError(update.error);
          return;
        }
        const health = await api.health();
        if (health.version === target || update.currentVersion === target) {
          await clearClientCaches();
          window.location.reload();
          return;
        }
      } catch {
        // The server is restarting; keep polling.
      }
    }
    setPhase("error");
    setError("A atualização não terminou a tempo. Verifique o serviço e tente novamente.");
  }

  const visible = status?.supported && status.available && dismissed.current !== status.latestVersion;
  const updating = phase === "updating";
  const failed = phase === "error";
  // The Tophs toast stays for a moment, as every toast there does.
  useEffect(() => {
    if (!visible || !status || updating || failed) return;
    const timer = window.setTimeout(() => {
      dismissed.current = status.latestVersion;
      setStatus(null);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [visible, status, updating, failed]);
  if (!visible && !updating && !failed) return null;
  return (
    <div className="ac-toasts" aria-live="polite">
      <div
        className={`ac-toast ac-toast--${failed ? "error" : updating ? "info" : "success"} cursor-pointer`}
        role={failed ? "alert" : "status"}
        onClick={() => { if (!updating) void update(); }}
        aria-label={failed ? `Falha na atualização: ${error}` : "Clique para atualizar o Toph"}
      >
        <Icon name={failed ? "alert" : "download"} />
        <span className="ac-toast__text">
          <b className="ac-toast__title">
            {updating ? "Atualizando Toph" : failed ? "Falha na atualização" : `Toph v${status?.latestVersion ?? ""} disponível`}
          </b>
          {updating ? (
            <ProgressBar size="sm" isIndeterminate aria-label="Atualizando Toph" />
          ) : failed && error ? (
            <small className="ac-toast__detail">{error}</small>
          ) : null}
        </span>
        {!updating ? (
          <button
            type="button"
            className="ac-btn ac-btn--ghost ac-btn--sm ac-btn--icon ac-toast__close"
            aria-label="Fechar"
            onClick={(event) => {
              event.stopPropagation();
              if (status) dismissed.current = status.latestVersion;
              setPhase("idle");
              setStatus(null);
            }}
          >
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
