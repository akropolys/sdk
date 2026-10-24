// Provider control syntax is never a chat answer. This also protects messages
// saved before the server learned to normalize textual tool calls.
export function stripToolMarkup(text: string): string {
  const start = /<\s*[|｜]+\s*DSML\s*[|｜]+\s*([a-z_]+)\b[^>]*>/i;
  let remaining = text;
  let out = '';
  while (remaining) {
    const match = start.exec(remaining);
    if (!match) {
      const partial = /<\s*\/?\s*[|｜]+[\s\S]*$/i.exec(remaining);
      if (partial) {
        const normalized = partial[0].replace(/\s/g, '').replace(/｜/g, '|').replace(/\|+/g, '|').toLowerCase();
        if ('<|dsml|'.startsWith(normalized) || '</|dsml|'.startsWith(normalized) || normalized.startsWith('<|dsml|') || normalized.startsWith('</|dsml|')) {
          return out + remaining.slice(0, partial.index);
        }
      }
      // Hold a trailing '<' until it is clear whether the next token is markup.
      return out + (remaining.endsWith('<') ? remaining.slice(0, -1) : remaining);
    }
    out += remaining.slice(0, match.index);
    const closing = new RegExp('<\\s*/\\s*[|｜]+\\s*DSML\\s*[|｜]+\\s*' + match[1] + '\\s*>', 'i');
    const rest = remaining.slice(match.index + match[0].length);
    const end = closing.exec(rest);
    if (!end) return out;
    remaining = rest.slice(end.index + end[0].length);
  }
  return out;
}
