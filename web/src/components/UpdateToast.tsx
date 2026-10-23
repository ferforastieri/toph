import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { api } from "../api";
import { Button } from "../ui/Button";

export default function UpdateToast() {
  const [available, setAvailable] = useState(false);
  const baseline = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const info = await api.version();
        if (cancelled) return;
        if (baseline.current === null) {
          baseline.current = info.buildId;
          return;
        }
        if (info.buildId !== baseline.current) {
          setAvailable(true);
        }
      } catch {
        // Old server or offline; try again on the next interval.
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
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.update()));
    }
    window.location.reload();
  }

  if (!available) return null;

  return (
    <div className="update-toast" role="status">
      <div>
        <strong>New Toph build available</strong>
        <span>The server was updated. Reload to get the new version.</span>
      </div>
      <Button className="primary small" onClick={() => void update()}>
        <RefreshCw size={13} /> Update
      </Button>
      <Button className="icon-button" aria-label="Dismiss" onClick={() => setAvailable(false)}>
        <X size={14} />
      </Button>
    </div>
  );
}
