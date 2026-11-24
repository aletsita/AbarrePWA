// Pruebas del servidor: node --test server/
// Inventario (apartado, descuento, carrera por la última pieza, 409 con detalle) y pago en línea
// (webhook firmado, repetido, fallido, sin existencia, código para recoger).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'tendero-api-'));
process.env.API_DATA = join(dir, 'api.json');
process.env.STRIPE_SECRET_KEY = 'sk_test_prueba';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_prueba';
process.env.PUBLIC_API_URL = 'http://tienda.test';

const { api, connectRelay, gate, onRelayMessage, onPaymentEvent } = await import('./api.js');
const { setPaymentsFetch, signPayload } = await import('./payments.js');

// ---------- caja de mentiras ----------

let caja;
function resetCaja() {
  caja = {
    store: { name: 'Prueba' },
    closedCutId: null,
    products: [
      { id: 'leche', name: 'Leche', price: 30, stock: 1, category: 'Lácteos' },
      { id: 'pan', name: 'Pan', price: 10, stock: 50, category: 'Panadería' },
    ],
    users: [],
    orders: [],
    sales: [],
  };
}
// Las ventas que el servidor aprobó: una caja real las trae en su SNAPSHOT
const approved = [];
const snapshot = () => onRelayMessage({ type: 'SNAPSHOT', data: { ...structuredClone(caja), sales: approved.map((id) => ({ id })) } });

// Lo que la API publica en el canal. La caja de mentiras responde WHO con su SNAPSHOT y acepta los pedidos.
const published = [];
// Como la caja real: el borrado aprobado se guarda y viaja en su próximo SNAPSHOT
const applyDelete = (msg) => {
  const p = caja.products.find((x) => x.id === msg.id);
  if (p) Object.assign(p, { deletedAt: new Date(msg.at).toISOString(), showInApp: false });
};
connectRelay((msg) => {
  published.push(msg);
  if (msg.type === 'WHO') setImmediate(snapshot);
  if (msg.type === 'DELETE_PRODUCT') applyDelete(msg);
  if (msg.type === 'ORDER_RECEIVED') {
    const r = msg.request;
    caja.orders.unshift({ id: r.id, folio: `P-${String(caja.orders.length + 1).padStart(4, '0')}`, status: 'pendiente', items: r.items.map((i) => ({ ...i, name: i.productId, price: 0 })), total: 0, online: r.payment });
  }
});

// Lo mismo que hace index.js con cada POST al canal
function relay(msg) {
  const denied = gate(msg);
  if (denied) return denied;
  if (msg.sale?.id) {
    approved.push(msg.sale.id);
    // Como la caja real: la venta aprobada descuenta su stock, así su próximo SNAPSHOT ya lo trae
    for (const i of msg.sale.items ?? []) {
      const p = caja.products.find((x) => x.id === i.productId);
      if (p) p.stock -= i.qty;
    }
  }
  if (msg.type === 'DELETE_PRODUCT') applyDelete(msg);
  onRelayMessage(msg);
  return { status: 204 };
}

let saleN = 0;
const sale = (id, items) => ({ type: 'CONFIRM_SALE', sale: { id: `${id}-${++saleN}`, folio: 1, date: new Date().toISOString(), items, total: 0, method: 'efectivo' } });

// ---------- HTTP de la API ----------

let base;
const server = createServer((req, res) => void api(req, res));
before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

