import { RiCheckLine, RiLoader4Line } from "@remixicon/react";
import { cx } from "@/boardui/utils/cx";

export type AgentProgressStatus = "done" | "running" | "pending";

export interface AgentProgressStep {
  id: string;
  label: string;
  status: AgentProgressStatus;
}

export interface AgentProgressProps {
  steps: AgentProgressStep[];
  title?: string;
  className?: string;
}

export function AgentProgress({ steps, title, className }: AgentProgressProps) {
  const remaining = steps.filter((step) => step.status !== "done").length;
  return (
    <div className={cx("relative w-full max-w-full overflow-hidden rounded-2xl border border-border-button-default bg-background-primary-default shadow-xs", className)} aria-live="polite">
      <div className="px-2.5 pt-2 pb-2.5">
        <div className="pt-1">
          <div className="flex h-5 w-full items-center ps-1">
            <span className="flex h-4 w-6 shrink-0 items-center overflow-hidden" />
            <span className="relative inline-flex min-w-0 flex-1 overflow-hidden text-body-medium text-text-secondary">
              <span className="block whitespace-nowrap">{title ?? `${remaining} etapas restantes`}</span>
            </span>
          </div>
          <div className="mt-[9px] flex flex-col gap-1.5">
            {steps.map((step) => (
              <div key={step.id} className="h-8 w-full">
                <div
                  className={cx(
                    "relative flex h-full w-full items-center gap-2 rounded-full",
                    step.status === "running" ? "px-[9px]" : "px-1",
                  )}
                >
                  {step.status === "running" && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full border border-border-button-default" />}
                  <span className="relative z-10 flex size-3.5 shrink-0 items-center justify-center">
                    {step.status === "done" ? (
                      <span className="flex size-[15px] items-center justify-center rounded-full bg-notification-success-background text-notification-success-foreground"><RiCheckLine className="size-2.5" aria-hidden /></span>
                    ) : step.status === "running" ? (
                      <RiLoader4Line className="size-3.5 text-foreground-icon-secondary animate-spin" aria-hidden />
                    ) : (
                      <svg aria-hidden viewBox="0 0 15 15" className="size-[15px]"><circle cx="7.5" cy="7.5" r="7" fill="none" stroke="var(--color-background-quaternary-default)" strokeDasharray="2 2" /></svg>
                    )}
                  </span>
                  <span className="relative z-10 flex min-w-0 flex-1 items-center truncate leading-5">
                    <span className={cx("relative block min-w-0 max-w-full truncate text-body-medium leading-5 transition-colors duration-300", step.status === "running" ? "text-text-primary" : "text-text-secondary")}>
                      {step.label}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
