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
//
// Inventario: el servidor es quien decide. disponible = existencia − apartado por pedidos activos y pagados.
// Los mensajes que mueven existencias (cobro en caja, empezar a preparar, entregar) pasan antes por `gate`,
// que revisa y aplica en el mismo paso síncrono: dos cobros de la última pieza no pueden pasar los dos.
// Pago en línea (Stripe, solo pruebas): ver payments.js. El pedido solo llega a la caja cuando el webhook
// firmado confirma el pago.
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCheckout, PaymentError, paymentsReady, retrieveCheckout, verifySignature } from './payments.js';

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
// Código para recoger: 6 caracteres sin letras que se confundan (sin O/0 ni I/1)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TRIES = 5;
const CODE_LOCK_MS = 5 * 60 * 1000;
const CHECKOUT_TTL_S = 30 * 60; // Stripe pide al menos 30 minutos
const RECENT_SALE_MS = 5 * 60 * 1000;

// ---------- datos ----------

function fresh() {
  return { secret: randomBytes(32).toString('hex'), users: [], revoked: [], orders: [], idem: {}, caja: null, webhooks: [] };
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
const ACTIVE = ['pendiente', 'preparando', 'listo'];

// Sin datos internos. El código para recoger solo se muestra cuando el pedido ya está pagado,
// y la liga de pago solo mientras falta pagar.
function publicOrder({ userId: _u, tries: _t, codeTries: _c, codeLock: _l, checkout, pickupCode, ...o }) {
  const paid = !o.payment || o.payment.status === 'pagado';
  const waiting = o.payment && ['pendiente_de_pago', 'fallido'].includes(o.payment.status) && o.status !== 'cancelado';
  return {
    ...o,
    ...(paid && pickupCode ? { pickupCode } : {}),
    // Solo el dueño del pedido recibe el secreto de su sesión; con él la app monta el pago embebido
    ...(waiting && checkout?.clientSecret && checkout.expiresAt > now() ? { paymentClientSecret: checkout.clientSecret } : {}),
  };
}

// ---------- inventario disponible ----------

// Piezas apartadas por pedido: los activos que ya tiene la caja y los pagados que todavía no le llegan.
// Un pedido sin pagar no aparta nada.
function reservedBy(exceptId) {
  const map = {};
  const seen = new Set();
  const add = (o) => {
    if (seen.has(o.id)) return;
    seen.add(o.id);
    if (o.id === exceptId) return;
    for (const i of o.items ?? []) map[i.productId] = (map[i.productId] ?? 0) + (Number(i.qty) || 0);
  };
  for (const o of db.caja?.orders ?? []) if (ACTIVE.includes(o.status)) add(o);
  for (const o of db.orders) if (ACTIVE.includes(o.status) && (!o.payment || o.payment.status === 'pagado')) add(o);
  return map;
}

const availableOf = (p, reserved) => Math.max(0, (Number(p?.stock) || 0) - (reserved[p?.id] ?? 0));

// Lo que falta para surtir `items` (sin contar lo que ya aparta el pedido `exceptId`)
function shortagesOf(items, exceptId) {
  if (!db.caja) return [];
  const reserved = reservedBy(exceptId);
  const want = {};
  for (const i of items ?? []) want[i.productId] = (want[i.productId] ?? 0) + (Number(i.qty) || 0);
  const out = [];
  for (const [id, requested] of Object.entries(want)) {
    const p = db.caja.products.find((x) => x.id === id);
    const available = p ? availableOf(p, reserved) : 0;
    if (requested > available) {
      out.push({ productId: id, name: p?.name ?? items.find((i) => i.productId === id)?.name ?? 'Producto', requested, available, missing: requested - available });
    }
  }
  return out;
}

const shortText = (list) => list.map((s) => `${s.name} (hay ${s.available}, faltan ${s.missing})`).join(', ');

function stockError(list) {
  return {
    status: 409,
    body: { code: 'sin-stock', message: `No alcanza el inventario: ${shortText(list)}.`, faltantes: list },
  };
}

// Disponible de cada producto, para avisar solo de lo que cambió
function availability() {
  if (!db.caja) return new Map();
  const reserved = reservedBy();
  return new Map(db.caja.products.map((p) => [p.id, `${p.stock}:${reserved[p.id] ?? 0}`]));
}

// Avisa en vivo lo que cambió: a los equipos de la tienda (STOCK por el canal) y a los clientes
// (evento `inventario` del mismo SSE de los pedidos)
function announceStock(before) {
  if (!db.caja) return;
  const after = availability();
  const changed = [...after.keys()].filter((id) => before.get(id) !== after.get(id));
  if (!changed.length) return;
  const reserved = reservedBy();
  const items = changed.map((id) => {
    const p = db.caja.products.find((x) => x.id === id);
    return { productId: id, stock: p.stock, reserved: reserved[id] ?? 0 };
  });
  publish({ type: 'STOCK', items, at: Date.now() });
  const visible = changed
    .map((id) => db.caja.products.find((x) => x.id === id))
    .filter((p) => p.showInApp !== false)
    .map((p) => ({ id: p.id, stock: availableOf(p, reserved) }));
  if (visible.length) streams.forEach((set) => set.forEach((res) => res.write(`event: inventario\ndata: ${JSON.stringify(visible)}\n\n`)));
}

// ---------- código para recoger ----------

function newPickupCode() {
  for (;;) {
    const code = Array.from(randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    if (!db.orders.some((o) => o.pickupCode === code && ACTIVE.includes(o.status))) return code;
  }
}

const cleanCode = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Revisa el código al entregar. Después de CODE_TRIES errores se bloquea unos minutos. Un pedido ya
// entregado no vuelve a pasar: su código solo sirve una vez.
function checkPickupCode(o, code) {
  const t = Date.now();
  if (o.status === 'entregado') return { status: 409, body: { code: 'codigo-usado', message: 'Este pedido ya se entregó; su código ya no sirve.' } };
  if (!o.pickupCode) return null;
  if (o.codeLock && o.codeLock > t) {
    const min = Math.ceil((o.codeLock - t) / 60000);
    return { status: 423, body: { code: 'codigo-bloqueado', message: `Demasiados intentos. Espera ${min} min y vuelve a intentarlo.`, hasta: o.codeLock } };
  }
  if (cleanCode(code) === o.pickupCode) {
    delete o.codeTries;
    delete o.codeLock;
    return null;
  }
  o.codeTries = (o.codeTries ?? 0) + 1;
  if (o.codeTries >= CODE_TRIES) {
    o.codeTries = 0;
    o.codeLock = t + CODE_LOCK_MS;
    save();
    return { status: 423, body: { code: 'codigo-bloqueado', message: `Código incorrecto. Por seguridad se bloqueó ${CODE_LOCK_MS / 60000} minutos.`, hasta: o.codeLock } };
  }
  save();
  const left = CODE_TRIES - o.codeTries;
  return { status: 422, body: { code: 'codigo-incorrecto', message: `El código no coincide. Te ${left === 1 ? 'queda 1 intento' : `quedan ${left} intentos`}.`, intentos: left } };
}

// ---------- revisión de los mensajes que mueven existencias ----------

// index.js la llama antes de reenviar un mensaje del canal. null = pasa; si no, { status, body } y el mensaje
// no se reenvía ni se aplica. Es síncrona a propósito: revisar y aplicar no se puede intercalar con otra petición.
export function gate(msg) {
  if (!msg || typeof msg !== 'object' || !db.caja) return null;
  switch (msg.type) {
    case 'CONFIRM_SALE': {
      const sale = msg.sale;
      if (!sale?.id || sale.orderId || recentSales.has(sale.id)) return null;
      const short = shortagesOf(sale.items);
      return short.length ? stockError(short) : null;
    }
    case 'ORDER_ADVANCE': {
      if (msg.from !== 'pendiente') return null;
      const c = db.caja.orders.find((x) => x.id === msg.id);
      if (!c || c.status !== 'pendiente') return null;
      // `online`: lo que la caja sabe del pago en línea (su `payment` es lo cobrado al entregar)
      const pay = db.orders.find((x) => x.id === msg.id)?.payment ?? c.online;
      if (pay && pay.status !== 'pagado') {
        return { status: 409, body: { code: 'pago-pendiente', message: 'El pago de este pedido todavía no se confirma. No se puede empezar a preparar.' } };
      }
      const short = shortagesOf(c.items, c.id);
      return short.length ? stockError(short) : null;
    }
    case 'ORDER_DELIVER': {
      const c = db.caja.orders.find((x) => x.id === msg.id);
      const o = db.orders.find((x) => x.id === msg.id);
      if (o) {
        const wrong = checkPickupCode(o, msg.pickupCode);
        if (wrong) return wrong;
        const online = o.payment?.method === 'en_linea';
        if (online && o.payment.status !== 'pagado') {
          return { status: 409, body: { code: 'pago-pendiente', message: 'El pago en línea de este pedido no está confirmado.' } };
        }
        // Pagado en línea no se vuelve a cobrar; uno de pagar en tienda no puede marcarse como pagado en línea
        if (online !== (msg.sale?.method === 'en_linea')) {
          return { status: 409, body: { code: 'metodo-pago', message: online ? 'Este pedido ya está pagado en línea: no se cobra.' : 'Este pedido se paga en la tienda.' } };
        }
      }
      if (!c) return null;
      const short = shortagesOf(c.items, c.id);
      return short.length ? stockError(short) : null;
    }
  }
  return null;
}

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
const QUIET = ['PING', 'BYE', 'WHO', 'STOCK'];

export function onRelayMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  const before = QUIET.includes(msg.type) ? null : availability();
  handleRelay(msg);
  if (before) announceStock(before);
}

function handleRelay(msg) {
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
      if (c && c.status === msg.from && !c.issue) c.status = STEPS[STEPS.indexOf(msg.from) + 1];
      if (o && o.status === msg.from && !o.issue) setStatus(o, STEPS[STEPS.indexOf(msg.from) + 1], msg.at);
      break;
    case 'ORDER_DELIVER':
      if (c) c.status = 'entregado';
      applySale(msg.sale);
      if (o) {
        if (o.payment?.method === 'en_linea') o.payment.deliveredAt = new Date().toISOString();
        setStatus(o, 'entregado');
      }
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

// Una venta descuenta su existencia una sola vez (puede llegar como CONFIRM_SALE o dentro de ORDER_DELIVER).
// Se recuerdan unos minutos por si llega un SNAPSHOT de la caja armado antes de aplicarla.
const recentSales = new Map(); // id → { items, at }
function applySale(sale) {
  if (!db.caja || !sale?.id || recentSales.has(sale.id)) return;
  recentSales.set(sale.id, { items: sale.items ?? [], at: Date.now() });
  discount(sale.items);
}

function discount(items) {
  for (const i of items ?? []) {
    const p = db.caja.products.find((x) => x.id === i.productId);
    if (p) p.stock = Math.max(0, p.stock - i.qty);
  }
}

function onSnapshot(data) {
  whoPending = false;
  cajaSeenAt = Date.now();
  const before = availability();
  db.caja = {
    at: Date.now(),
    storeName: data.store?.name,
    closed: !!data.closedCutId,
    products: Array.isArray(data.products) ? data.products.map((p) => ({ ...p })) : [],
    users: Array.isArray(data.users) ? data.users.map(({ name, email, role, active }) => ({ name, email, role, active })) : [],
    orders: Array.isArray(data.orders)
      ? data.orders.map(({ id, folio, status, items, total, cancel, issue, editedAt, online }) => ({ id, folio, status, items, total, cancel, issue, editedAt, online }))
      : [],
  };
  // Ventas que el servidor ya aprobó y que este SNAPSHOT todavía no trae: se vuelven a descontar
  const known = new Set(Array.isArray(data.sales) ? data.sales.map((s) => s.id) : []);
  for (const [id, s] of recentSales) {
    if (Date.now() - s.at > RECENT_SALE_MS) recentSales.delete(id);
    else if (!known.has(id)) discount(s.items);
  }
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
    } else if (ACTIVE.includes(o.status) && o.payment?.status === 'pagado') {
      // Pagado en línea y la caja aún no lo tiene: se le reenvía; si lo rechaza varias veces (turno cerrado,
      // ya no hay existencia) se marca para reembolso
      if ((o.tries ?? 0) < MAX_TRIES) sendToCaja(o);
      else cancelOrder(o, { reason: 'otro', missing: [], note: 'La tienda no pudo recibir el pedido.', at: new Date().toISOString() });
    } else if (o.status !== 'entregado' && o.status !== 'cancelado' && o.folio && (o.tries ?? 0) < MAX_TRIES) {
      sendToCaja(o);
    }
  }
  save();
  announceStock(before);
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
      ...(o.payment ? { payment: { method: o.payment.method, status: o.payment.status, amount: o.payment.amount, paidAt: o.payment.paidAt } } : {}),
    },
  });
}

