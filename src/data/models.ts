export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia';

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
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
