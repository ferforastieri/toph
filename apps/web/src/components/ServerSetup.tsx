import { useState, type FormEvent } from "react";
import { ArrowRight, Server } from "@toph/icons";
import { probeServer } from "../api";
import BrandMark from "@toph/brand";
import { Button } from "@/boardui/base/buttons/button";
import { Input } from "@/boardui/base/input/input";
import { Chip } from "@/boardui/base/badges/chip";

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
    try { onConnected(await probeServer(url)); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível conectar ao servidor."); }
    finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <section className="bg-background-primary-default flex w-full max-w-sm flex-col gap-6 rounded-3xl p-7 shadow-xs">
        <header className="flex flex-col items-center gap-2 text-center">
          <BrandMark size="large" />
          <h1 className="text-title-2-medium text-text-primary">Toph</h1>
          <p className="text-body-regular text-text-secondary">Conecte ao seu workbench self-hosted.</p>
        </header>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Input label="URL do servidor" value={url} onChange={setUrl} placeholder="https://toph.example.com" leadingIcon={Server} autoFocus />
          {error && <Chip color="rose" variant="subtle" className="justify-start whitespace-normal px-2 py-1.5">{error}</Chip>}
          <Button type="submit" disabled={busy || !url.trim()} trailingIcon={ArrowRight} className="w-full">
            {busy ? "Conectando..." : "Conectar"}
          </Button>
        </form>
        <p className="text-center text-caption-1-regular text-text-tertiary">O endereço fica salvo neste dispositivo; as credenciais nunca são enviadas a terceiros.</p>
      </section>
    </main>
  );
}