// Catálogo para los clientes: lo visible en la app, con la existencia menos lo apartado por pedidos
// (sin contar el pedido `exceptId`, para cuando el cliente cambia los productos de ese mismo pedido)
function catalogOf(caja, exceptId) {
  const reserved = reservedBy(exceptId);
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
  // Ya se había cobrado en línea: queda para reembolso (el reembolso se hace a mano en Stripe)
  if (o.payment?.status === 'pagado') o.payment.status = 'por_reembolsar';
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
  const m = path.match(/^\/pedidos\/([^/]+)(\/resolver|\/cambiar|\/cancelar|\/pagar)?$/);
  // Los pedidos sin pagar también son del cliente (para reintentar el pago); la caja aún no les pone folio
  const mine = (c) => db.orders.find((x) => x.id === decodeURIComponent(m[1]) && x.userId === c.sub && (x.folio || x.payment));
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
      const list = db.orders.filter((o) => o.userId === c.sub && (o.folio || o.payment));
      await Promise.all(list.map(reconcilePayment));
      return [200, list.map(publicOrder)];
    }

    case 'GET /pedidos/:id': {
      const c = requireRole(token, 'cliente');
      // El pedido de otra persona responde igual que uno que no existe
      const o = mine(c);
      if (!o) throw new HttpError(404, 'no-encontrado', 'No encontramos ese pedido.');
      // La app lo consulta seguido justo después de pagar: se pregunta a Stripe sin esperar al webhook
      await reconcilePayment(o, 1500);
      return [200, publicOrder(o)];
    }

    case 'POST /pedidos/:id/resolver': {
      // Pedido cancelado: el cliente lo quita de sus pedidos activos o elige otros productos
      const c = requireRole(token, 'cliente');
      const o = mine(c);
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
      const o = mine(c);
      if (!o) throw new HttpError(404, 'no-encontrado', 'No encontramos ese pedido.');
      if (!ACTIVE.includes(o.status)) throw new HttpError(409, 'no-activo', 'Este pedido ya no se puede cambiar.');
      if (!o.issue) throw new HttpError(409, 'sin-aviso', 'La tienda no pidió cambios en este pedido.');
      // Cambiar los productos cambiaría lo cobrado: el pedido pagado se cancela y se marca para reembolso
      if (o.payment?.status === 'pagado') {
        throw new HttpError(409, 'pedido-pagado', 'Tu pedido ya está pagado y no se puede cambiar. Puedes cancelarlo y te devolvemos tu dinero.');
      }
      return [200, await editOrder(o, body)];
    }

    case 'POST /pedidos/:id/cancelar': {
      // El cliente cancela su pedido (por ejemplo, porque se agotó algo y ya no lo quiere)
      const c = requireRole(token, 'cliente');
      const o = mine(c);
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

    case 'POST /pedidos/:id/pagar': {
      // Reintentar el pago: si la sesión anterior sigue abierta se regresa la misma (no se cobra dos veces)
      const c = requireRole(token, 'cliente');
      const o = mine(c);
      if (!o) throw new HttpError(404, 'no-encontrado', 'No encontramos ese pedido.');
      if (o.payment?.method !== 'en_linea') throw new HttpError(409, 'sin-pago-en-linea', 'Este pedido se paga en la tienda.');
      await reconcilePayment(o);
      if (o.payment.status === 'pagado') return [200, publicOrder(o)];
      if (o.status === 'cancelado' || !['pendiente_de_pago', 'fallido'].includes(o.payment.status)) {
        throw new HttpError(409, 'no-se-puede-pagar', 'Este pedido ya no se puede pagar.');
      }
      if (o.payment.status === 'pendiente_de_pago' && o.checkout?.clientSecret && o.checkout.expiresAt > now() + 60) return [200, publicOrder(o)];
      if (!paymentsReady()) throw new HttpError(503, 'pagos-no-configurados', 'El pago en línea no está disponible en este momento.');
      requireOpen();
      const short = shortagesOf(o.items, o.id);
      if (short.length) throw new HttpError(409, 'sin-stock', `Ya no alcanza: ${shortText(short)}.`, { faltantes: short });
      await startCheckout(o);
      return [200, publicOrder(o)];
    }

    case 'POST /pedidos':
      return [201, await createOrder(requireRole(token, 'cliente'), body, headers['idempotency-key'] ?? '')];
  }
  throw new HttpError(404, 'ruta', `No existe ${method} ${path}`);
}

