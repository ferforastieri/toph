import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useApp } from "../store";
import BrandMark from "@toph/brand";
import { Button } from "@/boardui/base/buttons/button";
import { Input } from "@/boardui/base/input/input";
import { Chip } from "@/boardui/base/badges/chip";

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
      const message = err instanceof ApiError
        ? err.status === 401 ? "Usuário ou senha inválidos." : err.status === 429 ? "Muitas tentativas. Aguarde um minuto." : err.message
        : "Não foi possível conectar ao servidor Toph.";
      setError(message);
      notify("error", message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <section className="bg-background-primary-default flex w-full max-w-sm flex-col gap-6 rounded-3xl p-7 shadow-xs">
        <header className="flex flex-col items-center gap-2 text-center">
          <BrandMark size="large" />
          <h1 className="text-title-2-medium text-text-primary">Toph</h1>
          <p className="text-body-regular text-text-secondary">Código, dados e IA em um só lugar.</p>
        </header>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Input label="Usuário" value={username} onChange={setUsername} autoComplete="username" />
          <Input label="Senha" type="password" value={password} onChange={setPassword} autoComplete="current-password" autoFocus />
          {error && <Chip color="rose" variant="subtle" className="justify-start whitespace-normal px-2 py-1.5">{error}</Chip>}
          <Button type="submit" disabled={busy || !password} className="w-full">
            {busy ? "Entrando..." : "Entrar"}
          </Button>
        </form>
        <footer className="flex flex-col gap-2 text-center">
          <p className="text-caption-1-regular text-text-tertiary">O Toph é self-hosted. Em uma instalação nova, a senha inicial foi impressa no log do servidor.</p>
          {onChangeServer && <Button type="button" size="small" className="w-full" onClick={onChangeServer}>Alterar servidor</Button>}
        </footer>
      </section>
    </main>
  );
}
