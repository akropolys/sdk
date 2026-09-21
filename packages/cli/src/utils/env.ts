import fs from 'fs';
import path from 'path';

export interface EnvWriteResult {
  file: string;
  added: string[];
  updated: string[];
}

export function writeEnv(file: string, vars: Record<string, string>, cwd = process.cwd()): EnvWriteResult {
  const full = path.join(cwd, file);
  const existing = fs.existsSync(full) ? fs.readFileSync(full, 'utf-8') : '';
  const lines = existing ? existing.split(/\r?\n/) : [];

  const added: string[] = [];
  const updated: string[] = [];

  for (const [key, value] of Object.entries(vars)) {
    const idx = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
    if (idx >= 0) {
      if (lines[idx] !== `${key}=${value}`) updated.push(key);
      lines[idx] = `${key}=${value}`;
    } else {
      added.push(key);
      lines.push(`${key}=${value}`);
    }
  }

  const body = lines.join('\n').replace(/\n{3,}$/, '\n');
  fs.writeFileSync(full, body.endsWith('\n') ? body : `${body}\n`, 'utf-8');
  return { file, added, updated };
}

export function ensureGitignored(file: string, cwd = process.cwd()): boolean {
  const gitignore = path.join(cwd, '.gitignore');
  if (!fs.existsSync(gitignore)) return false;
  const content = fs.readFileSync(gitignore, 'utf-8');
  const ignored = content.split(/\r?\n/).some((l) => {
    const t = l.trim();
    return t === file || t === `/${file}` || t === '.env*' || t === '.env*.local';
  });
  if (ignored) return false;
  fs.appendFileSync(gitignore, `${content.endsWith('\n') ? '' : '\n'}${file}\n`, 'utf-8');
  return true;
}