// Pedido con pago en línea: se crea sin pagar (no aparta nada ni llega a la caja) junto con la sesión de pago.
// Cuando el webhook firmado confirma el pago se revisa el inventario, se aparta y se manda a la caja.
async function createOrder(c, body, key) {
  if (!key) throw new HttpError(400, 'sin-clave', 'Falta la clave de idempotencia.');
  // Misma clave = mismo pedido (el teléfono reintentó tras perder la respuesta)
  const prev = db.idem[`${c.sub}:${key}`];
  const existing = prev && db.orders.find((o) => o.id === prev && o.userId === c.sub);
  if (existing) return publicOrder(existing);

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.some((i) => !Number.isInteger(i.qty) || i.qty < 1)) {
    throw new HttpError(422, 'datos-invalidos', 'El pedido no tiene productos válidos.');
  }
  if (!paymentsReady()) throw new HttpError(503, 'pagos-no-configurados', 'El pago en línea no está disponible en este momento. Intenta más tarde.');

  requireOpen();
  // Precios y existencia al momento, directo de la caja
  const caja = await freshSnapshot();
  if (!caja) throw new HttpError(503, 'tienda-desconectada', 'La tienda no está conectada en este momento. Intenta en un rato.');
  // Otra petición del mismo cliente con la misma clave pudo terminar mientras se esperaba a la caja
  const raced = db.idem[`${c.sub}:${key}`] && db.orders.find((o) => o.id === db.idem[`${c.sub}:${key}`]);
  if (raced) return publicOrder(raced);
  const products = catalogOf(db.caja);
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
    payment: { method: 'en_linea', status: 'pendiente_de_pago', provider: 'stripe' },
    userId: c.sub,
  };
  db.orders.unshift(order);
  db.idem[`${c.sub}:${key}`] = order.id;
  save();
  await startCheckout(order);
  return publicOrder(order);
}

