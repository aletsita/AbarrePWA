// Pide y recoge: estados de un pedido y sus textos. ÚNICO lugar donde se definen.
// Un pedido solo avanza, una etapa a la vez: pendiente → preparando → listo → entregado.
// Mientras no se entrega, la caja puede cancelarlo. Si se agotó un producto, en lugar de cancelarlo le avisa
// al cliente (issue): el pedido sigue en pie y el cliente cambia ese producto por otro, lo quita o cancela.
import type { CashMethod, SaleItem } from './models';

export type OrderStatus = 'pendiente' | 'preparando' | 'listo' | 'entregado' | 'cancelado';

// Etapas en orden (cancelado no es una etapa: sale de cualquiera antes de entregado)
export const ORDER_STATUSES: OrderStatus[] = ['pendiente', 'preparando', 'listo', 'entregado'];

// Nombres de «Estados de un pedido» (marca/README)
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  preparando: 'Haciendo',
  listo: 'Pedido listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

// cliente: lo canceló el cliente desde su app (por ejemplo, después de que se agotó un producto)
export type CancelReason = 'sin-existencia' | 'otro' | 'cliente';

export const CANCEL_REASON_LABEL: Record<CancelReason, string> = {
  'sin-existencia': 'Falta de existencia',
  otro: 'Otro motivo',
  cliente: 'El cliente lo canceló',
};

// La caja avisó que se agotaron estos productos (ids). Mientras esté, el pedido espera al cliente.
export interface OrderIssue {
  missing: string[];
  at: string;
}

// Por qué la caja canceló el pedido. `missing`: productos que se agotaron (ids). El cliente lo ve en su app.
export interface OrderCancel {
  reason: CancelReason;
  missing: string[];
  note?: string;
  at: string;
}

// Botón con el que la caja lleva el pedido a la siguiente etapa
export const ORDER_NEXT_ACTION: Record<Exclude<OrderStatus, 'entregado' | 'cancelado'>, string> = {
  pendiente: 'Empezar a preparar',
  preparando: 'Marcar listo',
  listo: 'Entregar y cobrar',
};

// Textos del aviso al cliente (los usará la notificación push cuando exista la API)
export function orderNoticeText(status: OrderStatus, folio: string) {
  switch (status) {
    case 'pendiente':
      return `Recibimos tu pedido ${folio}`;
    case 'preparando':
      return `Estamos preparando tu pedido ${folio}`;
    case 'listo':
      return `Tu pedido ${folio} está listo para recoger`;
    case 'entregado':
      return `Pedido ${folio} entregado`;
    case 'cancelado':
      return `La tienda canceló tu pedido ${folio}`;
  }
}

// Estados en los que el pedido aparta existencia
export const ACTIVE_STATUSES: OrderStatus[] = ['pendiente', 'preparando', 'listo'];

// Formas de pago al recoger un pedido que no se pagó en la app (no hay crédito)
export const PICKUP_METHODS: CashMethod[] = ['efectivo', 'tarjeta', 'transferencia'];

// Pago en línea del pedido, como lo confirma el servidor (webhook de Stripe)
export interface OnlinePayment {
  method: 'en_linea';
  status: 'pendiente_de_pago' | 'pagado' | 'fallido' | 'por_reembolsar' | 'reembolsado';
  amount?: number;
  paidAt?: string;
}

export const isPaidOnline = (o: Pick<PickupOrder, 'online'>) => o.online?.status === 'pagado';

export function nextStatus(status: OrderStatus): OrderStatus | null {
  const i = ORDER_STATUSES.indexOf(status);
  return i >= 0 && i < ORDER_STATUSES.length - 1 ? ORDER_STATUSES[i + 1] : null;
}

// Folio legible: 1 → "P-0001"
export const orderFolio = (n: number) => `P-${String(n).padStart(4, '0')}`;

export interface PickupOrder {
  id: string;
  folio: string;
  customer: { name: string; phone: string };
  items: SaleItem[];
  note: string;
  total: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
  // Lo que se cobró al entregar (en_linea: ya venía pagado)
  payment?: { method: CashMethod; received: number };
  // Pagado en la app: la caja no cobra, solo pide el código
  online?: OnlinePayment;
  saleId?: string;
  cancel?: OrderCancel;
  issue?: OrderIssue;
  // Cuándo el cliente cambió los productos del pedido (después de un aviso de producto agotado)
  editedAt?: string;
  // Código para recoger: lo genera el servidor al confirmarse el pago (antes, el teléfono: 6 dígitos).
  // La caja NUNCA lo muestra, solo lo compara al entregar; el servidor lo vuelve a revisar.
  pickupCode?: string;
}

// Lo que manda el celular del cliente. Los precios que traiga no se usan: la caja los recalcula.
export interface OrderRequest {
  id: string;
  customer: { name: string; phone: string };
  items: { productId: string; qty: number }[];
  note?: string;
  at: number;
  pickupCode: string; // 6 caracteres del servidor (o 6 dígitos de pedidos anteriores)
  payment?: OnlinePayment;
}

// Piezas apartadas por pedidos que aún no se entregan, por producto
export function reservedStock(orders: PickupOrder[], exceptId?: string) {
  const map: Record<string, number> = {};
  for (const o of orders) {
    if (o.id === exceptId || !ACTIVE_STATUSES.includes(o.status)) continue;
    for (const i of o.items) map[i.productId] = (map[i.productId] ?? 0) + i.qty;
  }
  return map;
}

// Código para recoger: 6 caracteres sin letras que se confundan (sin O/0 ni I/1), o 6 dígitos de los
// pedidos anteriores al pago en línea
export const PICKUP_CODE = /^(?:[A-HJ-NP-Z2-9]{6}|\d{6})$/;
export const cleanPickupCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

// Lo que la caja recibe al entregar: el código escrito o el QR del teléfono
// (abarre:recoger:<id del pedido>:<código>), ya sea por cámara o por un lector USB que "teclea".
export function parsePickupInput(raw: string): { code: string; orderId?: string } | null {
  const text = raw.trim();
  const qr = /^abarre:recoger:([^:\s]+):([a-z0-9]{6})$/i.exec(text);
  if (qr) return { orderId: qr[1], code: qr[2].toUpperCase() };
  const code = text.replace(/[\s-]/g, '').toUpperCase();
  return PICKUP_CODE.test(code) ? { code } : null;
}
