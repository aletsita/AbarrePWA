export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'credito';

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
  photo?: string;
  // Texto que ven los clientes en el detalle del producto
  description?: string;
  // Pide y recoge: si aparece en el catálogo de la app de clientes (sin valor = sí)
  showInApp?: boolean;
}

export interface SaleItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
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
  register: string;
}

export interface TicketConfig {
  header: string;
  footer: string;
  showLogo: boolean;
  showEmployee: boolean;
}

export type Role = 'Dueño' | 'Cajero' | 'Inventario';

export interface User {
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export const ROLES: Role[] = ['Dueño', 'Cajero', 'Inventario'];

export const CATEGORIES = [
  'Abarrotes', 'Bebidas', 'Botanas', 'Lácteos', 'Panadería', 'Tortillería', 'Limpieza', 'Galletas', 'Enlatados', 'Otros',
];

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
};

export const availableCredit = (c: Customer) => Math.max(0, c.creditLimit - c.balance);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
