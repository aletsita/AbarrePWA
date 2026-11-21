// API de la app del celular (/api): cuentas, sesiones, catálogo y pedidos de «Pide y recoge».
// Ver API.md en tendero-mobile. Los datos se guardan en server/data/api.json.
//
// La caja sigue siendo la dueña del inventario y de los pedidos: este servidor escucha los mensajes que
// pasan por el canal de sincronización (SNAPSHOT, ORDER_*, ventas y cambios de productos), guarda una copia de
// los productos, los usuarios y los pedidos de la caja, y le manda los pedidos nuevos con ORDER_RECEIVED y los
// cambios que hace el cliente con ORDER_EDIT y ORDER_CANCEL.
// La tienda está abierta mientras la caja está conectada (manda PING) y su turno no está cerrado.
// Quien inicia sesión con el correo de un usuario activo de la caja (Dueño, Cajero, Inventario) entra
// como personal de la tienda; cualquier otra cuenta entra como cliente.
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = process.env.API_DATA ?? join(dirname(fileURLToPath(import.meta.url)), 'data', 'api.json');
const DAY = 86400;
const TOKEN_TTL = 30 * DAY;
const STEPS = ['pendiente', 'preparando', 'listo', 'entregado'];
const STAFF_ROLES = ['Dueño', 'Cajero', 'Inventario'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CAJA_WAIT_MS = 3000;
const CATALOG_FRESH_MS = 10000;
const MAX_TRIES = 3;
const CAJA_ALIVE_MS = 12000;

// ---------- datos ----------

function fresh() {
  return { secret: randomBytes(32).toString('hex'), users: [], revoked: [], orders: [], idem: {}, caja: null };
}

function load() {
  try {
    if (existsSync(FILE)) return { ...fresh(), ...JSON.parse(readFileSync(FILE, 'utf8')) };
  } catch (e) {
    console.warn(`[api] No se pudo leer ${FILE}; se empieza de cero.`, e.message);
  }
  return fresh();
}

const db = load();
let saveTimer = null;

// Escritura atómica y agrupada: varios cambios seguidos se guardan una sola vez
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      mkdirSync(dirname(FILE), { recursive: true });
      writeFileSync(`${FILE}.tmp`, JSON.stringify(db));
      renameSync(`${FILE}.tmp`, FILE);
    } catch (e) {
      console.warn('[api] No se pudieron guardar los datos', e.message);
    }
  }, 200);
}

const now = () => Math.floor(Date.now() / 1000);
const round = (n) => Math.round(n * 100) / 100;

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ---------- contraseñas y tokens (JWT HS256) ----------

function hashPassword(password, salt) {
  return scryptSync(password, salt, 32).toString('hex');
}

