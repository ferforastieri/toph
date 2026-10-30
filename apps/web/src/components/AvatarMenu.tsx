import { useEffect, useState, type FormEvent } from "react";
import { LogOut } from "@toph/icons";
import { api, getApiBase, probeServer, setApiBase, type User } from "../api";
import { useApp } from "../store";
import { Avatar } from "@/boardui/base/avatar/avatar";
import { Button } from "@/boardui/base/buttons/button";
import { Input } from "@/boardui/base/input/input";
import { Modal } from "@/boardui/base/modal/modal";
import { cx } from "@/boardui/utils/cx";
import { PET_OPTIONS, petLevel, petLevelProgress, usePet } from "../pet";
import PetSprite from "../ui/PetSprite";

type Variant = "activity" | "titlebar";

interface Props {
  user: User | null;
  variant: Variant;
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

export default function AvatarMenu({ user, variant, active = false }: Props) {
  const setUser = useApp((state) => state.setUser);
  const notify = useApp((state) => state.notify);
  const pet = usePet();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [buildId, setBuildId] = useState("");
  const [serverDraft, setServerDraft] = useState(() => getApiBase() || window.location.origin);
  const [serverBusy, setServerBusy] = useState(false);
  const avatar = initials(user?.username);
  const server = getApiBase() || window.location.origin;
  const petName = PET_OPTIONS.find((option) => option.kind === pet.kind)?.name ?? "Pet";
  const level = petLevel(pet.commits);
  const freeMode = variant === "activity" && pet.enabled && pet.mode === "free";

  useEffect(() => {
    if (!open) return;
    setServerDraft(getApiBase() || window.location.origin);
    let cancelled = false;
    api.version()
      .then((info) => {
        if (cancelled) return;
        setAppVersion(info.version);
        setBuildId(info.buildId);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [open]);

  async function changeServer(event: FormEvent) {
    event.preventDefault();
    setServerBusy(true);
    try {
      const base = await probeServer(serverDraft);
      localStorage.setItem("toph_server_url", base);
      setApiBase(base);
      window.location.reload();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível conectar ao servidor.");
    } finally {
      setServerBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await api.logout();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível sair.");
    } finally {
      setBusy(false);
      setOpen(false);
      setUser(null);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={user ? `Abrir conta de ${user.username}` : "Abrir conta"}
        onClick={() => setOpen(true)}
        className={cx(
          "rounded-full outline-none ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          active && "ring-2 ring-accent-500",
          freeMode && "pet-free fixed end-3 bottom-3 z-50 rounded-2xl border border-border-button-default bg-background-primary-default p-1 shadow-lg",
        )}
      >
        {pet.enabled ? (
          <PetSprite kind={pet.kind} size={variant === "titlebar" ? 32 : freeMode ? 44 : 42} commits={pet.commits} className={freeMode ? "pet-roam" : undefined} />
        ) : (
          <Avatar size={variant === "titlebar" ? "md" : "lg"} initials={avatar} className="bg-accent-500/15 text-accent-500" />
        )}
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Conta"
        description="Sessão e servidor deste dispositivo."
        size="sm"
        footer={
          <>
            <Button variant="danger" leadingIcon={LogOut} disabled={busy} onClick={() => void logout()}>{busy ? "Saindo..." : "Sair"}</Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>Fechar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            {pet.enabled ? (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-background-secondary-default">
                <PetSprite kind={pet.kind} size={44} commits={pet.commits} />
              </span>
            ) : (
              <Avatar size="lg" initials={avatar} className="size-12 bg-accent-500/15 text-base text-accent-500" />
            )}
            <div>
              <p className="text-body-medium text-text-primary">{user?.username ?? "Conta"}</p>
              <p className="text-caption-1-regular text-text-secondary">{server}</p>
            </div>
          </div>
          <div className="flex flex-col divide-y divide-separator-border rounded-lg border border-border-button-default">
            <Fact label="Servidor" value={server} />
            {user?.id !== undefined && <Fact label="ID da conta" value={String(user.id)} />}
            <Fact label="Membro desde" value={formatDate(user?.createdAt)} />
            <Fact label="Versão do Toph" value={appVersion ? `v${appVersion}` : "—"} />
            {buildId && <Fact label="Build" value={buildId} />}
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border-button-default p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-body-2-medium text-text-primary">Pet</span>
              <span className="text-caption-1-regular text-text-secondary">
                {pet.enabled ? `${petName} · nível ${level}` : "desativado"}
              </span>
            </div>

            {pet.enabled && (
              <div className="flex items-center gap-3">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-background-secondary-default">
                  <PetSprite kind={pet.kind} size={50} commits={pet.commits} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body-2-medium text-text-primary">{petName}</p>
                  <p className="text-caption-1-regular text-text-secondary">{pet.commits} commits · cada commit alimenta</p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background-secondary-default">
                    <div className="h-full rounded-full bg-accent-500 transition-[width] duration-300" style={{ width: `${petLevelProgress(pet.commits)}%` }} />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-1.5">
              {PET_OPTIONS.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  title={option.description}
                  onClick={() => pet.choose(option.kind)}
                  className={cx(
                    "flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 transition-colors",
                    pet.enabled && pet.kind === option.kind
                      ? "border-accent-500 bg-accent-500/10 text-text-primary"
                      : "border-transparent text-text-secondary hover:bg-background-primary-hover hover:text-text-primary",
                  )}
                >
                  <PetSprite kind={option.kind} size={30} commits={pet.commits} animate={false} />
                  <span className="w-full truncate text-center text-[9px] font-medium">{option.name}</span>
                </button>
              ))}
            </div>

            {pet.enabled ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant={pet.mode === "corner" ? "secondary" : "ghost"} size="small" onClick={() => pet.setMode("corner")}>No canto</Button>
                <Button variant={pet.mode === "free" ? "secondary" : "ghost"} size="small" onClick={() => pet.setMode("free")}>Livre</Button>
                <Button variant="ghost" size="small" className="ms-auto" onClick={pet.disable}>Desabilitar</Button>
              </div>
            ) : (
              <p className="text-caption-1-regular leading-relaxed text-text-secondary">Escolha um pet acima para ativar. Ele cresce a cada 3 commits.</p>
            )}
          </div>
          <form className="flex flex-col gap-2 rounded-lg border border-border-button-default p-3" onSubmit={(event) => void changeServer(event)}>
            <p className="text-body-2-medium text-text-primary">Servidor</p>
            <Input value={serverDraft} onChange={setServerDraft} placeholder="https://seu-servidor" aria-label="URL do servidor" />
            <Button type="submit" size="small" className="self-end" disabled={serverBusy || !serverDraft.trim()}>
              {serverBusy ? "Verificando..." : "Aplicar e reconectar"}
            </Button>
          </form>
        </div>
      </Modal>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <span className="text-caption-1-regular text-text-secondary">{label}</span>
      <span className="truncate text-caption-1-medium text-text-primary">{value}</span>
    </div>
  );
}
