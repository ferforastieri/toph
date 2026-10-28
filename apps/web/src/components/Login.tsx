import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useApp } from "../store";
import BrandMark from "@toph/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";

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
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <BrandMark size="large" />
          <CardTitle><h1 className="text-xl font-semibold">Toph</h1></CardTitle>
          <CardDescription>Código, dados e IA em um só lugar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <Field><FieldLabel htmlFor="login-username">Usuário</FieldLabel><Input id="login-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></Field>
            <Field><FieldLabel htmlFor="login-password">Senha</FieldLabel><Input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" autoFocus /></Field>
            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={busy || !password}>{busy ? "Entrando..." : "Entrar"}</Button>
          </form>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-2">
          <p className="text-center text-xs text-muted-foreground">O Toph é self-hosted. Em uma instalação nova, a senha inicial foi impressa no log do servidor.</p>
          {onChangeServer && <Button type="button" variant="ghost" size="sm" onClick={onChangeServer}>Alterar servidor</Button>}
        </CardFooter>
      </Card>
    </main>
  );
}
