import { useEffect, useState } from "react";
import { LogOut, Settings2, UserRound } from "@toph/icons";
import { api, getApiBase, type User } from "../api";
import { useApp } from "../store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Variant = "activity" | "titlebar";

interface Props {
  user: User | null;
  variant: Variant;
  onSettings: () => void;
  active?: boolean;
}

function initials(username?: string): string {
  const value = username?.trim();
  if (!value) return "?";
  const parts = value.split(/[\s._-]+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return value.slice(0, 2).toUpperCase();
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}

export default function AvatarMenu({ user, variant, onSettings, active = false }: Props) {
  const setUser = useApp((state) => state.setUser);
  const notify = useApp((state) => state.notify);
  const [accountOpen, setAccountOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [buildId, setBuildId] = useState("");
  const avatar = initials(user?.username);
  const server = getApiBase() || window.location.origin;

  useEffect(() => {
    if (!accountOpen) return;
    let cancelled = false;
    api.version()
      .then((info) => {
        if (cancelled) return;
        setAppVersion(info.version);
        setBuildId(info.buildId);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [accountOpen]);

  async function logout() {
    setBusy(true);
    try {
      await api.logout();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível sair.");
    } finally {
      setBusy(false);
      setAccountOpen(false);
      setUser(null);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={user ? `Abrir menu da conta de ${user.username}` : "Abrir menu da conta"}
            className={`rounded-full outline-none ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring ${active ? "ring-2 ring-primary" : ""}`}
          >
            <Avatar className={variant === "titlebar" ? "size-8" : "size-9"}>
              <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{avatar}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={variant === "activity" ? "start" : "end"} side={variant === "activity" ? "right" : "bottom"} className="w-72">
          <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
            <Avatar className="size-9"><AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{avatar}</AvatarFallback></Avatar>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{user?.username ?? "Conta"}</span>
              <span className="block truncate text-xs text-muted-foreground">{server}</span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onSettings} className="gap-2">
            <Settings2 size={15} /> Configurações
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAccountOpen(true)} className="gap-2">
            <UserRound size={15} /> Conta
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={busy} onSelect={() => void logout()} className="gap-2">
            <LogOut size={15} /> {busy ? "Saindo..." : "Sair"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conta</DialogTitle>
            <DialogDescription>Sessão neste servidor.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <Avatar className="size-12"><AvatarFallback className="bg-primary/15 text-base font-semibold text-primary">{avatar}</AvatarFallback></Avatar>
              <div>
                <p className="font-medium">{user?.username ?? "Conta"}</p>
                <p className="text-xs text-muted-foreground">{server}</p>
              </div>
            </div>
            <div className="flex flex-col divide-y rounded-xl border">
              <Fact label="Servidor" value={server} />
              {user?.id !== undefined && <Fact label="ID da conta" value={String(user.id)} />}
              <Fact label="Membro desde" value={formatDate(user?.createdAt)} />
              <Fact label="Versão do Toph" value={appVersion ? `v${appVersion}` : "—"} />
              {buildId && <Fact label="Build" value={buildId} />}
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setAccountOpen(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-xs font-medium">{value}</span>
    </div>
  );
}