// Abre una sesión de pago nueva. La llave de idempotencia es por intento: si la petición a Stripe se
// repite, regresa la misma sesión y no se cobra dos veces.
async function startCheckout(o) {
  const attempt = (o.checkout?.attempt ?? 0) + 1;
  try {
    const s = await createCheckout({
      orderId: o.id,
      items: o.items,
      idempotencyKey: `checkout-${o.id}-${attempt}`,
      expiresAt: now() + CHECKOUT_TTL_S,
    });
    o.checkout = { id: s.id, clientSecret: s.clientSecret, expiresAt: s.expiresAt ?? now() + CHECKOUT_TTL_S, attempt };
    o.payment.status = 'pendiente_de_pago';
  } catch (e) {
    if (!(e instanceof PaymentError)) throw e;
    o.checkout = { attempt };
    o.payment.status = 'fallido';
  }
  save();
  emit(o);
}

// ---------- respaldo: preguntar a Stripe ----------

// Si un webhook no llegó (por ejemplo, `stripe listen` estaba cerrado), el servidor le pregunta a Stripe por la
// sesión del pedido. La confirmación sigue siendo del servidor con datos de Stripe, nunca de la app.
const RECONCILE_MS = 20000;
const lastAsked = new Map(); // id del pedido → cuándo se preguntó

