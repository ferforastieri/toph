import { FormEvent, useState } from "react";
import { api, ApiError } from "../api";
import { useApp } from "../store";
import BrandMark from "../brand/BrandMark";
import { Button } from "../ui/Button";

interface Props {
  onChangeServer?: () => void;
}

export default function Login({ onChangeServer }: Props) {
  const setUser = useApp((state) => state.setUser);
  const notify = useApp((state) => state.notify);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.login(username, password);
      setUser(result.user);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.status === 401
            ? "Invalid username or password."
            : err.status === 429
              ? "Too many attempts. Wait a minute and try again."
              : err.message
          : "Could not reach the Toph server.";
      setError(message);
      notify("error", message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-panel">
        <div className="brand">
          <BrandMark />
          <div>
            <h1>Toph</h1>
            <p>Code, data and AI in one workbench.</p>
          </div>
        </div>
        <form onSubmit={submit} className="login-form">
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <Button className="primary" disabled={busy || !password}>
            {busy ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        <p className="login-note">
          Toph is self-hosted. If this is a fresh install, the initial password was printed
          in the server log.
        </p>
        {onChangeServer && (
          <Button type="button" className="ghost small" onClick={onChangeServer}>
            Change server
          </Button>
        )}
      </div>
    </main>
  );
}
