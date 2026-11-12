import { useEffect, useState } from "react";
import { LogOut } from "@toph/icons";
import { api, getApiBase, type User } from "../../../shared/api";
import { useApp } from "../../store";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Modal } from "@/shared/boardui/base/modal/modal";

interface Props {
  open: boolean;
  user: User | null;
  onClose: () => void;
}

export default function MobileAccountSheet({ open, user, onClose }: Props) {
  const setUser = useApp((state) => state.setUser);
  const notify = useApp((state) => state.notify);
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const server = getApiBase() || window.location.origin;

  useEffect(() => {
    if (!open) return;
    api.version().then((info) => setVersion(info.version)).catch(() => undefined);
  }, [open]);

  async function logout() {
    setBusy(true);
    try {
      await api.logout();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Não foi possível sair.");
    } finally {
      setBusy(false);
      onClose();
      setUser(null);
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Conta" description="Sessão deste dispositivo." placement="bottom" size="sm" swipeToClose>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default p-3">
          <img src={`${import.meta.env.BASE_URL}tophs/toph-logo.png`} alt="" width={48} height={48} className="size-12 select-none object-contain" draggable={false} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-medium text-text-primary">{user?.username ?? "Conta"}</p>
            <p className="truncate text-caption-1-regular text-text-secondary">{server}</p>
          </div>
        </div>
        <div className="flex flex-col divide-y divide-separator-border rounded-2xl border border-border-button-default">
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="text-caption-1-regular text-text-secondary">Servidor</span>
            <span className="truncate text-caption-1-medium text-text-primary">{server}</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="text-caption-1-regular text-text-secondary">Versão</span>
            <span className="text-caption-1-medium text-text-primary">{version ? `v${version}` : "—"}</span>
          </div>
        </div>
        <Button variant="danger" leadingIcon={LogOut} className="w-full justify-center" disabled={busy} onClick={() => void logout()}>
          {busy ? "Saindo..." : "Sair da conta"}
        </Button>
        <Button variant="secondary" className="w-full justify-center" onClick={onClose}>Fechar</Button>
      </div>
    </Modal>
  );
}