async function reconcilePayment(o, minGap = 5000) {
  if (o.payment?.method !== 'en_linea' || o.payment.status !== 'pendiente_de_pago' || !o.checkout?.id || !paymentsReady()) return;
  if (Date.now() - (lastAsked.get(o.id) ?? 0) < minGap) return;
  lastAsked.set(o.id, Date.now());
  const s = await retrieveCheckout(o.checkout.id);
  if (!s || o.payment.status !== 'pendiente_de_pago') return;
  if (s.payment_status === 'paid') confirmPaid(o, s);
  else if (s.status === 'expired') {
    o.payment.status = 'fallido';
    emit(o);
  } else return;
  save();
}

setInterval(() => {
  for (const o of db.orders) if (o.payment?.status === 'pendiente_de_pago') void reconcilePayment(o, RECONCILE_MS - 1000);
}, RECONCILE_MS).unref();

// ---------- webhook de Stripe ----------

// Lo que manda Stripe (ya con la firma revisada). Repetir el mismo evento no cambia nada.
export function onPaymentEvent(event) {
  if (!event?.id || db.webhooks.includes(event.id)) return false;
  db.webhooks = [event.id, ...db.webhooks].slice(0, 1000);
  const s = event.data?.object ?? {};
  const id = s.metadata?.orderId ?? s.client_reference_id;
  const o = db.orders.find((x) => x.id === id && x.payment?.method === 'en_linea');
  if (o) {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        if (s.payment_status === 'paid') confirmPaid(o, s);
        break;
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed':
        if (o.payment.status === 'pendiente_de_pago' && (!o.checkout?.id || o.checkout.id === s.id)) {
          o.payment.status = 'fallido';
          emit(o);
        }
        break;
    }
  }
  save();
  return true;
}

