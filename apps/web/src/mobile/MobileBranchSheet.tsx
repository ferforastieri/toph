import { useEffect, useState } from "react";
import { GitBranch, Plus } from "@toph/icons";
import { api } from "../api";
import { useApp } from "../store";
import { Button } from "@/boardui/base/buttons/button";
import { Input } from "@/boardui/base/input/input";
import { Modal } from "@/boardui/base/modal/modal";
import { Badge } from "@/boardui/base/badges/badge";

interface Props {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onChanged: () => void;
}

export default function MobileBranchSheet({ open, projectId, onClose, onChanged }: Props) {
  const notify = useApp((state) => state.notify);
  const [current, setCurrent] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const info = await api.gitBranches(projectId);
      setCurrent(info.current);
      setBranches(info.branches);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível listar as branches.");
    }
  }

  useEffect(() => {
    if (!open) return;
    setName("");
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

  async function create() {
    const value = name.trim();
    if (!value || busy) return;
    setBusy("create");
    try {
      const created = await api.gitCreateBranch(projectId, value);
      setName("");
      await load();
      window.dispatchEvent(new Event("toph:git-changed"));
      onChanged();
      setBusy("");
      await checkout(created);
      return;
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível criar a branch.");
    } finally {
      setBusy("");
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Branch" description="Troque ou crie uma branch do projeto." placement="bottom" size="sm" bodyClassName="p-3">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-2xl border border-border-button-default bg-background-secondary-default p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-500">
            <GitBranch className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-caption-2-regular text-text-tertiary">Branch atual</span>
            <span className="truncate text-body-2-medium text-text-primary">{current || "detached"}</span>
          </span>
          <Badge color="neutral">{branches.length}</Badge>
        </div>

        <div className="flex max-h-[min(46dvh,360px)] flex-col gap-1 overflow-y-auto">
          {error && <p className="rounded-xl bg-status-rose-background p-3 text-caption-1-regular text-status-rose-text">{error}</p>}
          {branches.map((branch) => (
            <Button
              key={branch}
              variant={branch === current ? "secondary" : "ghost"}
              className="h-auto w-full justify-start gap-2 py-2.5"
              disabled={Boolean(busy)}
              onClick={() => void checkout(branch)}
            >
              <GitBranch className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-start text-body-2-medium">{branch}</span>
              {branch === current ? <Badge color="primary">atual</Badge> : null}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-separator-border pt-3">
          <Input value={name} onChange={setName} placeholder="nova-branch" aria-label="Nome da nova branch" fieldClassName="h-9" />
          <Button className="w-full justify-center" leadingIcon={Plus} disabled={!name.trim() || Boolean(busy)} onClick={() => void create()}>
            {busy === "create" ? "Criando..." : "Criar branch"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
