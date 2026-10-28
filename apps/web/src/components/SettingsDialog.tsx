import { useEffect, useState, type FormEvent } from "react";
import { Bot, Gem, GitBranch, HardDrive, Moon, Server, Sun } from "@toph/icons";
import { getApiBase, probeServer, setApiBase } from "../api";
import { useApp } from "../store";
import { useSettings, type Theme } from "../settings";
import AiSettings from "../panels/AiSettings";
import WorkspaceSettings from "../panels/WorkspaceSettings";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Category = "general" | "ai" | "workspace" | "git" | "server";

const categories: Array<{ id: Category; label: string; icon: typeof Bot }> = [
  { id: "general", label: "Geral", icon: Sun },
  { id: "ai", label: "AI", icon: Bot },
  { id: "workspace", label: "Workspace", icon: HardDrive },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "server", label: "Servidor", icon: Server },
];

const themes: Array<{ id: Theme; label: string; description: string; icon: typeof Sun }> = [
  { id: "light", label: "Claro", description: "Interface clara e neutra.", icon: Sun },
  { id: "dark", label: "Escuro", description: "Interface escura e neutra.", icon: Moon },
  { id: "nightwolf", label: "Night Wolf", description: "Preto, rosa e magenta.", icon: Gem },
];

export default function SettingsDialog({
  open,
  onClose,
  version,
  initialCategory = "general",
}: {
  open: boolean;
  onClose: () => void;
  version: string;
  initialCategory?: Category;
}) {
  const theme = useSettings((state) => state.theme);
  const setTheme = useSettings((state) => state.setTheme);
  const settings = useSettings();
  const update = useSettings((state) => state.update);
  const notify = useApp((state) => state.notify);
  const [category, setCategory] = useState<Category>("general");
  const [serverDraft, setServerDraft] = useState(() => getApiBase() || window.location.origin);
  const [serverBusy, setServerBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory(initialCategory);
    setServerDraft(getApiBase() || window.location.origin);
    const handleCategory = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (categories.some((item) => item.id === next)) setCategory(next as Category);
    };
    window.addEventListener("toph:settings-category", handleCategory);
    return () => window.removeEventListener("toph:settings-category", handleCategory);
  }, [initialCategory, open]);

  async function changeServer(event: FormEvent) {
    event.preventDefault();
    setServerBusy(true);
    try {
      const base = await probeServer(serverDraft);
      localStorage.setItem("toph_server_url", base);
      setApiBase(base);
      window.location.reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not reach this server.");
    } finally {
      setServerBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="h-[min(720px,calc(100dvh-2rem))] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[920px]">
        <DialogHeader className="sr-only">
          <DialogTitle>Configurações</DialogTitle>
          <DialogDescription>Configurações do Toph</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 grid-cols-[56px_1fr] sm:grid-cols-[220px_1fr]">
          <aside className="flex min-h-0 flex-col gap-1 overflow-y-auto border-e bg-muted/40 p-2">
            <div className="mb-2 hidden px-2 py-1 sm:block">
              <p className="text-sm font-semibold">Configurações</p>
              <Badge variant="secondary" className="mt-1 text-[10px]">v{version}</Badge>
            </div>
            {categories.map((item) => {
              const Icon = item.icon;
              const active = category === item.id;
              return (
                <Button
                  key={item.id}
                  variant={active ? "secondary" : "ghost"}
                  className={cn("justify-start gap-2 px-2", active && "font-medium")}
                  onClick={() => setCategory(item.id)}
                >
                  <Icon size={16} />
                  <span className="hidden sm:inline">{item.label}</span>
                </Button>
              );
            })}
          </aside>

          <div className="flex min-h-0 flex-col">
            <header className="flex items-center justify-between gap-4 border-b px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">{categories.find((item) => item.id === category)?.label}</h2>
                <p className="text-xs text-muted-foreground">Preferências deste workspace.</p>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {category === "general" && (
                <div className="flex flex-col gap-6">
                  <section className="flex flex-col gap-3">
                    <div>
                      <h3 className="text-sm font-medium">Tema</h3>
                      <p className="text-xs text-muted-foreground">Apenas três temas são suportados.</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {themes.map((item) => {
                        const Icon = item.icon;
                        const active = theme === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setTheme(item.id)}
                            className={cn(
                              "flex flex-col items-start gap-1 rounded-xl border p-3 text-start transition-colors",
                              active
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                            )}
                          >
                            <Icon size={18} className={active ? "text-primary" : ""} />
                            <span className="text-sm font-medium">{item.label}</span>
                            <span className="text-xs text-muted-foreground">{item.description}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  <section className="rounded-xl border bg-card p-4">
                    <h3 className="text-sm font-medium">Sessão</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      O Toph está conectado em {getApiBase() || window.location.origin}.
                    </p>
                  </section>
                </div>
              )}

              {category === "ai" && <AiSettings />}
              {category === "workspace" && <WorkspaceSettings />}

              {category === "git" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                    <label className="flex flex-col gap-1.5 text-sm">
                      Padrão de branch
                      <Input value={settings.gitBranchPattern} onChange={(event) => update({ gitBranchPattern: event.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                      Padrão de commit
                      <Input value={settings.gitCommitPattern} onChange={(event) => update({ gitCommitPattern: event.target.value })} />
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tokens: {"{date}"}, {"{time}"}, {"{datetime}"}, {"{repo}"}, {"{branch}"}, {"{user}"}, {"{task}"}, {"{slug}"} e {"{summary}"}.
                  </p>
                </div>
              )}

              {category === "server" && (
                <form className="flex flex-col gap-4" onSubmit={(event) => void changeServer(event)}>
                  <div className="rounded-xl border bg-card p-4">
                    <label className="flex flex-col gap-1.5 text-sm">
                      URL do servidor
                      <Input value={serverDraft} onChange={(event) => setServerDraft(event.target.value)} placeholder="https://seu-servidor" />
                    </label>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={serverBusy || !serverDraft.trim()}>
                      {serverBusy ? "Verificando..." : "Aplicar e reconectar"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">A URL fica salva somente neste navegador.</p>
                </form>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