// El pago se confirmó: se revisa el inventario y se aparta en el mismo paso. Si ya no alcanza, el dinero
// ya se cobró: el pedido se cancela y queda por reembolsar.
function confirmPaid(o, s) {
  const ref = s.payment_intent ?? s.id;
  if (o.payment.status !== 'pendiente_de_pago' && o.payment.status !== 'fallido') {
    // Un segundo cobro del mismo pedido (otra sesión): se anota para devolverlo a mano
    if (o.payment.ref && o.payment.ref !== ref) o.payment.duplicates = [...new Set([...(o.payment.duplicates ?? []), ref])];
    return;
  }
  const before = availability();
  const at = new Date().toISOString();
  o.payment = { ...o.payment, ref, sessionId: s.id, paidAt: at, amount: round((Number(s.amount_total) || 0) / 100) };
  const short = o.status === 'cancelado' ? [] : shortagesOf(o.items, o.id);
  if (o.status === 'cancelado' || short.length) {
    o.payment.status = 'por_reembolsar';
    if (o.status !== 'cancelado') {
      o.status = 'cancelado';
      o.cancel = { reason: 'sin-existencia', missing: short.map((x) => x.productId), note: 'Se agotó mientras pagabas. Te devolveremos tu dinero.', at };
      o.history.push({ status: 'cancelado', at });
    }
    emit(o);
    return;
  }
  o.payment.status = 'pagado';
  o.pickupCode = newPickupCode();
  o.tries = 0;
  emit(o);
  sendToCaja(o);
  announceStock(before);
  // La caja le pone folio al recibirlo; su SNAPSHOT lo trae
  setTimeout(() => void freshSnapshot(), 300).unref?.();
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) reject(new HttpError(413, 'muy-grande', 'La petición es demasiado grande.'));
    });
    req.on('end', () => resolve(body));
  });
}

async function webhook(req, res) {
  const raw = await readRaw(req);
  // Sin la firma de Stripe no se cree nada de lo que diga el cuerpo
  if (!verifySignature(raw, req.headers['stripe-signature'])) throw new HttpError(400, 'firma-invalida', 'Firma inválida.');
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'json', 'El cuerpo no es JSON válido.');
  }
  const fresh = onPaymentEvent(event);
  send(res, 200, { recibido: true, ...(fresh ? {} : { repetido: true }) });
}

// Página a la que Stripe regresa al terminar o cancelar: la confirmación real llega por el webhook
function paymentReturn(res, estado) {
  const ok = estado === 'pagado';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ok ? 'Pago recibido' : 'Pago cancelado'}</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;background:#f6f7f9;color:#1d2433;text-align:center}main{max-width:420px}h1{font-size:1.5rem}</style>
</head><body><main><h1>${ok ? 'Recibimos tu pago' : 'No se hizo el cobro'}</h1>
<p>${ok ? 'Regresa a la app de la tienda: en «Mis pedidos» verás tu pedido pagado y tu código para recoger en cuanto se confirme.' : 'Regresa a la app de la tienda para intentarlo otra vez.'}</p></main></body></html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
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
    // Stripe firma el cuerpo tal cual llega: se lee sin convertir a JSON
    if (req.method === 'POST' && path === '/pagos/webhook') return await webhook(req, res);
    if (req.method === 'GET' && path === '/pagos/regreso') return paymentReturn(res, url.searchParams.get('estado'));
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
