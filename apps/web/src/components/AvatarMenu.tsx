import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { LogOut, Settings2, UserRound } from "lucide-react";
import { api, getApiBase, type User } from "../api";
import { useApp } from "../store";
import { Button, Modal } from "@toph/ui";

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
  if (parts.length > 1) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
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
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatar = initials(user?.username);
  const server = getApiBase() || window.location.origin;

  function updatePosition() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (variant === "titlebar") {
      setPosition({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    } else {
      setPosition({
        bottom: Math.max(8, window.innerHeight - rect.bottom),
        left: rect.right + 8,
      });
    }
  }

  function toggle() {
    if (!open) updatePosition();
    setOpen((current) => !current);
  }

  useEffect(() => {
    if (!open) return;
    const reposition = () => updatePosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, variant]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => {
      menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }, 0);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function logout() {
    setBusy(true);
    try {
      await api.logout();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível sair.");
    } finally {
      setBusy(false);
      setOpen(false);
      setAccountOpen(false);
      setUser(null);
    }
  }

  function openSettings() {
    setOpen(false);
    onSettings();
  }

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        className={`avatar-button avatar-${variant} ${active ? "active" : ""} ${open ? "open" : ""}`}
        title={user ? `Conta de ${user.username}` : "Conta"}
        aria-label={user ? `Abrir menu da conta de ${user.username}` : "Abrir menu da conta"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="avatar-initials">{avatar}</span>
      </Button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className={`avatar-menu avatar-menu-${variant}`}
            style={position}
            role="menu"
            aria-label="Menu da conta"
          >
            <div className="avatar-menu-head">
              <span className="avatar-initials avatar-initials-lg">{avatar}</span>
              <span className="avatar-menu-identity">
                <strong>{user?.username ?? "Conta"}</strong>
                <small>{server}</small>
              </span>
            </div>
            <div className="avatar-menu-separator" />
            <button type="button" role="menuitem" onClick={openSettings}>
              <Settings2 size={15} />
              <span>Configurações</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setAccountOpen(true);
              }}
            >
              <UserRound size={15} />
              <span>Conta</span>
            </button>
            <div className="avatar-menu-separator" />
            <button
              type="button"
              role="menuitem"
              className="danger"
              disabled={busy}
              onClick={() => void logout()}
            >
              <LogOut size={15} />
              <span>{busy ? "Saindo..." : "Sair"}</span>
            </button>
          </div>,
          document.body,
        )}
      {accountOpen && (
        <Modal title="Conta" onClose={() => setAccountOpen(false)} width={430}>
          <div className="account-summary">
            <span className="avatar-initials avatar-initials-xl">{avatar}</span>
            <div>
              <strong>{user?.username ?? "Conta"}</strong>
              <small>Sessão neste servidor</small>
            </div>
          </div>
          <div className="account-facts">
            <div className="settings-kv"><span>Servidor</span><b>{server}</b></div>
            {user?.id !== undefined && (
              <div className="settings-kv"><span>ID da conta</span><b>{user.id}</b></div>
            )}
            <div className="settings-kv"><span>Membro desde</span><b>{formatDate(user?.createdAt)}</b></div>
          </div>
        </Modal>
      )}
    </>
  );
}