function checkPassword(password, user) {
  const a = Buffer.from(hashPassword(password, user.salt), 'hex');
  const b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const sign = (data) => createHmac('sha256', db.secret).update(data).digest('base64url');

function issue(user) {
  const staff = staffOf(user.email);
  const claims = {
    sub: user.id,
    role: staff ? 'personal' : 'cliente',
    name: user.name,
    ...(staff ? { staffRole: staff.role } : {}),
    exp: now() + TOKEN_TTL,
    jti: randomUUID(),
  };
  const head = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}`;
  return `${head}.${sign(head)}`;
}

function verify(token) {
  if (!token) throw new HttpError(401, 'sin-sesion', 'Inicia sesión para continuar.');
  const [h, p, s] = token.split('.');
  let claims = null;
  try {
    if (s && s === sign(`${h}.${p}`)) claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  } catch {
    /* token dañado */
  }
  if (!claims || claims.exp <= now() || db.revoked.some((r) => r.jti === claims.jti)) {
    throw new HttpError(401, 'sesion-vencida', 'Tu sesión venció.');
  }
  if (!db.users.some((u) => u.id === claims.sub)) throw new HttpError(401, 'sesion-vencida', 'Tu sesión venció.');
  return claims;
}

function requireRole(token, role) {
  const c = verify(token);
  if (c.role !== role) throw new HttpError(403, 'prohibido', 'No tienes permiso para esta acción.');
  return c;
}

// Usuario activo de la caja con ese correo (personal de la tienda)
function staffOf(email) {
  const u = db.caja?.users?.find((x) => x.email?.trim().toLowerCase() === email && x.active !== false);
  return u && STAFF_ROLES.includes(u.role) ? u : null;
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone });
const publicOrder = ({ userId: _u, tries: _t, ...o }) => o;
const ACTIVE = ['pendiente', 'preparando', 'listo'];

// ---------- tienda abierta o cerrada ----------

let cajaSeenAt = 0; // último PING o SNAPSHOT de la caja (en memoria: al arrancar se espera a que hable)
let lastStore = '';

function storeStatus() {
  const name = db.caja?.storeName;
  if (!cajaSeenAt || Date.now() - cajaSeenAt > CAJA_ALIVE_MS) {
    return { abierta: false, motivo: 'sin-conexion', mensaje: 'La tienda no está conectada en este momento.', ...(name ? { nombre: name } : {}) };
  }
  if (db.caja?.closed) return { abierta: false, motivo: 'turno-cerrado', mensaje: 'La tienda ya cerró su turno.', ...(name ? { nombre: name } : {}) };
  return { abierta: true, ...(name ? { nombre: name } : {}) };
}

function requireOpen() {
  const st = storeStatus();
  if (!st.abierta) throw new HttpError(503, st.motivo === 'turno-cerrado' ? 'tienda-cerrada' : 'tienda-desconectada', `${st.mensaje} Intenta más tarde.`);
}

// Avisa en vivo a todos los clientes conectados cuando la tienda abre o cierra
function checkStore() {
  const st = JSON.stringify(storeStatus());
  if (st === lastStore) return;
  lastStore = st;
  streams.forEach((set) => set.forEach((res) => res.write(`event: tienda\ndata: ${st}\n\n`)));
}
setInterval(checkStore, 3000).unref();

// ---------- canal con la caja ----------

let publish = () => undefined; // lo conecta index.js: manda un mensaje a todos los equipos
const snapshotWaiters = new Set();
let whoSentAt = 0;
let whoPending = false;

export function connectRelay(fn) {
  publish = fn;
}

// Pide a la caja su SNAPSHOT y espera el siguiente que llegue (o null si no responde)
function freshSnapshot(timeout = CAJA_WAIT_MS) {
  return new Promise((resolve) => {
    const waiter = { resolve };
    snapshotWaiters.add(waiter);
    const t = setTimeout(() => {
      snapshotWaiters.delete(waiter);
      resolve(null);
    }, timeout);
    waiter.resolve = (data) => {
      clearTimeout(t);
      snapshotWaiters.delete(waiter);
      resolve(data);
    };
    // Si ya hay un WHO reciente sin respuesta, se espera ese mismo SNAPSHOT
    if (!whoPending || Date.now() - whoSentAt > 1000) {
      whoPending = true;
      whoSentAt = Date.now();
      publish({ type: 'WHO' });
    }
  });
}

// Cada mensaje que pasa por el canal (index.js lo llama al reenviarlo)
export function onRelayMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  const o = typeof msg.id === 'string' ? db.orders.find((x) => x.id === msg.id) : null;
  const c = typeof msg.id === 'string' ? db.caja?.orders.find((x) => x.id === msg.id) : null;
  switch (msg.type) {
    case 'SNAPSHOT':
      if (msg.data) onSnapshot(msg.data);
      break;
    case 'PING':
      if (msg.key === 'panel') cajaSeenAt = Date.now();
      break;
    case 'BYE':
      // La caja se quedó sin internet o se cerró
      if (msg.key === 'panel') cajaSeenAt = 0;
      break;
    case 'CLOSE_CUT':
      if (db.caja) db.caja.closed = true;
      break;
    case 'OPEN_SHIFT':
      if (db.caja) db.caja.closed = false;
      break;
    case 'ORDER_ADVANCE':
      if (c && c.status === msg.from) c.status = STEPS[STEPS.indexOf(msg.from) + 1];
      if (o && o.status === msg.from && !o.issue) setStatus(o, STEPS[STEPS.indexOf(msg.from) + 1], msg.at);
      break;
    case 'ORDER_DELIVER':
      if (c) c.status = 'entregado';
      applySale(msg.sale);
      if (o) setStatus(o, 'entregado');
      break;
    case 'ORDER_CANCEL':
      if (c) c.status = 'cancelado';
      if (o) cancelOrder(o, { reason: msg.reason, missing: msg.missing ?? [], ...(msg.note ? { note: msg.note } : {}), at: new Date(msg.at ?? Date.now()).toISOString() });
      break;
    case 'ORDER_ISSUE': {
      const at = new Date(msg.at ?? Date.now()).toISOString();
      if (c) c.issue = { missing: msg.missing ?? [], at };
      if (o && ACTIVE.includes(o.status)) {
        o.issue = { missing: (msg.missing ?? []).filter((id) => o.items.some((i) => i.productId === id)), at };
        save();
        emit(o);
      }
      break;
    }
    // Existencias al momento para el catálogo, sin esperar el siguiente SNAPSHOT de la caja
    case 'CONFIRM_SALE':
      applySale(msg.sale);
      break;
    case 'UPSERT_PRODUCT':
      if (db.caja && msg.product?.id) db.caja.products = [msg.product, ...db.caja.products.filter((p) => p.id !== msg.product.id)];
      break;
    case 'ADD_STOCK':
      for (const e of msg.entries ?? []) {
        const p = db.caja?.products.find((x) => x.id === e.productId);
        if (p) p.stock += Number(e.qty) || 0;
      }
      break;
  }
  if (['PING', 'BYE', 'SNAPSHOT', 'CLOSE_CUT', 'OPEN_SHIFT'].includes(msg.type)) checkStore();
}

// Una venta descuenta su existencia una sola vez (puede llegar como CONFIRM_SALE o dentro de ORDER_DELIVER)
const appliedSales = new Set();
function applySale(sale) {
  if (!db.caja || !sale?.id || appliedSales.has(sale.id)) return;
  appliedSales.add(sale.id);
  for (const i of sale.items ?? []) {
    const p = db.caja.products.find((x) => x.id === i.productId);
    if (p) p.stock = Math.max(0, p.stock - i.qty);
  }
}

function onSnapshot(data) {
  whoPending = false;
  cajaSeenAt = Date.now();
  appliedSales.clear();
  db.caja = {
    at: Date.now(),
    storeName: data.store?.name,
    closed: !!data.closedCutId,
    products: Array.isArray(data.products) ? data.products : [],
    users: Array.isArray(data.users) ? data.users.map(({ name, email, role, active }) => ({ name, email, role, active })) : [],
    orders: Array.isArray(data.orders)
      ? data.orders.map(({ id, folio, status, items, total, cancel, issue, editedAt }) => ({ id, folio, status, items, total, cancel, issue, editedAt }))
      : [],
  };
  // Reconcilia los pedidos: folio, estado y productos de la caja; reenvía lo que no le llegó
  for (const o of db.orders) {
    const c = db.caja.orders.find((x) => x.id === o.id);
    if (c) {
      o.folio = c.folio;
      o.tries = 0;
      const before = JSON.stringify([o.items, o.issue ?? null]);
      if (Array.isArray(c.items) && c.items.length) {
        o.items = c.items.map(({ productId, name, price, qty }) => ({ productId, name, price, qty }));
        o.total = round(c.total ?? o.items.reduce((t, i) => t + i.price * i.qty, 0));
      }
      if (c.issue && ACTIVE.includes(c.status)) o.issue = c.issue;
      else delete o.issue;
      if (c.editedAt) o.editedAt = c.editedAt;
      if (o.status === 'cancelado' && o.cancel?.reason === 'cliente' && ACTIVE.includes(c.status)) {
        // El cliente lo canceló mientras la caja no estaba: se le vuelve a avisar
        publish({ type: 'ORDER_CANCEL', id: o.id, reason: 'cliente', missing: [], at: Date.parse(o.cancel.at) });
      } else if (c.status === 'cancelado') cancelOrder(o, c.cancel ?? { reason: 'otro', missing: [], at: new Date().toISOString() });
      else setStatus(o, c.status);
      if (before !== JSON.stringify([o.items, o.issue ?? null])) emit(o);
    } else if (o.status !== 'entregado' && o.status !== 'cancelado' && o.folio && (o.tries ?? 0) < MAX_TRIES) {
      sendToCaja(o);
    }
  }
  save();
  [...snapshotWaiters].forEach((w) => w.resolve(db.caja));
}

function sendToCaja(o) {
  const user = db.users.find((u) => u.id === o.userId);
  if (!user) return;
  o.tries = (o.tries ?? 0) + 1;
  publish({
    type: 'ORDER_RECEIVED',
    request: {
      id: o.id,
      customer: { name: user.name, phone: user.phone },
      items: o.items.map(({ productId, qty }) => ({ productId, qty })),
      note: o.note,
      at: Date.parse(o.createdAt),
      pickupCode: o.pickupCode,
    },
  });
}

// Catálogo para los clientes: lo visible en la app, con la existencia menos lo apartado por pedidos
// (sin contar el pedido `exceptId`, para cuando el cliente cambia los productos de ese mismo pedido)
function catalogOf(caja, exceptId) {
  const reserved = {};
  for (const o of caja.orders) {
    if (o.id === exceptId || !ACTIVE.includes(o.status)) continue;
    for (const i of o.items ?? []) reserved[i.productId] = (reserved[i.productId] ?? 0) + i.qty;
  }
  return caja.products
    .filter((p) => p.showInApp !== false)
    .map(({ id, name, category, price, stock, photo, description }) => ({
      id,
      name,
      category,
      price,
      stock: Math.max(0, stock - (reserved[id] ?? 0)),
      ...(description ? { description } : {}),
      ...(photo ? { photo } : {}),
    }));
}

async function currentCaja() {
  if (db.caja && Date.now() - db.caja.at < CATALOG_FRESH_MS) return db.caja;
  return (await freshSnapshot()) ?? db.caja;
}

// ---------- pedidos en vivo (SSE por usuario) ----------

const streams = new Map(); // userId → Set<res>

function emit(o) {
  streams.get(o.userId)?.forEach((res) => res.write(`event: pedido\ndata: ${JSON.stringify(publicOrder(o))}\n\n`));
}

// Lleva el pedido hasta `status` paso a paso, para que la línea de tiempo no se salte etapas
function setStatus(o, status, at = Date.now()) {
  if (o.status === 'cancelado') return;
  const target = STEPS.indexOf(status);
  if (target <= STEPS.indexOf(o.status)) return;
  for (let i = STEPS.indexOf(o.status) + 1; i <= target; i++) o.history.push({ status: STEPS[i], at: new Date(at).toISOString() });
  o.status = status;
  save();
  emit(o);
}

// La caja canceló el pedido (por ejemplo, se agotó un producto). El cliente decide en su app qué hacer.
function cancelOrder(o, cancel) {
  if (o.status === 'cancelado' || o.status === 'entregado') return;
  o.status = 'cancelado';
  delete o.issue;
  const reason = ['sin-existencia', 'cliente'].includes(cancel.reason) ? cancel.reason : 'otro';
  o.cancel = { reason, missing: cancel.missing ?? [], ...(cancel.note ? { note: cancel.note } : {}), at: cancel.at };
  o.history.push({ status: 'cancelado', at: cancel.at });
  save();
  emit(o);
}

function openStream(req, res, token) {
  const c = requireRole(token, 'cliente');
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
  res.write(': ok\n\n');
  const set = streams.get(c.sub) ?? new Set();
  set.add(res);
  streams.set(c.sub, set);
  res.write(`event: tienda\ndata: ${JSON.stringify(storeStatus())}\n\n`);
  const keep = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(keep);
    set.delete(res);
  });
}

// ---------- rutas ----------

function validateRegister(b) {
  const fields = {};
  const name = String(b.name ?? '').trim();
  const email = String(b.email ?? '').trim().toLowerCase();
  const phone = String(b.phone ?? '').replace(/\D/g, '');
  const password = String(b.password ?? '');
  if (name.length < 2) fields.name = 'Escribe tu nombre.';
  if (!EMAIL.test(email)) fields.email = 'Escribe un correo válido.';
  if (phone.length !== 10) fields.phone = 'El teléfono debe tener 10 dígitos.';
  if (password.length < 8) fields.password = 'La contraseña debe tener al menos 8 caracteres.';
  if (Object.keys(fields).length) throw new HttpError(422, 'datos-invalidos', 'Revisa los datos marcados.', { fields });
  return { name, email, phone, password };
}

async function route(method, path, token, body, headers) {
  const m = path.match(/^\/pedidos\/([^/]+)(\/resolver|\/cambiar|\/cancelar)?$/);
  const key = m && m[1] !== 'eventos' ? `${method} /pedidos/:id${m[2] ?? ''}` : `${method} ${path}`;

  switch (key) {
    case 'POST /auth/registro': {
      const { name, email, phone, password } = validateRegister(body);
      if (db.users.some((u) => u.email === email)) {
        throw new HttpError(409, 'correo-registrado', 'Ya hay una cuenta con ese correo. Inicia sesión.', { fields: { email: 'Ya hay una cuenta con ese correo.' } });
      }
      const salt = randomBytes(16).toString('hex');
      const user = { id: `u${randomUUID()}`, name, email, phone, salt, hash: hashPassword(password, salt), createdAt: new Date().toISOString() };
      db.users.push(user);
      save();
      // Igual que al entrar: con la lista de usuarios de la caja se sabe si es personal de la tienda
      if (!db.caja) await freshSnapshot(1500);
      return [201, { token: issue(user), user: publicUser(user) }];
    }

    case 'POST /auth/entrar': {
      const email = String(body.email ?? '').trim().toLowerCase();
      const user = db.users.find((u) => u.email === email);
      if (!user || !checkPassword(String(body.password ?? ''), user)) {
        throw new HttpError(401, 'credenciales', 'El correo o la contraseña no coinciden.');
      }
      // El rol se decide al entrar: si la caja lo tiene como usuario activo, es personal de la tienda
      if (!db.caja) await freshSnapshot(1500);
      return [200, { token: issue(user), user: publicUser(user) }];
    }

    case 'POST /auth/salir': {
      const c = verify(token);
      db.revoked = [...db.revoked.filter((r) => r.exp > now()), { jti: c.jti, exp: c.exp }];
      save();
      return [204, null];
    }

    case 'GET /yo': {
      const c = verify(token);
      return [200, publicUser(db.users.find((u) => u.id === c.sub))];
    }

    case 'GET /tienda': {
      verify(token);
      return [200, storeStatus()];
    }

    case 'GET /catalogo': {
      verify(token);
      const caja = await currentCaja();
      if (!caja) throw new HttpError(503, 'tienda-desconectada', 'La tienda no está conectada en este momento. Intenta en un rato.');
      return [200, catalogOf(caja)];
    }

    case 'GET /pedidos': {
      const c = requireRole(token, 'cliente');
      return [200, db.orders.filter((o) => o.userId === c.sub && o.folio).map(publicOrder)];
    }

    case 'GET /pedidos/:id': {
      const c = requireRole(token, 'cliente');
      const id = decodeURIComponent(m[1]);
      // El pedido de otra persona responde igual que uno que no existe
      const o = db.orders.find((x) => x.id === id && x.userId === c.sub && x.folio);
      if (!o) throw new HttpError(404, 'no-encontrado', 'No encontramos ese pedido.');
      return [200, publicOrder(o)];
    }

    case 'POST /pedidos/:id/resolver': {
      // Pedido cancelado: el cliente lo quita de sus pedidos activos o elige otros productos
      const c = requireRole(token, 'cliente');
      const o = db.orders.find((x) => x.id === decodeURIComponent(m[1]) && x.userId === c.sub && x.folio);
      if (!o) throw new HttpError(404, 'no-encontrado', 'No encontramos ese pedido.');
      if (o.status !== 'cancelado') throw new HttpError(409, 'no-cancelado', 'Este pedido sigue en curso.');
      const action = body.accion === 'reemplazar' ? 'reemplazar' : 'quitar';
      o.resolved ??= { action, at: new Date().toISOString() };
      save();
      emit(o);
      return [200, publicOrder(o)];
    }

    case 'POST /pedidos/:id/cambiar': {
      // Se agotó un producto: el cliente manda la lista nueva de productos (los que sigue queriendo y los que
      // eligió en lugar de los agotados). El pedido es el mismo: conserva su folio y su código.
      const c = requireRole(token, 'cliente');
      const o = db.orders.find((x) => x.id === decodeURIComponent(m[1]) && x.userId === c.sub && x.folio);
      if (!o) throw new HttpError(404, 'no-encontrado', 'No encontramos ese pedido.');
      if (!ACTIVE.includes(o.status)) throw new HttpError(409, 'no-activo', 'Este pedido ya no se puede cambiar.');
      if (!o.issue) throw new HttpError(409, 'sin-aviso', 'La tienda no pidió cambios en este pedido.');
      return [200, await editOrder(o, body)];
    }

    case 'POST /pedidos/:id/cancelar': {
      // El cliente cancela su pedido (por ejemplo, porque se agotó algo y ya no lo quiere)
      const c = requireRole(token, 'cliente');
      const o = db.orders.find((x) => x.id === decodeURIComponent(m[1]) && x.userId === c.sub && x.folio);
      if (!o) throw new HttpError(404, 'no-encontrado', 'No encontramos ese pedido.');
      if (!ACTIVE.includes(o.status)) throw new HttpError(409, 'no-activo', 'Este pedido ya no se puede cancelar.');
      const at = Date.now();
      publish({ type: 'ORDER_CANCEL', id: o.id, reason: 'cliente', missing: [], at });
      cancelOrder(o, { reason: 'cliente', missing: [], at: new Date(at).toISOString() });
      o.resolved = { action: 'quitar', at: new Date(at).toISOString() };
      save();
      emit(o);
      return [200, publicOrder(o)];
    }

    case 'POST /pedidos':
      return [201, await createOrder(requireRole(token, 'cliente'), body, headers['idempotency-key'] ?? '')];
  }
  throw new HttpError(404, 'ruta', `No existe ${method} ${path}`);
}

async function createOrder(c, body, key) {
  if (!key) throw new HttpError(400, 'sin-clave', 'Falta la clave de idempotencia.');
  // Misma clave = mismo pedido (el teléfono reintentó tras perder la respuesta)
  const prev = db.idem[`${c.sub}:${key}`];
  const existing = prev && db.orders.find((o) => o.id === prev && o.folio);
  if (existing) return publicOrder(existing);

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.some((i) => !Number.isInteger(i.qty) || i.qty < 1)) {
    throw new HttpError(422, 'datos-invalidos', 'El pedido no tiene productos válidos.');
  }
  if (!/^\d{6}$/.test(String(body.pickupCode ?? ''))) {
    throw new HttpError(422, 'datos-invalidos', 'Falta el código para recoger.', { fields: { pickupCode: 'Debe tener 6 dígitos.' } });
  }

  requireOpen();
  // Precios y existencia al momento, directo de la caja
  const caja = await freshSnapshot();
  if (!caja) throw new HttpError(503, 'tienda-desconectada', 'La tienda no está conectada en este momento. Intenta en un rato.');
  const products = catalogOf(caja);
  const conflict = conflictOf(items, products, body.expectedTotal);
  if (conflict) throw new HttpError(409, conflict.code, conflict.message, conflict);

  const at = new Date().toISOString();
  const order = {
    id: `o${randomUUID()}`,
    folio: '', // lo pone la caja al aceptarlo
    status: 'pendiente',
    items: items.map((i) => {
      const p = products.find((x) => x.id === i.productId);
      return { productId: p.id, name: p.name, price: p.price, qty: i.qty };
    }),
    total: round(items.reduce((t, i) => t + products.find((p) => p.id === i.productId).price * i.qty, 0)),
    note: String(body.note ?? '').trim().slice(0, 200),
    createdAt: at,
    history: [{ status: 'pendiente', at }],
    pickupCode: body.pickupCode,
    userId: c.sub,
  };
  db.orders.unshift(order);
  sendToCaja(order);
  // La caja lo acepta o lo rechaza al recibirlo; su siguiente SNAPSHOT lo dice. Se espera uno más por si
  // el primero salió de la caja antes de que le llegara el pedido.
  let after = await freshSnapshot();
  if (!order.folio && after) after = (await freshSnapshot()) ?? after;
  if (!order.folio) {
    db.orders = db.orders.filter((o) => o !== order);
    save();
    if (!after) throw new HttpError(503, 'tienda-desconectada', 'La tienda no respondió. Intenta de nuevo.');
    const again = conflictOf(items, catalogOf(after), body.expectedTotal);
    throw new HttpError(409, 'pedido-cambio', 'La tienda no pudo aceptar tu pedido. Revisa los productos.', again ?? { code: 'pedido-cambio', message: '', changes: [], products: [] });
  }
  db.idem[`${c.sub}:${key}`] = order.id;
  save();
  return publicOrder(order);
}

// Cambio de productos de un pedido con aviso de producto agotado. La caja lo aplica (ORDER_EDIT) y su
// siguiente SNAPSHOT confirma que lo aceptó.
async function editOrder(o, body) {
  const items = Array.isArray(body.items) ? body.items.map((i) => ({ productId: String(i.productId ?? ''), qty: i.qty })) : [];
  if (!items.length || items.some((i) => !i.productId || !Number.isInteger(i.qty) || i.qty < 1)) {
    throw new HttpError(422, 'datos-invalidos', 'El pedido debe tener al menos un producto.');
  }
  requireOpen();
  const caja = await freshSnapshot();
  if (!caja) throw new HttpError(503, 'tienda-desconectada', 'La tienda no está conectada en este momento. Intenta en un rato.');
  const products = catalogOf(caja, o.id);
  const changes = [];
  for (const i of items) {
    const p = products.find((x) => x.id === i.productId);
    if (!p || p.stock < 1) changes.push({ kind: 'no-disponible', productId: i.productId, name: p?.name ?? 'Producto' });
    else if (p.stock < i.qty) changes.push({ kind: 'existencia', productId: p.id, name: p.name, requested: i.qty, available: p.stock });
  }
  const conflict = (message) => ({ code: 'pedido-cambio', message, changes, products: products.filter((p) => items.some((i) => i.productId === p.id)) });
  if (changes.length) throw new HttpError(409, 'pedido-cambio', 'Algunos productos ya no alcanzan.', conflict('Algunos productos ya no alcanzan.'));

  const before = o.editedAt;
  publish({ type: 'ORDER_EDIT', id: o.id, items, at: Date.now() });
  const editedAt = (caja) => caja?.orders.find((x) => x.id === o.id)?.editedAt;
  let after = await freshSnapshot();
  if (after && (!editedAt(after) || editedAt(after) === before)) after = (await freshSnapshot()) ?? after;
  if (!after) throw new HttpError(503, 'tienda-desconectada', 'La tienda no respondió. Intenta de nuevo.');
  if (!editedAt(after) || editedAt(after) === before) {
    throw new HttpError(409, 'pedido-cambio', 'La tienda no pudo aceptar el cambio. Revisa los productos.', conflict('La tienda no pudo aceptar el cambio.'));
  }
  save();
  emit(o);
  return publicOrder(o);
}

function conflictOf(items, products, expectedTotal) {
  const changes = [];
  for (const i of items) {
    const p = products.find((x) => x.id === i.productId);
    if (!p || p.stock < 1) changes.push({ kind: 'no-disponible', productId: i.productId, name: p?.name ?? 'Producto' });
    else {
      if (p.price !== i.price) changes.push({ kind: 'precio', productId: p.id, name: p.name, before: i.price, after: p.price });
      if (p.stock < i.qty) changes.push({ kind: 'existencia', productId: p.id, name: p.name, requested: i.qty, available: p.stock });
    }
  }
  const total = round(items.reduce((t, i) => t + (products.find((p) => p.id === i.productId)?.price ?? 0) * i.qty, 0));
  if (!changes.length && total === round(Number(expectedTotal))) return null;
  return {
    code: 'pedido-cambio',
    message: 'Algunos productos cambiaron desde que los agregaste.',
    changes,
    products: products.filter((p) => items.some((i) => i.productId === p.id)),
  };
}

// ---------- HTTP ----------

const MAX_BODY = 100_000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) reject(new HttpError(413, 'muy-grande', 'La petición es demasiado grande.'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new HttpError(400, 'json', 'El cuerpo no es JSON válido.'));
      }
    });
  });
}

function send(res, status, data) {
  if (status === 204 || data === null) {
    res.writeHead(status);
    res.end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

// Entrada desde index.js para todo lo que empieza con /api (CORS ya resuelto)
export async function api(req, res) {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : url.searchParams.get('token');
  try {
    // EventSource no deja mandar encabezados: el token llega en la URL
    if (req.method === 'GET' && path === '/pedidos/eventos') return openStream(req, res, token);
    const body = req.method === 'GET' ? {} : await readBody(req);
    const [status, data] = await route(req.method, path, token, body, req.headers);
    send(res, status, data);
  } catch (e) {
    if (e instanceof HttpError) send(res, e.status, { code: e.code, message: e.message, ...(e.details ? e.details : {}) });
    else {
      console.error('[api]', e);
      send(res, 500, { code: 'error', message: 'Error del servidor.' });
    }
  }
}