async function call(method, path, { token, body, headers } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

let n = 0;
async function newClient() {
  n += 1;
  const r = await call('POST', '/auth/registro', { body: { name: 'Cliente', email: `c${n}@prueba.mx`, phone: '5512345678', password: 'secreta123' } });
  assert.equal(r.status, 201);
  return r.data.token;
}

// Stripe de mentiras: guarda lo que se le pidió y regresa una sesión por llave de idempotencia
const stripeCalls = [];
// Sesiones que Stripe ya cobró (para probar el respaldo cuando no llega el webhook)
const paidSessions = new Set();
setPaymentsFetch(async (url, init = {}) => {
  if (!init.method) {
    const id = decodeURIComponent(url.split('/').pop());
    return new Response(JSON.stringify({ id, status: paidSessions.has(id) ? 'complete' : 'open', payment_status: paidSessions.has(id) ? 'paid' : 'unpaid', payment_intent: `pi_${id}`, amount_total: 1000 }), { status: 200 });
  }
  const key = init.headers['Idempotency-Key'];
  stripeCalls.push({ url, key, body: new URLSearchParams(init.body) });
  return new Response(JSON.stringify({ id: `cs_${key}`, client_secret: `cs_${key}_secret_prueba`, expires_at: Math.floor(Date.now() / 1000) + 1800 }), { status: 200 });
});

function stripeEvent(type, order, extra = {}) {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type,
    data: { object: { id: `cs_checkout-${order.id}-1`, client_reference_id: order.id, metadata: { orderId: order.id }, payment_status: 'paid', payment_intent: `pi_${order.id}`, amount_total: Math.round(order.total * 100), ...extra } },
  };
}

async function postWebhook(event, secret = 'whsec_prueba') {
  const raw = JSON.stringify(event);
  return call('POST', '/pagos/webhook', { body: raw, headers: { 'Stripe-Signature': signPayload(raw, secret) } });
}

async function newPaidableOrder(token, items = [{ productId: 'pan', qty: 2, price: 10 }]) {
  const total = items.reduce((t, i) => t + i.qty * i.price, 0);
  const r = await call('POST', '/pedidos', { token, body: { items, note: '', expectedTotal: total }, headers: { 'Idempotency-Key': `k-${Math.random()}` } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}

beforeEach(() => {
  resetCaja();
  snapshot();
  onRelayMessage({ type: 'PING', key: 'panel' });
});

// ---------- inventario ----------

describe('inventario disponible', () => {
  test('dos cobros de la última pieza: solo pasa uno y el otro recibe 409 con el detalle', () => {
    const a = relay(sale('v-a', [{ productId: 'leche', qty: 1 }]));
    const b = relay(sale('v-b', [{ productId: 'leche', qty: 1 }]));
    assert.equal(a.status, 204);
    assert.equal(b.status, 409);
    assert.equal(b.body.code, 'sin-stock');
    assert.deepEqual(b.body.faltantes, [{ productId: 'leche', name: 'Leche', requested: 1, available: 0, missing: 1 }]);
  });

  test('lo apartado por un pedido no se puede cobrar en caja', () => {
    caja.products[1].stock = 5;
    caja.orders = [{ id: 'o1', folio: 'P-0001', status: 'pendiente', items: [{ productId: 'pan', qty: 4 }], total: 40 }];
    snapshot();
    assert.equal(relay(sale('v-1', [{ productId: 'pan', qty: 2 }])).status, 409);
    assert.equal(relay(sale('v-2', [{ productId: 'pan', qty: 1 }])).status, 204);
  });

  test('empezar a preparar sin existencia se rechaza, dice qué falta y no aparta nada', () => {
    caja.products[1].stock = 1;
    caja.orders = [{ id: 'o1', folio: 'P-0001', status: 'pendiente', items: [{ productId: 'pan', qty: 3 }, { productId: 'leche', qty: 1 }], total: 60 }];
    snapshot();
    // El pedido ya apartaba 3 panes pero solo hay 1 (por un ajuste de inventario)
    const r = relay({ type: 'ORDER_ADVANCE', id: 'o1', from: 'pendiente', at: Date.now() });
    assert.equal(r.status, 409);
    assert.deepEqual(r.body.faltantes.map((f) => [f.productId, f.missing]), [['pan', 2]]);
    // No avanzó: sigue en pendiente
    assert.equal(relay({ type: 'ORDER_ADVANCE', id: 'o1', from: 'pendiente', at: Date.now() }).status, 409);
  });

  test('al cancelar un pedido se libera lo apartado', () => {
    caja.orders = [{ id: 'o1', folio: 'P-0001', status: 'pendiente', items: [{ productId: 'leche', qty: 1 }], total: 30 }];
    snapshot();
    assert.equal(relay(sale('v-1', [{ productId: 'leche', qty: 1 }])).status, 409);
    relay({ type: 'ORDER_CANCEL', id: 'o1', reason: 'otro', missing: [], at: Date.now() });
    assert.equal(relay(sale('v-2', [{ productId: 'leche', qty: 1 }])).status, 204);
  });

  test('al entregar, lo apartado se vuelve descuento real y se avisa por el canal', () => {
    caja.products[1].stock = 5;
    caja.orders = [{ id: 'o1', folio: 'P-0001', status: 'listo', items: [{ productId: 'pan', qty: 2 }], total: 20 }];
    snapshot();
    published.length = 0;
    const r = relay({ type: 'ORDER_DELIVER', id: 'o1', pickupCode: '', sale: { id: 'pedido-o1', orderId: 'o1', items: [{ productId: 'pan', qty: 2 }], method: 'efectivo' }, payment: {} });
    assert.equal(r.status, 204);
    const stock = published.find((m) => m.type === 'STOCK');
    assert.deepEqual(stock.items, [{ productId: 'pan', stock: 3, reserved: 0 }]);
    // Ya no hay apartado: se pueden vender los 3 que quedan
    assert.equal(relay(sale('v-1', [{ productId: 'pan', qty: 3 }])).status, 204);
  });

  test('un SNAPSHOT armado antes de una venta aprobada no regresa la existencia', () => {
    assert.equal(relay(sale('v-stale', [{ productId: 'leche', qty: 1 }])).status, 204);
    const late = approved.pop(); // la caja aún no tenía la venta
    snapshot();
    assert.equal(relay(sale('v-2', [{ productId: 'leche', qty: 1 }])).status, 409);
    approved.push(late);
  });
});

// ---------- carrera real por HTTP (servidor completo) ----------

test('carrera por HTTP: dos cobros simultáneos de la última pieza en el servidor real', async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [fileURLToPath(new URL('./index.js', import.meta.url))], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', API_DATA: join(dir, 'race.json'), DIST_DIR: join(dir, 'sin-dist') },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    await new Promise((resolve) => child.stdout.once('data', resolve));
    const url = `http://127.0.0.1:${port}/__sync`;
    const post = (msg) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Math.random().toString(), from: 'prueba', msg }) });
    resetCaja();
    await post({ type: 'SNAPSHOT', data: caja });
    const results = await Promise.all([post(sale('v-a', [{ productId: 'leche', qty: 1 }])), post(sale('v-b', [{ productId: 'leche', qty: 1 }]))]);
    assert.deepEqual(results.map((r) => r.status).sort(), [204, 409]);
  } finally {
    child.kill();
  }
});

