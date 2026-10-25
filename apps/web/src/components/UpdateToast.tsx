import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { api, ApiError, type UpdateStatus } from "../api";
import { Button } from "@toph/ui";

type Phase = "idle" | "updating" | "error";

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

export default function UpdateToast() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
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

  async function update() {
    if (!status || phase === "updating") return;
    const target = status.latestVersion;
    setPhase("updating");
    setError("");
    try {
      await api.startUpdate();
    } catch (err) {
      // A dropped response can mean the service is already restarting. Only
      // stop immediately for an explicit API rejection.
      if (err instanceof ApiError && err.status < 500) {
        setPhase("error");
        setError(err.message);
        return;
      }
    }

    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await wait(2_000);
      try {
        const health = await api.health();
        if (health.version === target) {
          await clearClientCaches();
          window.location.reload();
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
    <div className={`update-toast ${failed ? "error" : ""}`} role="status">
      <div>
        <strong>
          {updating
            ? "Updating Toph..."
            : failed
              ? "Update failed"
              : `Toph v${status?.latestVersion ?? ""} is available`}
        </strong>
        <span>
          {updating
            ? "Updating the server and reloading this client."
            : failed
              ? error
              : "Update the server and reload the web clients."}
        </span>
      </div>
      <Button className="primary small" disabled={updating} onClick={() => void update()}>
        <RefreshCw size={13} /> {updating ? "Updating..." : failed ? "Retry" : "Update"}
      </Button>
      {!updating && (
        <Button
          className="icon-button"
          aria-label="Dismiss"
          onClick={() => {
            if (status) dismissed.current = status.latestVersion;
            setPhase("idle");
            setStatus(null);
          }}
        >
          <X size={14} />
        </Button>
      )}
    </div>
  );
}
