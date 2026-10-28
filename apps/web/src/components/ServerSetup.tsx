import { useState, type FormEvent } from "react";
import { ArrowRight, Server } from "@toph/icons";
import { probeServer } from "../api";
import BrandMark from "@toph/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      setError(err instanceof Error ? err.message : "Não foi possível conectar ao servidor.");
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
            <p className="text-sm text-muted-foreground">Conecte ao seu workbench self-hosted.</p>
          </div>
        </div>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-1.5 text-sm">
            URL do servidor
            <div className="relative">
              <Server size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://toph.example.com" className="ps-9" autoFocus />
            </div>
          </label>
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
          <Button type="submit" disabled={busy || !url.trim()}>
            {busy ? "Conectando..." : "Conectar"} <ArrowRight size={15} />
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          O endereço fica salvo neste dispositivo; as credenciais nunca são enviadas a terceiros.
        </p>
      </div>
    </main>
  );
}
