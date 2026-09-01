import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3007;

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'wave-demo.html');
  
  if (req.url !== '/' && req.url !== '/wave-demo.html') {
    const requested = path.join(__dirname, req.url);
    if (fs.existsSync(requested) && fs.statSync(requested).isFile()) {
      filePath = requested;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Demo server listening on http://localhost:${PORT}`);
});
