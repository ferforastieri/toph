import {
  RiClaudeFill,
  RiCopilotFill,
  RiDeepseekFill,
  RiGeminiFill,
  RiGrokAiFill,
  RiMetaFill,
  RiMixtralFill,
  RiOpenaiFill,
  RiOpenSourceFill,
  RiPerplexityFill,
  RiQwenAiFill,
  RiRobot2Fill,
} from "@remixicon/react";
import { cx } from "@/boardui/utils/cx";

interface Props {
  provider: string;
  className?: string;
}

function providerIcon(provider: string) {
  const value = provider.toLowerCase();
  if (value.includes("opencode-go") || value === "opencode") return RiOpenSourceFill;
  if (value.includes("openai") || value.includes("codex")) return RiOpenaiFill;
  if (value.includes("claude") || value.includes("anthropic")) return RiClaudeFill;
  if (value.includes("gemini") || value.includes("google")) return RiGeminiFill;
  if (value.includes("deepseek")) return RiDeepseekFill;
  if (value.includes("qwen")) return RiQwenAiFill;
  if (value.includes("grok") || value.includes("xai")) return RiGrokAiFill;
  if (value.includes("mistral") || value.includes("mixtral")) return RiMixtralFill;
  if (value.includes("meta") || value.includes("llama")) return RiMetaFill;
  if (value.includes("perplexity")) return RiPerplexityFill;
  if (value.includes("copilot") || value.includes("github")) return RiCopilotFill;
  return RiRobot2Fill;
}

export default function ProviderIcon({ provider, className }: Props) {
  const Icon = providerIcon(provider);
  return <Icon aria-hidden className={cx("shrink-0", className)} />;
}
