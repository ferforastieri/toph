import { useEffect, useState } from "react";
import { api, ApiError, setApiBase } from "./api";
import { useApp } from "./store";
import Login from "./components/Login";
import ServerSetup from "./components/ServerSetup";
import UpdateToast from "./components/UpdateToast";
import Workbench from "./components/Workbench";
import PetPicker from "./components/PetPicker";
import MobileBoot from "./mobile/MobileBoot";
import { isMobileViewport } from "./ui/useIsMobile";
import { usePet } from "./pet";
import BrandMark from "@toph/brand";

const SERVER_KEY = "toph_server_url";

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
  const hydratePet = usePet((state) => state.hydrate);
  const [serverUrl, setServerUrl] = useState<string | null>(initialServerUrl);

  useEffect(() => {
    hydratePet(user?.username ?? "");
  }, [hydratePet, user?.username]);

  useEffect(() => {
    if (!serverUrl) {
      setAuthReady(true);
      return;
    }
    setApiBase(serverUrl);
    setAuthReady(false);
    let cancelled = false;
    api
      .me()
      .then((current) => {
        if (!cancelled) setUser(current);
      })
      .catch((error: unknown) => {
        if (!(error instanceof ApiError) || error.status !== 401) {
          console.error(error);
        }
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });
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
    return <Login onChangeServer={changeServer} />;
  }

  return (
    <>
      <Workbench />
      <UpdateToast />
      <PetPicker />
    </>
  );
}

export default function App() {
  return <AppShell />;
}
