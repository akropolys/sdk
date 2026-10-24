export function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  // Match JSON wire semantics while keeping object keys in canonical order.
  if (typeof obj.toJSON === 'function') return stableStringify(obj.toJSON());
  if (Array.isArray(obj)) {
    return '[' + Array.from(obj, value => stableStringify(value) ?? 'null').join(',') + ']';
  }
  const parts: string[] = [];
  for (const key of Object.keys(obj).sort()) {
    const value = stableStringify(obj[key]);
    if (value !== undefined) parts.push(`${JSON.stringify(key)}:${value}`);
  }
  return '{' + parts.join(',') + '}';
}
