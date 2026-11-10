import type { ReactNode } from "react";

interface Props {
  control?: ReactNode;
  icon?: ReactNode;
  title: string;
  count?: ReactNode;
  actions?: ReactNode;
}

export default function SidebarHeader({ control, icon, title, count, actions }: Props) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-separator-border px-2">
      {control}
      {icon}
      <strong className="min-w-0 truncate text-body-2-medium text-text-primary">{title}</strong>
      {count}
      <span className="min-w-0 flex-1" />
      {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
    </header>
  );
}
