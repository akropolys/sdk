import { spawn } from 'child_process';

// cmd.exe splits an unquoted & into a second command, so the URL must reach
// `start` quoted and verbatim or the query string is truncated at the first one.
export function openBrowser(url: string): boolean {
  try {
    if (process.platform === 'win32') {
      const child = spawn('cmd', ['/c', `start "" "${url}"`], {
        stdio: 'ignore',
        detached: true,
        windowsVerbatimArguments: true,
      });
      child.on('error', () => {});
      child.unref();
      return true;
    }

    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    const child = spawn(cmd, [url], { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
