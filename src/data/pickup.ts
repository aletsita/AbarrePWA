// Pide y recoge: estados de un pedido y sus textos. ÚNICO lugar donde se definen.
// Un pedido solo avanza, una etapa a la vez: pendiente → preparando → listo → entregado.
// Mientras no se entrega, la caja puede cancelarlo (por ejemplo, si se agotó un producto).
import type { CashMethod, SaleItem } from './models';

export type OrderStatus = 'pendiente' | 'preparando' | 'listo' | 'entregado' | 'cancelado';

// Etapas en orden (cancelado no es una etapa: sale de cualquiera antes de entregado)
export const ORDER_STATUSES: OrderStatus[] = ['pendiente', 'preparando', 'listo', 'entregado'];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  preparando: 'Preparando',
  listo: 'Listo para recoger',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

export type CancelReason = 'sin-existencia' | 'otro';

export const CANCEL_REASON_LABEL: Record<CancelReason, string> = {
  'sin-existencia': 'Falta de existencia',
  otro: 'Otro motivo',
};

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
      return `Pedido ${folio} entregado. ¡Gracias!`;
    case 'cancelado':
      return `La tienda canceló tu pedido ${folio}`;
  }
}

// Estados en los que el pedido aparta existencia
export const ACTIVE_STATUSES: OrderStatus[] = ['pendiente', 'preparando', 'listo'];

// Formas de pago al recoger: no hay pago en línea ni crédito
export const PICKUP_METHODS: CashMethod[] = ['efectivo', 'tarjeta', 'transferencia'];

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
  payment?: { method: CashMethod; received: number };
  saleId?: string;
  cancel?: OrderCancel;
  // Código para recoger: lo genera el teléfono del cliente. La caja NUNCA lo muestra, solo lo compara al entregar.
  pickupCode?: string;
}

// Lo que manda el celular del cliente. Los precios que traiga no se usan: la caja los recalcula.
export interface OrderRequest {
  id: string;
  customer: { name: string; phone: string };
  items: { productId: string; qty: number }[];
  note?: string;
  at: number;
  pickupCode: string; // 6 dígitos generados en el teléfono
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

// Lo que la caja recibe al entregar: los 6 dígitos escritos o el QR del teléfono
// (abarre:recoger:<id del pedido>:<código>), ya sea por cámara o por un lector USB que "teclea".
export function parsePickupInput(raw: string): { code: string; orderId?: string } | null {
  const text = raw.trim();
  const qr = /^abarre:recoger:([^:\s]+):(\d{6})$/i.exec(text);
  if (qr) return { orderId: qr[1], code: qr[2] };
  const digits = text.replace(/\s/g, '');
  return /^\d{6}$/.test(digits) ? { code: digits } : null;
}
