import { useState, type FormEvent } from "react";
import { ArrowRight, Server } from "@toph/icons";
import { probeServer } from "../api";
import BrandMark from "@toph/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";

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
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <BrandMark size="large" />
          <CardTitle><h1 className="text-xl font-semibold">Toph</h1></CardTitle>
          <CardDescription>Conecte ao seu workbench self-hosted.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <Field><FieldLabel>URL do servidor</FieldLabel><div className="relative"><Server size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://toph.example.com" className="ps-9" autoFocus /></div></Field>
            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={busy || !url.trim()}>{busy ? "Conectando..." : "Conectar"} <ArrowRight size={15} /></Button>
          </form>
        </CardContent>
        <CardFooter><p className="text-center text-xs text-muted-foreground">O endereço fica salvo neste dispositivo; as credenciais nunca são enviadas a terceiros.</p></CardFooter>
      </Card>
    </main>
  );
}
