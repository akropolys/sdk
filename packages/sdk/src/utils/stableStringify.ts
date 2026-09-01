export function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const parts = keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return '{' + parts.join(',') + '}';
}
