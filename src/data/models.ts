import type { SaleType } from '../domain/weight';

// en_linea: pedido pagado en la app (Stripe); al entregarlo no se cobra
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'credito' | 'en_linea';

// Formas de pago con las que entra dinero (las ventas a crédito no traen dinero, los abonos sí)
export type CashMethod = Exclude<PaymentMethod, 'credito'>;

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  barcode: string;
  // Por pieza (sin valor) o por peso: precio por kg y existencia en kg con 3 decimales
  saleType?: SaleType;
  photo?: string;
  // Borrado lógico (fecha ISO): no se vende ni se muestra, pero las ventas y cortes que lo nombran siguen igual
  deletedAt?: string;
  // Texto que ven los clientes en el detalle del producto
  description?: string;
  // Pide y recoge: si aparece en el catálogo de la app de clientes (sin valor = sí)
  showInApp?: boolean;
}

export interface SaleItem {
  productId: string;
  name: string;
  // Piezas, o kilos con 3 decimales si `saleType` es peso (entonces `price` es por kg)
  qty: number;
  price: number;
  saleType?: SaleType;
}

export interface Sale {
  id: string;
  folio: number;
  date: string;
  items: SaleItem[];
  total: number;
  method: PaymentMethod;
  employee: string;
  paid?: number;
  pending?: boolean;
  customerId?: string;
  customerName?: string;
  // Pide y recoge: la venta viene de un pedido entregado (sin origen = venta en tienda)
  origin?: SaleOrigin;
  orderId?: string;
  orderFolio?: string;
  // Serie de la caja (A) o de los pedidos (P) y turno al que pertenece (los da el servidor)
  serie?: string;
  turnoId?: string;
}

export type SaleOrigin = 'tienda' | 'pedido';
export const ORIGIN_LABEL: Record<SaleOrigin, string> = { tienda: 'En tienda', pedido: 'Pide y recoge' };
export const saleOrigin = (s: Sale): SaleOrigin => s.origin ?? 'tienda';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  creditLimit: number;
  balance: number;
  note: string;
  createdAt: string;
}

// cargo: compra a crédito (sube el saldo) · abono: pago del cliente (lo baja)
export type CreditMovementType = 'cargo' | 'abono';

export interface CreditMovement {
  id: string;
  customerId: string;
  type: CreditMovementType;
  amount: number;
  date: string;
  employee: string;
  note: string;
  saleId?: string;
  method?: CashMethod;
}

export type MovementType = 'venta' | 'entrada' | 'ajuste' | 'alta';

export interface Movement {
  id: string;
  productId: string;
  type: MovementType;
  qty: number;
  date: string;
  note: string;
}

export type CashMovementType = 'entrada' | 'retiro' | 'gasto';

export interface CashMovement {
  id: string;
  type: CashMovementType;
  amount: number;
  note: string;
  date: string;
  employee: string;
}

export interface Shift {
  // Id del turno en el servidor (sin id: no hay turno abierto en esta caja)
  id?: string;
  name: string;
  register: string;
  openedAt: string;
  openedBy: string;
  openingFund: number;
}

export interface CashCut {
  id: string;
  folio: number;
  date: string;
  shift: string;
  employee: string;
  openingFund: number;
  salesTotal: number;
  salesCount: number;
  cashSales: number;
  cardSales: number;
  transferSales: number;
  // Pedidos pagados en la app: entran en ventas pero no en el efectivo de la caja
  onlineSales?: number;
  creditSales?: number;
  creditPaid?: number;
  creditCash?: number;
  // Desglose por origen (los cortes anteriores a Pide y recoge no lo traen)
  storeSales?: number;
  pickupSales?: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  countedCash: number;
  turnoId?: string;
  cajaId?: string;
}

export interface Device {
  id: string;
  name: string;
  model: string;
  owner: string;
  lastSeen: string;
  register: string;
}

export interface Store {
  name: string;
  owner: string;
  email: string;
  phone: string;
  address: string;
  rfc: string;
  // Nombre de la caja de este equipo
  register: string;
  // La tienda recibe pedidos de la app
  acceptsOrders?: boolean;
}

export interface TicketConfig {
  header: string;
  footer: string;
  showLogo: boolean;
  showEmployee: boolean;
}

export type Role = 'Dueño' | 'Cajero' | 'Inventario';

export interface User {
  // Id en el servidor (sin id: todavía no se guarda)
  id?: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  // Ya creó su contraseña (si no, la crea al registrarse en la app con ese correo)
  hasPassword?: boolean;
}

export const ROLES: Role[] = ['Dueño', 'Cajero', 'Inventario'];

export const CATEGORIES = [
  'Abarrotes', 'Bebidas', 'Botanas', 'Lácteos', 'Panadería', 'Tortillería', 'Limpieza', 'Galletas', 'Enlatados', 'Otros',
];

// Las de siempre más las propias que ya usan los productos (una categoría nueva es solo el nombre en el producto)
export function categoryList(products: { category: string }[], extra: string[] = []) {
  const own = [...products.map((p) => p.category), ...extra].map((c) => c.trim()).filter(Boolean);
  const known = new Set(CATEGORIES.map((c) => c.toLocaleLowerCase('es')));
  const added = [...new Map(own.filter((c) => !known.has(c.toLocaleLowerCase('es'))).map((c) => [c.toLocaleLowerCase('es'), c])).values()];
  return [...CATEGORIES.filter((c) => c !== 'Otros'), ...added.sort((a, b) => a.localeCompare(b, 'es')), 'Otros'];
}

const CATEGORY_COLOR: Record<string, string> = {
  Abarrotes: '#7a5232',
  Bebidas: '#1f5a80',
  Botanas: '#b4541a',
  Lácteos: '#466783',
  Panadería: '#94661c',
  Tortillería: '#6d6d22',
  Limpieza: '#24705f',
  Galletas: '#87455a',
  Enlatados: '#9c3626',
  Otros: '#55534e',
};

export const categoryColor = (c: string) => CATEGORY_COLOR[c] ?? CATEGORY_COLOR.Otros;

export type StockLevel = 'ok' | 'poco' | 'sin';

export function stockLevel(p: Product): StockLevel {
  if (p.stock <= 0) return 'sin';
  if (p.stock <= p.minStock) return 'poco';
  return 'ok';
}

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export const money = (n: number) => mxn.format(n);

export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true });

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

export const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^\d/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || name.slice(0, 2).toUpperCase();

export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  credito: 'Crédito',
  en_linea: 'En línea',
};

export const availableCredit = (c: Customer) => Math.max(0, c.creditLimit - c.balance);

// UUID v4: el servidor usa estos id tal cual (ventas, clientes, productos…), así no se duplican al reintentar.
// crypto.randomUUID solo existe en contextos seguros (https o localhost); en la red local se arma a mano.
export const uid = (): string => {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
