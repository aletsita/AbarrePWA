// Servidor de sincronización: reenvía los cambios entre la caja y los celulares.
// Mismo protocolo que el relay que antes vivía en vite.config.ts (ver SYNC_PROTOCOL.md).
// En producción también sirve el build de la web (dist/) para tener un solo despliegue.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
];
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? DEFAULT_ORIGINS.join(','))
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const DIST = resolve(process.env.DIST_DIR ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist'));
const SERVE_DIST = existsSync(join(DIST, 'index.html'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const clients = new Set();

function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (ORIGINS.includes('*') || ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  res.setHeader('Vary', 'Origin');
}

function sync(req, res) {
  cors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.write(': ok\n\n');
    clients.add(res);
    const keep = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => {
      clearInterval(keep);
      clients.delete(res);
    });
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const line = body.replace(/\r?\n/g, '');
      clients.forEach((c) => c.write(`data: ${line}\n\n`));
      res.writeHead(204);
      res.end();
    });
    return;
  }

  res.writeHead(405, { Allow: 'GET, POST, OPTIONS' });
  res.end();
}

function send(res, file, cache) {
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': cache,
  });
  createReadStream(file).pipe(res);
}

// Archivos del build; las rutas de la app (/panel/...) responden con index.html
function serveDist(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  let path;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  const file = normalize(join(DIST, path));
  if (file.startsWith(DIST + sep) && existsSync(file) && statSync(file).isFile()) {
    const hashed = file.startsWith(join(DIST, 'assets') + sep);
    send(res, file, hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
    return;
  }
  if (extname(path)) {
    res.writeHead(404);
    res.end();
    return;
  }
  send(res, join(DIST, 'index.html'), 'no-cache');
}

const server = createServer((req, res) => {
  if (req.url?.startsWith('/__sync')) return sync(req, res);
  if (SERVE_DIST) return serveDist(req, res);
  res.writeHead(404);
  res.end();
});

server.listen(PORT, HOST, () => {
  console.log(`Sincronización en http://${HOST}:${PORT}/__sync`);
  console.log(SERVE_DIST ? `Sirviendo la web desde ${DIST}` : 'Sin build de la web (dist/): solo sincronización');
  console.log(`Orígenes permitidos: ${ORIGINS.join(', ')}`);
});
