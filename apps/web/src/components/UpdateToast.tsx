import { useEffect, useRef, useState } from "react";
import { api, ApiError, type UpdateInstaller, type UpdateStatus } from "../api";
import { Notification, NotificationViewport } from "@/boardui/base/notification/notification";

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
  const link = document.createElement("a");
  link.href = url;
  link.download = `toph-v${version}.apk`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function isMobile(): boolean {
  return document.documentElement.classList.contains("mobile-client");
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
      return findInstaller(installers, "windows-msi");
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
  const [downloadedPath, setDownloadedPath] = useState("");
  const dismissed = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const next = await api.updateStatus();
        if (!cancelled) setStatus(next);
      } catch {
        // Older servers do not expose the update endpoint yet.
      }
    }

    void check();
    const timer = window.setInterval(check, 30_000);
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

  const mobile = isMobile();
  const desktopInstaller = status && !mobile ? preferredInstaller(status) : undefined;
  const desktopLabel =
    desktopInstaller?.kind === "windows-msi"
      ? "MSI"
      : desktopInstaller?.kind === "linux-appimage"
        ? "AppImage"
        : desktopInstaller?.kind === "linux-deb"
          ? "DEB"
          : desktopInstaller?.kind === "linux-rpm"
            ? "RPM"
            : "";

  async function update() {
    if (!status || phase === "updating") return;
    const target = status.latestVersion;
    const mobileClient = isMobile();
    const installer = mobileClient ? undefined : preferredInstaller(status);

    setPhase("updating");
    setError("");
    setDownloadedPath("");
    try {
      if (mobileClient && status.apkUrl) {
        downloadApk(status.apkUrl, target);
      } else if (installer) {
        const path = await downloadInstaller(installer);
        setDownloadedPath(path);
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

    try {
      await api.startUpdate();
    } catch (err) {
      // A dropped response can mean the service is already restarting. Only
      // stop immediately for an explicit API rejection.
      if (err instanceof ApiError) {
        setPhase("error");
        setError(err.message);
        return;
      }
    }

    const startedAt = Date.now();
    const deadline = startedAt + 180_000;
    while (Date.now() < deadline) {
      await wait(2_000);
      try {
        const health = await api.health();
        if (health.version === target) {
          await clearClientCaches();
          window.location.reload();
          return;
        }
        const update = await api.updateStatus();
        if (Date.now() - startedAt > 10_000 && update.error && !update.busy) {
          setPhase("error");
          setError(update.error);
          return;
        }
      } catch {
        // The server is restarting; keep polling.
      }
    }
    setPhase("error");
    setError("The server did not finish updating. Check the service health and try again.");
  }

  const visible = status?.supported && status.available && dismissed.current !== status.latestVersion;
  if (!visible && phase !== "updating" && phase !== "error") return null;
  const updating = phase === "updating";
  const failed = phase === "error";
  return (
    <NotificationViewport position="bottom-end">
      <Notification
        title={updating ? "Atualizando o Toph..." : failed ? "Falha na atualização" : `Toph v${status?.latestVersion ?? ""} disponível`}
        description={
          <>
            {updating ? (mobile ? "Atualizando o servidor e baixando o novo APK." : desktopInstaller ? `Baixando ${desktopInstaller.name} e atualizando o servidor.` : "Atualizando o servidor e recarregando os clientes web.") : failed ? error : mobile ? "Atualize o servidor e baixe o APK mais recente." : desktopInstaller ? `Atualize o servidor e baixe o instalador desktop${desktopLabel ? ` (${desktopLabel})` : ""}.` : "Atualize o servidor e recarregue os clientes web."}
            {downloadedPath && !failed ? <span className="mt-1 block text-caption-1-regular text-text-tertiary">Instalador salvo em {downloadedPath}</span> : null}
          </>
        }
        status={failed ? "error" : "information"}
        dismissible={!updating}
        onDismiss={() => { if (status) dismissed.current = status.latestVersion; setPhase("idle"); setStatus(null); }}
        actions={!updating ? [{ label: failed ? "Tentar novamente" : "Atualizar", onClick: () => void update() }] : undefined}
        className="w-full"
      />
    </NotificationViewport>
  );
}
