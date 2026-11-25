import { qtyLabel, roundQty, type SaleType } from './weight';

// Inventario disponible: lo que hay en la tienda menos lo que ya está comprometido.
// Comprometido = apartado por pedidos + piezas que ya están en cuentas abiertas de la caja.
// Las pantallas lo usan para avisar; la defensa real la hace el servidor al cobrar.

export interface Line {
  productId: string;
  qty: number;
}

// Suma piezas por producto
export function piecesByProduct(lines: Iterable<Line>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const l of lines) map[l.productId] = roundQty((map[l.productId] ?? 0) + l.qty);
  return map;
}

// Piezas enteras o kilos con 3 decimales (sin restos de punto flotante)
export function availableStock(stock: number, reserved = 0, inAccounts = 0): number {
  return Math.max(0, roundQty(stock - reserved - inAccounts));
}

// Cuántas piezas se pueden agregar de verdad: `limited` avisa que se pidió más de lo que hay
// Con `weighed` acepta kilos con 3 decimales; si no, piezas enteras
export function clampToAvailable(requested: number, available: number, weighed = false): { qty: number; limited: boolean } {
  const want = Math.max(0, weighed ? roundQty(requested) : Math.floor(requested));
  const qty = Math.min(want, Math.max(0, available));
  return { qty, limited: qty < want };
}

export const piecesLabel = (n: number, saleType?: SaleType) => qtyLabel(n, saleType);
export const availableLabel = (n: number, saleType?: SaleType) =>
  `${qtyLabel(n, saleType)} ${saleType === 'peso' ? 'disponibles' : n === 1 ? 'disponible' : 'disponibles'}`;

// Lo que falta de un producto, como lo responde el servidor en un 409 (`faltantes`)
export interface Shortfall {
  productId: string;
  name: string;
  requested: number;
  available: number;
  missing: number;
}

export const shortfallText = (list: Shortfall[]) =>
  list.map((s) => `${s.name}: ${s.available ? `solo hay ${availableLabel(s.available)}` : 'no hay disponible'} (faltan ${s.missing})`).join(' · ');
