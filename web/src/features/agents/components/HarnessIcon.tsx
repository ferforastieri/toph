import { Sparkles, TerminalSquare } from "@toph/icons";
import ProviderIcon from "../../providers/components/ProviderIcon";

interface Props {
  id: string;
  className?: string;
}

/** The company mark for a harness, falling back to a neutral symbol. */
export default function HarnessIcon({ id, className }: Props) {
  if (id === "claude") return <ProviderIcon provider="claude" className={className} />;
  if (id === "codex") return <ProviderIcon provider="codex" className={className} />;
  if (id === "opencode") return <ProviderIcon provider="opencode" className={className} />;
  if (id === "gemini") return <ProviderIcon provider="gemini" className={className} />;
  if (id === "grok") return <ProviderIcon provider="grok" className={className} />;
  if (id === "cursor") return <TerminalSquare aria-hidden className={className} />;
  return <Sparkles aria-hidden className={className} />;
}
