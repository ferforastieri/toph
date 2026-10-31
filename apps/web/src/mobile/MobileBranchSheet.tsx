import { useEffect, useMemo, useState } from "react";
import { GitBranch, Plus } from "@toph/icons";
import { api } from "../api";
import { useApp } from "../store";
import { useConfirm } from "../ui/confirm";
import BranchPicker from "../components/BranchPicker";
import { Button } from "@/boardui/base/buttons/button";
import { Input } from "@/boardui/base/input/input";
import { Modal } from "@/boardui/base/modal/modal";

interface Props {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onChanged: () => void;
}

export default function MobileBranchSheet({ open, projectId, onClose, onChanged }: Props) {
  const notify = useApp((state) => state.notify);
  const confirm = useConfirm();
  const [current, setCurrent] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const visible = useMemo(() => {
    const sorted = [...branches].sort((a, b) => {
      if (a === current) return -1;
      if (b === current) return 1;
      return a.localeCompare(b);
    });
    return sorted.filter((branch) => branch.toLowerCase().includes(filter.trim().toLowerCase()));
  }, [branches, current, filter]);

  async function load() {
    setLoading(true);
    try {
      const info = await api.gitBranches(projectId);
      setCurrent(info.current);
      setBranches(info.branches);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível listar as branches.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setName("");
    setFilter("");
    setCreateOpen(false);
    void load();
  }, [open, projectId]);

  async function checkout(branch: string) {
    if (busy || branch === current) return;
    setBusy(branch);
    try {
      await api.gitCheckout(projectId, branch);
      setCurrent(branch);
      window.dispatchEvent(new Event("toph:git-changed"));
      onChanged();
      onClose();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível trocar de branch.");
    } finally {
      setBusy("");
    }
  }

  async function deleteOthers() {
    if (busy) return;
    const others = branches.filter((branch) => branch !== current);
    if (others.length === 0) {
      notify("info", "Só existe a branch atual. Nada para excluir.");
      return;
    }
    const ok = await confirm({
      title: "Excluir outras branches?",
      message: `Excluir ${others.length} branch${others.length === 1 ? "" : "es"} e manter somente ${current}? Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir branches",
      danger: true,
    });
    if (!ok) return;
    setBusy("delete");
    try {
      const deleted = await api.gitDeleteOtherBranches(projectId);
      await load();
      window.dispatchEvent(new Event("toph:git-changed"));
      onChanged();
      notify("success", `${deleted} branch${deleted === 1 ? "" : "es"} excluída${deleted === 1 ? "" : "s"}.`);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível excluir as branches.");
    } finally {
      setBusy("");
    }
  }

  async function create() {
    const value = name.trim();
    if (!value || busy) return;
    setBusy("create");
    try {
      const created = await api.gitCreateBranch(projectId, value);
      setName("");
      setCreateOpen(false);
      await load();
      window.dispatchEvent(new Event("toph:git-changed"));
      onChanged();
      setBusy("");
      await checkout(created);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível criar a branch.");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <Modal isOpen={open} onClose={onClose} label="Branch" placement="bottom" size="sm" bodyClassName="p-0" swipeToClose>
        <BranchPicker
          current={current}
          branches={visible}
          filter={filter}
          onFilterChange={setFilter}
          onCheckout={(branch) => void checkout(branch)}
          onCreate={() => { setName(""); setCreateOpen(true); }}
          onDeleteOthers={() => void deleteOthers()}
          onRetry={() => void load()}
          error={error}
          loading={loading}
          busy={busy}
          count={branches.length}
          deleteDisabled={branches.length <= 1}
          listClassName="max-h-[min(46dvh,360px)]"
        />
      </Modal>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nova branch"
        description="Crie uma branch a partir da branch atual."
        placement="bottom"
        size="sm"
        bodyClassName="p-3"
        swipeToClose
      >
        <div className="flex flex-col gap-3">
          <Input value={name} onChange={setName} placeholder="nome-da-branch" aria-label="Nome da nova branch" fieldClassName="h-10" />
          <Button className="h-11 w-full justify-center" leadingIcon={Plus} disabled={!name.trim() || Boolean(busy)} onClick={() => void create()}>
            {busy === "create" ? "Criando..." : "Criar branch"}
          </Button>
          <Button variant="ghost" className="w-full justify-center" leadingIcon={GitBranch} onClick={() => setCreateOpen(false)}>
            Cancelar
          </Button>
        </div>
      </Modal>
    </>
  );
}
