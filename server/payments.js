// Pago en línea con Stripe Checkout (solo modo de pruebas). Sin SDK: la API de Stripe es HTTP con formularios.
// La tarjeta se captura en la página de Stripe: nunca pasa por la app ni por este servidor.
//
// Variables de entorno (solo en el servidor, nunca en el repositorio):
//   STRIPE_SECRET_KEY      sk_test_...   clave secreta de pruebas
//   STRIPE_WEBHOOK_SECRET  whsec_...     secreto del webhook (lo da `stripe listen` en local)
import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.stripe.com/v1';
const TOLERANCE_S = 300;

let request = (url, init) => fetch(url, init);

// Para las pruebas: reemplaza la llamada HTTP a Stripe
export function setPaymentsFetch(fn) {
  request = fn;
}

const secretKey = () => process.env.STRIPE_SECRET_KEY?.trim() ?? '';
const webhookSecret = () => process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? '';

// Qué falta para cobrar en línea (null = listo). Solo claves de prueba: el paso a producción lo decide la tienda después.
export function paymentsProblem() {
  const key = secretKey();
  if (!key) return 'falta STRIPE_SECRET_KEY.';
  if (!key.startsWith('sk_test_')) return 'STRIPE_SECRET_KEY debe ser una clave de pruebas (sk_test_…).';
  if (!webhookSecret()) return 'falta STRIPE_WEBHOOK_SECRET (lo da `stripe listen`).';
  return null;
}

export const paymentsReady = () => !paymentsProblem();

// Formulario anidado al estilo de Stripe: line_items[0][price_data][currency]=mxn
function form(data, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

class PaymentError extends Error {}

// Crea la sesión de pago. El monto sale de `items` (precios del servidor), nunca de la app.
// `idempotencyKey`: el mismo intento de pago devuelve la misma sesión aunque se reintente la petición.
export async function createCheckout({ orderId, items, successUrl, cancelUrl, idempotencyKey, expiresAt }) {
  const body = form({
    mode: 'payment',
    client_reference_id: orderId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    expires_at: expiresAt,
    metadata: { orderId },
    payment_intent_data: { metadata: { orderId } },
    line_items: items.map((i) => ({
      quantity: i.qty,
      price_data: { currency: 'mxn', unit_amount: Math.round(i.price * 100), product_data: { name: i.name } },
    })),
  });
  let res;
  try {
    res = await request(`${API}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': idempotencyKey,
      },
      body: body.toString(),
    });
  } catch {
    throw new PaymentError('No se pudo contactar al proveedor de pagos.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Solo el mensaje del proveedor: nunca se registran datos del cliente
    console.warn('[pagos] Stripe rechazó la sesión:', data?.error?.message ?? res.status);
    throw new PaymentError('El proveedor de pagos no aceptó la solicitud.');
  }
  return { id: data.id, url: data.url, expiresAt: data.expires_at };
}

// Encabezado Stripe-Signature: t=1700000000,v1=firma[,v1=otra]. La firma es HMAC-SHA256 de `${t}.${cuerpo}`.
export function verifySignature(raw, header, secret = webhookSecret(), now = Math.floor(Date.now() / 1000)) {
  if (!secret || typeof header !== 'string') return false;
  const parts = header.split(',').map((p) => p.split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(now - t) > TOLERANCE_S) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex'));
  return sigs.some((s) => {
    const got = Buffer.from(s);
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

// Para las pruebas y para `stripe trigger`: arma el encabezado de firma de un cuerpo
export function signPayload(raw, secret, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
}

export { PaymentError };
