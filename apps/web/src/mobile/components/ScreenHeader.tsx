import type { ComponentType, ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
}

/** Consistent mobile screen header. No corner actions. */
export default function ScreenHeader({ title, subtitle, icon: Icon }: Props) {
  return (
    <header className="flex shrink-0 flex-col gap-1 border-b border-separator-border bg-background-primary-default px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {Icon ? <Icon className="size-5 shrink-0 text-accent-500" /> : null}
        <h1 className="truncate text-title-2-medium text-text-primary">{title}</h1>
      </div>
      {subtitle ? <p className="truncate text-caption-1-regular text-text-secondary">{subtitle}</p> : null}
    </header>
  );
}
