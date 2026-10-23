import { FormEvent, useState } from "react";
import { ArrowRight, Server } from "lucide-react";
import { probeServer } from "../api";

interface Props {
  defaultUrl: string;
  onConnected: (url: string) => void;
}

export default function ServerSetup({ defaultUrl, onConnected }: Props) {
  const [url, setUrl] = useState(defaultUrl);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onConnected(await probeServer(url));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach this server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-panel">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div>
            <h1>Toph</h1>
            <p>Connect to your self-hosted workbench.</p>
          </div>
        </div>
        <form onSubmit={submit} className="login-form">
          <label>
            Server URL
            <div className="input-with-icon">
              <Server size={15} />
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://toph.example.com"
                autoFocus
              />
            </div>
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary" disabled={busy || !url.trim()}>
            {busy ? "Connecting..." : "Connect"} <ArrowRight size={15} />
          </button>
        </form>
        <p className="login-note">
          Toph runs on your server. The address is saved on this device; credentials are
          never sent to a third party.
        </p>
      </div>
    </main>
  );
}
