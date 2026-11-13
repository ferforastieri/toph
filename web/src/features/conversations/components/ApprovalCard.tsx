import { AlertTriangle, Check, X } from "@toph/icons";
import { Button } from "@/shared/toph-ui/base/buttons/button";

interface Props {
  agentName: string;
  name: string;
  arguments: string;
  onApprove: () => void;
  onReject: () => void;
}

/** The same inline approval pattern as the reference chat: exact call in front of you. */
export default function ApprovalCard({ agentName, name, arguments: args, onApprove, onReject }: Props) {
  return (
    <article className="toph-msg-in my-1 flex min-w-0 gap-3 py-1">
      <div className="flex w-[34px] shrink-0 justify-center">
        <span className="mt-0.5 flex size-7 items-center justify-center rounded-full bg-status-amber-bg text-status-amber-text">
          <AlertTriangle size={15} />
        </span>
      </div>
      <div className="min-w-0 flex-1 rounded-2xl border border-status-amber-border bg-status-amber-bg/40 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-status-amber-text">Esperando você</p>
        <p className="mt-1 text-caption-1-semibold text-text-primary">
          {agentName} quer usar <span className="font-mono text-[12px]">{name}</span>
        </p>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border-button-default bg-background-primary-default p-2.5 font-mono text-[11px] leading-relaxed text-text-secondary">{args}</pre>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" size="small" leadingIcon={X} onClick={onReject}>Recusar</Button>
          <Button variant="primary" size="small" leadingIcon={Check} onClick={onApprove}>Autorizar uma vez</Button>
        </div>
      </div>
    </article>
  );
}
