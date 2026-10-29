import { AlertTriangle, ArrowRight, CircleCheck, FilePlus2, Files, Pencil, Trash2, Type } from "@toph/icons";
import { cx } from "@/boardui/utils/cx";

const statusMap = {
  A: { icon: FilePlus2, className: "text-emerald-500", label: "Adicionado" },
  U: { icon: FilePlus2, className: "text-emerald-500", label: "Não rastreado" },
  "?": { icon: FilePlus2, className: "text-emerald-500", label: "Não rastreado" },
  M: { icon: Pencil, className: "text-amber-500", label: "Modificado" },
  D: { icon: Trash2, className: "text-rose-500", label: "Excluído" },
  R: { icon: ArrowRight, className: "text-sky-500", label: "Renomeado" },
  C: { icon: Files, className: "text-sky-500", label: "Copiado" },
  T: { icon: Type, className: "text-cyan-500", label: "Tipo alterado" },
  "!": { icon: AlertTriangle, className: "text-rose-500", label: "Ignorado" },
} as const;

export default function GitStatusIcon({
  status,
  staged = false,
  size = 14,
  className,
}: {
  status: string;
  staged?: boolean;
  size?: number;
  className?: string;
}) {
  const normalized = status?.trim().toUpperCase() || "M";
  const meta = statusMap[normalized as keyof typeof statusMap] ?? statusMap.M;
  const Icon = meta.icon;

  return (
    <span
      className={cx("relative inline-flex size-4 shrink-0 items-center justify-center", meta.className, className)}
      title={staged ? `${meta.label} · staged` : meta.label}
      aria-label={staged ? `${meta.label}, staged` : meta.label}
    >
      <Icon size={size} strokeWidth={2.1} aria-hidden />
      {staged && (
        <span className="absolute -end-0.5 -bottom-0.5 flex size-2.5 items-center justify-center rounded-full bg-background-primary-default">
          <CircleCheck size={9} className="text-emerald-500" aria-hidden />
        </span>
      )}
    </span>
  );
}
