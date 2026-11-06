/** Extracts the user's actual text from the priming prompt used on a bot's first turn. */
export function restoredUserText(raw: string): string {
  const marker = "Mensagem atual:\n";
  const start = raw.lastIndexOf(marker);
  if (start >= 0) {
    const content = raw.slice(start + marker.length);
    const end = content.lastIndexOf("\n\nResponda apenas como ");
    return (end >= 0 ? content.slice(0, end) : content).trim();
  }
  if (/Sua função:|Sua personalidade:|MCPs habilitados para você:/.test(raw)) return "";
  return raw.trim();
}
