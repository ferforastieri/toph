import { Icon, cx } from "@toph/ui";
import { PROVIDER_LOGOS, type ProviderLogo } from "../logos";

interface Props {
  provider: string;
  className?: string;
}

function providerLogo(provider: string): ProviderLogo | undefined {
  const value = provider.toLowerCase();
  if (value.includes("opencode")) return PROVIDER_LOGOS.opencode;
  if (value === "codex" || value.includes("codex")) return PROVIDER_LOGOS.codex;
  if (value.includes("openai")) return PROVIDER_LOGOS.openai;
  if (value.includes("claude") || value.includes("anthropic")) return PROVIDER_LOGOS.claude;
  if (value.includes("gemini") || value.includes("google")) return PROVIDER_LOGOS.gemini;
  if (value.includes("deepseek")) return PROVIDER_LOGOS.deepseek;
  if (value.includes("qwen") || value.includes("alibaba")) return PROVIDER_LOGOS.qwen;
  if (value.includes("grok") || value.includes("xai")) return PROVIDER_LOGOS.grok;
  if (value.includes("mistral") || value.includes("mixtral")) return PROVIDER_LOGOS.mistral;
  if (value.includes("meta") || value.includes("llama")) return PROVIDER_LOGOS.meta;
  if (value.includes("perplexity")) return PROVIDER_LOGOS.perplexity;
  if (value.includes("copilot") || value.includes("github")) return PROVIDER_LOGOS.copilot;
  if (value.includes("openrouter")) return PROVIDER_LOGOS.openrouter;
  if (value.includes("moonshot")) return PROVIDER_LOGOS.moonshot;
  if (value.includes("kimi")) return PROVIDER_LOGOS.kimi;
  if (value.includes("glm") || value.includes("zhipu")) return PROVIDER_LOGOS.glm;
  if (value.includes("ollama")) return PROVIDER_LOGOS.ollama;
  if (value.includes("groq")) return PROVIDER_LOGOS.groq;
  if (value.includes("cerebras")) return PROVIDER_LOGOS.cerebras;
  if (value.includes("azure")) return PROVIDER_LOGOS.azure;
  if (value.includes("bedrock")) return PROVIDER_LOGOS.bedrock;
  return undefined;
}

export default function ProviderIcon({ provider, className }: Props) {
  const logo = providerLogo(provider);
  if (!logo) return <Icon name="agent" className={cx("shrink-0", className)} />;
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      fillRule={logo.fillRule}
      className={cx("shrink-0", className)}
    >
      {logo.paths.map((path, index) => (
        <path
          key={index}
          d={path.d}
          fill={path.fill}
          fillRule={path.fillRule}
          clipRule={path.clipRule}
        />
      ))}
    </svg>
  );
}
