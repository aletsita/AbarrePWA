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
  for (const l of lines) map[l.productId] = (map[l.productId] ?? 0) + l.qty;
  return map;
}

export function availableStock(stock: number, reserved = 0, inAccounts = 0): number {
  return Math.max(0, Math.floor(stock - reserved - inAccounts));
}

// Cuántas piezas se pueden agregar de verdad: `limited` avisa que se pidió más de lo que hay
export function clampToAvailable(requested: number, available: number): { qty: number; limited: boolean } {
  const want = Math.max(0, Math.floor(requested));
  const qty = Math.min(want, Math.max(0, available));
  return { qty, limited: qty < want };
}

export const piecesLabel = (n: number) => `${n} ${n === 1 ? 'pieza' : 'piezas'}`;
export const availableLabel = (n: number) => `${piecesLabel(n)} ${n === 1 ? 'disponible' : 'disponibles'}`;

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