// ---------- pago en línea ----------

describe('pago en línea', () => {
  test('el pedido nace sin pagar: no aparta, no llega a la caja y no se puede preparar', async () => {
    const token = await newClient();
    published.length = 0;
    const o = await newPaidableOrder(token);
    assert.equal(o.payment.status, 'pendiente_de_pago');
    assert.match(o.paymentClientSecret, /_secret_/);
    assert.equal(stripeCalls.at(-1).body.get('ui_mode'), 'embedded_page');
    assert.equal(stripeCalls.at(-1).body.get('redirect_on_completion'), 'never');
    assert.equal(o.pickupCode, undefined);
    assert.equal(published.some((m) => m.type === 'ORDER_RECEIVED'), false);
    // El monto lo pone el servidor: 2 × $10 = 1000 centavos
    const body = stripeCalls.at(-1).body;
    assert.equal(body.get('line_items[0][price_data][unit_amount]'), '1000');
    assert.equal(body.get('line_items[0][quantity]'), '2');
    // Un pedido sin pagar no se puede empezar a preparar aunque llegara a la caja
    caja.orders.unshift({ id: o.id, folio: 'P-9', status: 'pendiente', items: o.items, total: o.total, online: o.payment });
    snapshot();
    assert.equal(relay({ type: 'ORDER_ADVANCE', id: o.id, from: 'pendiente', at: Date.now() }).body.code, 'pago-pendiente');
  });

  test('webhook con firma inválida se rechaza y no cambia el pedido', async () => {
    const token = await newClient();
    const o = await newPaidableOrder(token);
    const r = await postWebhook(stripeEvent('checkout.session.completed', o), 'whsec_otra');
    assert.equal(r.status, 400);
    const now = await call('GET', `/pedidos/${o.id}`, { token });
    assert.equal(now.data.payment.status, 'pendiente_de_pago');
  });

  test('webhook firmado marca pagado, genera el código y manda el pedido a la caja; repetido no hace nada', async () => {
    const token = await newClient();
    const o = await newPaidableOrder(token);
    published.length = 0;
    const event = stripeEvent('checkout.session.completed', o);
    const r = await postWebhook(event);
    assert.equal(r.status, 200);
    const paid = (await call('GET', `/pedidos/${o.id}`, { token })).data;
    assert.equal(paid.payment.status, 'pagado');
    assert.equal(paid.payment.amount, 20);
    assert.match(paid.pickupCode, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(published.filter((m) => m.type === 'ORDER_RECEIVED').length, 1);
    // Ahora sí aparta: los 2 panes del pedido ya no se pueden vender en caja
    const short = relay(sale('v-x', [{ productId: 'pan', qty: 50 }]));
    assert.equal(short.status, 409);
    assert.ok(short.body.faltantes[0].missing >= 2);

    const again = await postWebhook(event);
    assert.equal(again.data.repetido, true);
    assert.equal(published.filter((m) => m.type === 'ORDER_RECEIVED').length, 1);
  });

  test('pago vencido queda fallido y reintentar crea otra sesión; reintentar con la sesión abierta no', async () => {
    const token = await newClient();
    const o = await newPaidableOrder(token);
    const same = await call('POST', `/pedidos/${o.id}/pagar`, { token });
    assert.equal(same.data.paymentClientSecret, o.paymentClientSecret);
    await postWebhook(stripeEvent('checkout.session.expired', o, { payment_status: 'unpaid' }));
    const failed = (await call('GET', `/pedidos/${o.id}`, { token })).data;
    assert.equal(failed.payment.status, 'fallido');
    const retry = await call('POST', `/pedidos/${o.id}/pagar`, { token });
    assert.equal(retry.status, 200);
    assert.notEqual(retry.data.paymentClientSecret, o.paymentClientSecret);
    assert.equal(retry.data.payment.status, 'pendiente_de_pago');
  });

  test('misma llave de idempotencia: mismo pedido y misma sesión de pago', async () => {
    const token = await newClient();
    const body = { items: [{ productId: 'pan', qty: 1, price: 10 }], note: '', expectedTotal: 10 };
    const a = await call('POST', '/pedidos', { token, body, headers: { 'Idempotency-Key': 'repetida' } });
    const b = await call('POST', '/pedidos', { token, body, headers: { 'Idempotency-Key': 'repetida' } });
    assert.equal(a.data.id, b.data.id);
    assert.equal(a.data.paymentClientSecret, b.data.paymentClientSecret);
  });

  test('pagado pero ya sin existencia: se cancela y queda por reembolsar', async () => {
    const token = await newClient();
    const o = await newPaidableOrder(token, [{ productId: 'leche', qty: 1, price: 30 }]);
    // Mientras pagaba, la caja vendió la última leche
    assert.equal(relay(sale('v-1', [{ productId: 'leche', qty: 1 }])).status, 204);
    await postWebhook(stripeEvent('checkout.session.completed', o));
    const r = (await call('GET', `/pedidos/${o.id}`, { token })).data;
    assert.equal(r.status, 'cancelado');
    assert.equal(r.payment.status, 'por_reembolsar');
    assert.equal(r.cancel.reason, 'sin-existencia');
    assert.equal(r.pickupCode, undefined);
  });

  test('código para recoger: incorrecto no entrega, se bloquea a los 5 intentos y solo sirve una vez', async () => {
    const token = await newClient();
    const o = await newPaidableOrder(token);
    await postWebhook(stripeEvent('checkout.session.completed', o));
    const code = (await call('GET', `/pedidos/${o.id}`, { token })).data.pickupCode;
    const c = caja.orders.find((x) => x.id === o.id);
    c.status = 'listo';
    snapshot();
    const deliver = (pickupCode, method = 'en_linea') =>
      relay({ type: 'ORDER_DELIVER', id: o.id, pickupCode, sale: { id: `pedido-${o.id}`, orderId: o.id, items: o.items, method }, payment: { method, received: o.total } });

    // Pagado en línea: no se puede cobrar otra vez en efectivo
    assert.equal(deliver(code, 'efectivo').body.code, 'metodo-pago');
    const wrong = deliver('ZZZZZZ');
    assert.equal(wrong.status, 422);
    assert.equal(wrong.body.intentos, 4);
    for (let i = 0; i < 3; i++) assert.equal(deliver('ZZZZZZ').status, 422);
    const locked = deliver('ZZZZZZ');
    assert.equal(locked.status, 423);
    // Bloqueado: ni el código correcto pasa por ahora
    assert.equal(deliver(code).status, 423);
  });

  test('código correcto entrega una vez; usarlo otra vez no sirve', async () => {
    const token = await newClient();
    const o = await newPaidableOrder(token);
    await postWebhook(stripeEvent('checkout.session.completed', o));
    const code = (await call('GET', `/pedidos/${o.id}`, { token })).data.pickupCode;
    caja.orders.find((x) => x.id === o.id).status = 'listo';
    snapshot();
    const msg = { type: 'ORDER_DELIVER', id: o.id, pickupCode: code.toLowerCase(), sale: { id: `pedido-${o.id}`, orderId: o.id, items: o.items, method: 'en_linea' }, payment: { method: 'en_linea', received: o.total } };
    assert.equal(relay(msg).status, 204);
    const done = (await call('GET', `/pedidos/${o.id}`, { token })).data;
    assert.equal(done.status, 'entregado');
    assert.equal(relay(msg).body.code, 'codigo-usado');
  });

  test('si el webhook no llega, el servidor le pregunta a Stripe al consultar el pedido', async () => {
    const token = await newClient();
    const o = await newPaidableOrder(token, [{ productId: 'pan', qty: 1, price: 10 }]);
    paidSessions.add(`cs_checkout-${o.id}-1`);
    const r = (await call('GET', `/pedidos/${o.id}`, { token })).data;
    assert.equal(r.payment.status, 'pagado');
    assert.match(r.pickupCode, /^[A-HJ-NP-Z2-9]{6}$/);
  });

  test('evento de pago sin pedido conocido se ignora', () => {
    assert.equal(onPaymentEvent({ id: 'evt_x', type: 'checkout.session.completed', data: { object: { metadata: { orderId: 'nada' } } } }), true);
  });
});

// ---------- borrado lógico y catálogo en vivo ----------

// Personal de la tienda: su correo está entre los usuarios activos de la caja
async function newStaff() {
  n += 1;
  const email = `p${n}@prueba.mx`;
  caja.users = [...caja.users, { name: 'Cajera', email, role: 'Cajero', active: true }];
  snapshot();
  const r = await call('POST', '/auth/registro', { body: { name: 'Cajera', email, phone: '5512345678', password: 'secreta123' } });
  assert.equal(r.status, 201);
  return r.data.token;
}

// Abre el SSE de un cliente y junta los eventos `catalogo` que lleguen
async function watchCatalog(token) {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/pedidos/eventos?token=${token}`, { signal: ctrl.signal });
  const events = [];
  const reader = res.body.getReader();
  let buf = '';
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += new TextDecoder().decode(value);
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (block.startsWith('event: catalogo')) events.push(JSON.parse(block.split('\ndata: ')[1]));
        }
      }
    } catch {
      /* cerrado */
    }
  })();
  return { events, close: () => ctrl.abort() };
}
const tick = () => new Promise((r) => setTimeout(r, 60));

describe('borrar productos', () => {
  test('un cliente recibe 403 y el producto sigue en el catálogo', async () => {
    const token = await newClient();
    const r = await call('DELETE', '/productos/pan', { token });
    assert.equal(r.status, 403);
    assert.ok((await call('GET', '/catalogo', { token })).data.some((p) => p.id === 'pan'));
  });

  test('el personal lo borra: sale del catálogo y se avisa a la caja por el canal', async () => {
    // Producto nuevo: los pedidos de otras pruebas no lo apartan
    caja.products.push({ id: 'sal', name: 'Sal', price: 15, stock: 4, category: 'Abarrotes' });
    const staff = await newStaff();
    const token = await newClient();
    published.length = 0;
    const r = await call('DELETE', '/productos/sal', { token: staff });
    assert.equal(r.status, 204);
    assert.ok(published.some((m) => m.type === 'DELETE_PRODUCT' && m.id === 'sal'));
    assert.ok(!(await call('GET', '/catalogo', { token })).data.some((p) => p.id === 'sal'));
    // Otra vez: ya no existe
    assert.equal((await call('DELETE', '/productos/sal', { token: staff })).status, 404);
  });

  test('no se borra lo que está en una cuenta abierta ni lo apartado en un pedido', async () => {
    const staff = await newStaff();
    caja.ticket = [{ product: { id: 'leche' }, qty: 1 }];
    caja.products.push({ id: 'miel', name: 'Miel', price: 60, stock: 3, category: 'Abarrotes' });
    caja.orders = [{ id: 'o9', folio: 'P-0009', status: 'listo', items: [{ productId: 'miel', qty: 1 }], total: 60 }];
    snapshot();
    const a = await call('DELETE', '/productos/leche', { token: staff });
    assert.equal(a.status, 409);
    assert.equal(a.data.code, 'producto-en-uso');
    const b = relay({ type: 'DELETE_PRODUCT', id: 'miel', at: Date.now() });
    assert.equal(b.status, 409);
    assert.match(b.body.message, /P-0009/);
  });

  test('desde la caja pasa por la revisión; un cambio atrasado no lo revive', async () => {
    caja.products.push({ id: 'te', name: 'Té', price: 20, stock: 2, category: 'Abarrotes' });
    snapshot();
    const token = await newClient();
    assert.equal(relay({ type: 'DELETE_PRODUCT', id: 'te', at: Date.now() }).status, 204);
    relay({ type: 'UPSERT_PRODUCT', product: { id: 'te', name: 'Té', price: 21, stock: 2, category: 'Abarrotes' }, isNew: false, at: Date.now() });
    assert.ok(!(await call('GET', '/catalogo', { token })).data.some((p) => p.id === 'te'));
  });
});

describe('catálogo en vivo', () => {
  test('cambio de precio, producto oculto y producto borrado llegan como evento catalogo', async () => {
    const token = await newClient();
    const live = await watchCatalog(token);
    await tick();
    relay({ type: 'UPSERT_PRODUCT', product: { ...caja.products[1], price: 12 }, isNew: false, at: Date.now() });
    relay({ type: 'UPSERT_PRODUCT', product: { ...caja.products[0], showInApp: false }, isNew: false, at: Date.now() });
    relay({ type: 'UPSERT_PRODUCT', product: { id: 'cafe', name: 'Café', price: 50, stock: 3, category: 'Abarrotes' }, isNew: true, at: Date.now() });
    relay({ type: 'DELETE_PRODUCT', id: 'cafe', at: Date.now() });
    await tick();
    live.close();
    // La existencia la ponen los pedidos de otras pruebas; aquí importa lo que cambió
    const { stock: _stock, ...pan } = live.events[0].productos[0];
    assert.deepEqual(pan, { id: 'pan', name: 'Pan', category: 'Panadería', price: 12 });
    assert.equal(live.events[0].productos.length, 1);
    assert.deepEqual(live.events[1], { productos: [], quitados: ['leche'] });
    assert.equal(live.events[2].productos[0].id, 'cafe');
    assert.deepEqual(live.events[3], { productos: [], quitados: ['cafe'] });
  });

  test('un cambio de existencia no manda catalogo (va en inventario)', async () => {
    const token = await newClient();
    const live = await watchCatalog(token);
    await tick();
    relay({ type: 'ADD_STOCK', entries: [{ productId: 'pan', qty: 5 }], at: Date.now(), note: '' });
    await tick();
    live.close();
    assert.equal(live.events.length, 0);
  });
});
