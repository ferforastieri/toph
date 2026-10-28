import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useApp } from "../store";
import BrandMark from "@toph/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
            ? "Usuário ou senha inválidos."
            : err.status === 429
              ? "Muitas tentativas. Aguarde um minuto."
              : err.message
          : "Não foi possível conectar ao servidor Toph.";
      setError(message);
      notify("error", message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <BrandMark size="large" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Toph</h1>
            <p className="text-sm text-muted-foreground">Código, dados e IA em um só lugar.</p>
          </div>
        </div>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-1.5 text-sm">
            Usuário
            <Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            Senha
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" autoFocus />
          </label>
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
          <Button type="submit" disabled={busy || !password}>{busy ? "Entrando..." : "Entrar"}</Button>
        </form>
        <p className="text-xs text-muted-foreground">
          O Toph é self-hosted. Em uma instalação nova, a senha inicial foi impressa no log do servidor.
        </p>
        {onChangeServer && (
          <Button type="button" variant="ghost" size="sm" onClick={onChangeServer}>Alterar servidor</Button>
        )}
      </div>
    </main>
  );
}
