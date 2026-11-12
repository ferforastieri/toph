import { lazy, Suspense, useEffect, useState } from "react";
import { api, ApiError, setApiBase } from "../shared/api";
import { isDesktopClient } from "../features/settings/store";
import { useApp } from "./store";
import Login from "../features/auth/components/Login";
import ServerSetup from "../features/auth/components/ServerSetup";
import UpdateToast from "../features/updates/components/UpdateToast";
const Workbench = lazy(() => import("./components/Workbench"));
import MobileBoot from "./layouts/mobile/MobileBoot";
import { isMobileViewport } from "../shared/ui/useIsMobile";
import BrandMark from "@toph/brand";

const SERVER_KEY = "toph_server_url";

interface DesktopInternals {
  invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
}

/** Returns to the desktop launcher, where local mode and server URLs live. */
async function openLauncher(): Promise<void> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: DesktopInternals })
    .__TAURI_INTERNALS__;
  if (!internals?.invoke) return;
  try {
    await internals.invoke("show_launcher");
  } catch (error) {
    console.error(error);
  }
}

function initialServerUrl(): string | null {
  const queryServer = new URLSearchParams(window.location.search).get("server");
  if (queryServer) {
    localStorage.setItem(SERVER_KEY, queryServer);
    return queryServer;
  }
  return localStorage.getItem(SERVER_KEY);
}

function AppShell() {
  const user = useApp((state) => state.user);
  const authReady = useApp((state) => state.authReady);
  const setUser = useApp((state) => state.setUser);
  const setAuthReady = useApp((state) => state.setAuthReady);
  const [serverUrl, setServerUrl] = useState<string | null>(initialServerUrl);

  useEffect(() => {
    if (!serverUrl) {
      setAuthReady(true);
      return;
    }
    setApiBase(serverUrl);
    setAuthReady(false);
    let cancelled = false;

    void (async () => {
      // QR pairing: the desktop hands the phone a one-time code. Consuming it
      // sets the normal HttpOnly session cookie, then the URL is cleaned up so
      // the code never survives in history or a copied address.
      const params = new URLSearchParams(window.location.search);
      const pairingCode = params.get("pair");
      if (pairingCode) {
        try {
          await api.pair(pairingCode);
        } catch (error) {
          console.error(error);
        }
        params.delete("pair");
        const query = params.toString();
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
        );
      }

      try {
        const current = await api.me();
        if (!cancelled) setUser(current);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          console.error(error);
        }
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [serverUrl, setAuthReady, setUser]);

  function connected(url: string) {
    localStorage.setItem(SERVER_KEY, url);
    setServerUrl(url);
  }

  function changeServer() {
    localStorage.removeItem(SERVER_KEY);
    setApiBase("");
    setUser(null);
    setAuthReady(false);
    setServerUrl(null);
  }

  if (!authReady) {
    if (isMobileViewport()) return <MobileBoot />;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background">
        <BrandMark size="large" />
        <p className="text-sm text-muted-foreground">Conectando ao Toph...</p>
      </div>
    );
  }

  if (!serverUrl) {
    return <ServerSetup defaultUrl={`${window.location.protocol}//${window.location.host}`} onConnected={connected} />;
  }

  if (!user) {
    return (
      <Login
        onChangeServer={changeServer}
        onOpenLauncher={isDesktopClient() ? () => void openLauncher() : undefined}
      />
    );
  }

  return (
    <>
      <Suspense fallback={<MobileBoot />}><Workbench /></Suspense>
      <UpdateToast />
    </>
  );
}

export default function App() {
  return <AppShell />;
}
