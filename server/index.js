// Servidor de sincronización: reenvía los cambios entre la caja y los celulares.
// Mismo protocolo que el relay que antes vivía en vite.config.ts (ver SYNC_PROTOCOL.md).
// En producción también sirve el build de la web (dist/) para tener un solo despliegue.
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api, connectRelay, gate, onRelayMessage } from './api.js';
import { paymentsProblem } from './payments.js';

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
// Sin ALLOWED_ORIGINS también se aceptan equipos de la red local (la web o el celular abiertos por IP)
const ALLOW_LAN = !process.env.ALLOWED_ORIGINS;
const LAN_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})(:\d+)?$/;
// Dirección que la caja pone en el QR cuando el servidor está detrás de un dominio (https://tu-dominio.com/__sync)
const PUBLIC_SYNC_URL = process.env.PUBLIC_SYNC_URL?.trim() || null;
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
  if (ORIGINS.includes('*') || ORIGINS.includes(origin) || (ALLOW_LAN && LAN_ORIGIN.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  res.setHeader('Vary', 'Origin');
}

// Direcciones IPv4 de la red local con las que un celular puede llegar a este servidor
function lanUrls() {
  const urls = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      // Los adaptadores virtuales (VirtualBox, WSL, Docker…) van al final: el celular casi nunca está en esa red
      const virtual = /virtual|vbox|vmware|wsl|docker|hyper-v|vethernet|loopback/i.test(name);
      urls.push({ url: `http://${a.address}:${PORT}/__sync`, name, virtual });
    }
  }
  return urls.sort((a, b) => Number(a.virtual) - Number(b.virtual) || Number(!a.url.includes('//192.168.')) - Number(!b.url.includes('//192.168.')));
}

function info(res) {
  const urls = [...(PUBLIC_SYNC_URL ? [{ url: PUBLIC_SYNC_URL, name: 'público', virtual: false }] : []), ...lanUrls()];
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ app: 'abarre-sync', port: PORT, clients: clients.size, urls }));
}

function sync(req, res) {
  cors(req, res);

  if (req.method === 'GET' && new URL(req.url ?? '/', 'http://x').pathname === '/__sync/info') {
    info(res);
    return;
  }

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
      let msg = null;
      try {
        msg = JSON.parse(line)?.msg;
      } catch {
        /* mensaje que no es JSON */
      }
      // Lo que mueve existencias se revisa antes de reenviarlo; si no pasa, nadie lo recibe.
      // Revisar, reenviar y aplicar ocurre sin pausas: otra petición no se puede meter en medio.
      const denied = gate(msg);
      if (denied) {
        res.writeHead(denied.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(denied.body));
        return;
      }
      clients.forEach((c) => c.write(`data: ${line}\n\n`));
      // La API escucha el canal: catálogo, usuarios y pedidos de la caja
      onRelayMessage(msg);
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

// La API publica en el canal como un equipo más (por ejemplo, ORDER_RECEIVED o WHO)
const SERVER_FROM = `servidor-${randomUUID()}`;
connectRelay((msg) => {
  const line = JSON.stringify({ id: randomUUID(), from: SERVER_FROM, msg });
  clients.forEach((c) => c.write(`data: ${line}\n\n`));
});

const server = createServer((req, res) => {
  if (req.url?.startsWith('/__sync')) return sync(req, res);
  if (req.url === '/api' || req.url?.startsWith('/api/') || req.url?.startsWith('/api?')) {
    cors(req, res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    return void api(req, res);
  }
  if (SERVE_DIST) return serveDist(req, res);
  res.writeHead(404);
  res.end();
});

server.listen(PORT, HOST, () => {
  console.log(`Sincronización en http://${HOST}:${PORT}/__sync · API en http://${HOST}:${PORT}/api`);
  console.log(SERVE_DIST ? `Sirviendo la web desde ${DIST}` : 'Sin build de la web (dist/): solo sincronización');
  console.log(`Orígenes permitidos: ${ORIGINS.join(', ')}${ALLOW_LAN ? ' y equipos de la red local' : ''}`);
  const pay = paymentsProblem();
  console.log(pay ? `⚠ Pago en línea desactivado: ${pay} Los clientes no podrán hacer pedidos (ver README).` : 'Pago en línea: Stripe en modo de pruebas.');
  const lan = lanUrls();
  if (lan.length) console.log(`Para el celular (misma Wi-Fi): ${lan.map((u) => u.url).join('  ·  ')}`);
});
