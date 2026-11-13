import { useState } from "react";
import { CircleAlert, GitBranch, Plus, Trash2 } from "@toph/icons";
import { Accordion, AccordionItem } from "@toph/ui/app";
import { RadioDot } from "@toph/ui/app";
import { SearchField } from "@toph/ui/app";
import { Button } from "@toph/ui/app";
import { cx } from "@toph/ui";
import LoadingState from "../../../shared/ui/LoadingState";

interface Props {
  current: string;
  branches: string[];
  filter: string;
  onFilterChange: (value: string) => void;
  onCheckout: (branch: string) => void;
  onCreate: () => void;
  onDeleteOthers: () => void;
  onRetry: () => void;
  error?: string;
  loading?: boolean;
  busy?: string;
  count?: number;
  createDisabled?: boolean;
  deleteDisabled?: boolean;
  listClassName?: string;
}

/** Shared branch dropdown used by the desktop header and the mobile branch sheet. */
export default function BranchPicker({
  current,
  branches,
  filter,
  onFilterChange,
  onCheckout,
  onCreate,
  onDeleteOthers,
  onRetry,
  error,
  loading = false,
  busy = "",
  count,
  createDisabled = false,
  deleteDisabled = false,
  listClassName,
}: Props) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex min-h-0 flex-col gap-2 p-3">
      <div className="flex min-w-0 items-center gap-2.5 px-1">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-accent-500">
          <GitBranch size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-caption-2-regular text-text-tertiary">Branch atual</p>
          <p className="truncate text-caption-1-semibold text-text-primary">{current || "detached"}</p>
        </div>
      </div>
      <Accordion
        variant="divided"
        expandedKeys={open ? ["branches"] : []}
        onExpandedChange={(keys) => setOpen(Array.from(keys).includes("branches"))}
        className="px-1"
      >
        <AccordionItem
          id="branches"
          icon={GitBranch}
          title={<span className="text-caption-2-semibold uppercase tracking-[0.14em] text-text-tertiary">Branches</span>}
          triggerClassName="py-1"
          contentClassName="p-0"
          actions={
            <div className="flex items-center gap-1">
              <span className="text-caption-1-regular text-text-tertiary">{count ?? (loading ? "..." : branches.length)}</span>
              <Button
                variant="ghost"
                size="xs"
                iconOnly
                leadingIcon={Trash2}
                aria-label="Excluir todas as branches, exceto a atual"
                title="Excluir todas as branches, exceto a atual"
                disabled={deleteDisabled || Boolean(busy)}
                onClick={onDeleteOthers}
              />
              <Button
                variant="ghost"
                size="xs"
                iconOnly
                leadingIcon={Plus}
                aria-label="Criar nova branch"
                title="Criar nova branch"
                disabled={createDisabled || Boolean(busy)}
                onClick={onCreate}
              />
            </div>
          }
        >
          <div className="flex flex-col gap-2">
            <SearchField
              value={filter}
              onChange={onFilterChange}
              placeholder="Filtrar branches"
              aria-label="Filtrar branches"
              shape="rounded"
              size="small"
              fieldClassName="h-8"
            />
            <div className={cx("no-scrollbar flex max-h-[min(280px,calc(100dvh-360px))] flex-col gap-1 overflow-y-auto overflow-x-hidden", listClassName)}>
              {error ? (
                <div className="flex flex-col items-center gap-2 px-2 py-4 text-center">
                  <CircleAlert size={20} className="text-rose-500" />
                  <p className="text-caption-1-regular text-text-secondary">{error}</p>
                  <Button variant="secondary" size="small" onClick={onRetry}>Tentar novamente</Button>
                </div>
              ) : loading ? (
                <LoadingState label="Carregando branches..." className="px-2 py-3" />
              ) : branches.map((name) => {
                const isCurrent = name === current;
                return (
                  <button
                    key={name}
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => onCheckout(name)}
                    className={cx(
                      "flex min-h-9 w-full shrink-0 items-center justify-between gap-2.5 overflow-hidden rounded-lg p-2 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      isCurrent ? "bg-dropdown-item-hover-background" : "hover:bg-dropdown-item-hover-background",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <GitBranch size={14} className="shrink-0 text-foreground-icon-secondary" />
                      <span className="truncate text-body-medium text-text-primary">{name}</span>
                    </span>
                    {isCurrent ? <RadioDot selected size="sm" /> : null}
                  </button>
                );
              })}
              {!error && !loading && branches.length === 0 ? (
                <p className="px-2 py-4 text-center text-caption-1-regular text-text-secondary">Nenhuma branch encontrada.</p>
              ) : null}
            </div>
          </div>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
