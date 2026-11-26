// Cliente de AbarreAPI (ver AbarreAPI/README.md): peticiones con el token, tipos que manda la API y
// cómo se convierten a los modelos de la caja (src/data/models.ts). La caja trabaja con sus datos locales y
// solo los cambia con lo que confirma el servidor o con lo que llega en vivo por SignalR.
import * as signalR from '@microsoft/signalr';
import type { CashCut, CashMethod, CashMovement, CreditMovement, Customer, Device, PaymentMethod, Product, Role, Sale, Store, TicketConfig, User } from '../data/models';
import type { PickupOrder } from '../data/pickup';
import type { Shortfall } from '../domain/stock';

// Sin VITE_API_URL la API está en el mismo origen (en desarrollo, Vite reenvía /api, /hubs y /archivos)
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: { faltantes?: Shortfall[]; intentos?: number; hasta?: string; fields?: Record<string, string> } = {},
  ) {
    super(message);
  }
}

// status 0: no se llegó al servidor (sin internet o la API apagada)
export const isNetworkError = (e: unknown) => e instanceof ApiError && e.status === 0;
export const errorMessage = (e: unknown, fallback: string) => (e instanceof ApiError && e.message ? e.message : fallback);

let token: string | null = null;
let onExpired: (() => void) | null = null;

export const setApiToken = (t: string | null) => {
  token = t;
};
export const onSessionExpired = (fn: (() => void) | null) => {
  onExpired = fn;
};

export async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const sent = token;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(sent ? { Authorization: `Bearer ${sent}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'sin-conexion', 'No se pudo contactar al servidor. Revisa la conexión.');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* cuerpo que no es JSON */
  }
  if (!res.ok) {
    const err = (data ?? {}) as { code?: string; message?: string };
    // Un 401 sin token (contraseña equivocada) no es una sesión vencida
    if (res.status === 401 && sent && sent === token) onExpired?.();
    // 502/503/504 del proxy de Vite cuando la API está apagada: igual que sin conexión
    if (!err.code && res.status >= 502 && res.status <= 504) throw new ApiError(0, 'sin-conexion', 'El servidor no responde.');
    throw new ApiError(res.status, err.code ?? `http-${res.status}`, err.message ?? '', (data ?? {}) as ApiError['body']);
  }
  return data as T;
}

// ---------- Lo que manda la API ----------

export interface TokenClaims {
  sub: string;
  role: 'cliente' | 'personal';
  name: string;
  staffRole?: Role;
  tiendaId?: string;
  exp: number;
}

export interface UsuarioDto {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface AuthRespuesta {
  token: string;
  user: UsuarioDto;
}

export interface TiendaDto {
  id: string;
  name: string;
  owner: string;
  email: string;
  phone: string;
  address: string;
  rfc: string;
  acceptsOrders: boolean;
  ticketConfig: TicketConfig;
}

export interface PersonalDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  hasPassword: boolean;
}

export interface TurnoDto {
  id: string;
  cajaId: string;
  name: string;
  openedBy: string;
  openedAt: string;
  openingFund: number;
  closedAt?: string;
}

export interface CajaDto {
  id: string;
  name: string;
  serie: string;
  lastSaleFolio: number;
  lastCutFolio: number;
  active: boolean;
  openShift?: TurnoDto;
}

export interface CategoriaDto {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface ProductoDto {
  id: string;
  name: string;
  categoryId: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  barcode: string;
  photo?: string;
  description?: string;
  showInApp: boolean;
  reserved: number;
  version: number;
  updatedAt: string;
  // Por peso: precio por kg; stock y minStock en kg con 3 decimales
  saleType: 'pieza' | 'peso';
}

export interface ClienteCreditoDto {
  id: string;
  name: string;
  phone: string;
  creditLimit: number;
  balance: number;
  note: string;
  createdAt: string;
  version: number;
}

export interface CambiosDto {
  cursor: number;
  completo: boolean;
  tienda?: TiendaDto;
  usuarios: PersonalDto[];
  cajas: CajaDto[];
  categorias: CategoriaDto[];
  productos: ProductoDto[];
  clientes: ClienteCreditoDto[];
  eliminados: { productos: string[]; categorias: string[]; clientes: string[]; usuarios: string[]; cajas: string[] };
}

export interface VentaDto {
  id: string;
  serie: string;
  folio: number;
  date: string;
  items: { productId: string; name: string; qty: number; price: number; saleType?: 'peso' }[];
  total: number;
  method: PaymentMethod;
  employee: string;
  received: number;
  paid: number;
  customerId?: string;
  customerName?: string;
  origin: 'tienda' | 'pedido';
  orderId?: string;
  orderFolio?: string;
  status: string;
  turnoId: string;
  cajaId?: string;
}

export interface MovimientoEfectivoDto {
  id: string;
  turnoId: string;
  type: CashMovement['type'];
  amount: number;
  note: string;
  date: string;
  employee: string;
}

export interface CorteDto {
  id: string;
  turnoId: string;
  cajaId: string;
  serie: string;
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
  creditSales: number;
  creditPaid: number;
  creditCash: number;
  storeSales: number;
  pickupSales: number;
  onlineSales: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  countedCash: number;
}

export interface MovimientoCreditoDto {
  id: string;
  customerId: string;
  type: 'cargo' | 'abono';
  amount: number;
  date: string;
  employee: string;
  note: string;
  saleId?: string;
  method?: string;
}

export interface MovimientoInventarioDto {
  id: string;
  productId: string;
  productName: string;
  type: string;
  qty: number;
  stockAfter: number;
  note: string;
  date: string;
  saleId?: string;
}

export interface DispositivoDto {
  id: string;
  name: string;
  model: string;
  owner: string;
  createdAt: string;
  lastSeen?: string;
  online: boolean;
}

export interface PedidoGestionDto {
  id: string;
  folio: string;
  customer: { name: string; phone: string };
  items: { productId: string; name: string; price: number; qty: number }[];
  note: string;
  total: number;
  status: PickupOrder['status'];
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
  payment?: { method: string; received: number };
  online?: PickupOrder['online'];
  saleId?: string;
  cancel?: PickupOrder['cancel'];
  issue?: PickupOrder['issue'];
  editedAt?: string;
}

export interface EnvioDto {
  id: string;
  product: ProductoDto;
  qty: number;
  at: string;
  status: 'en-caja' | 'cobrado' | 'cancelado';
  deviceId?: string;
  employee: string;
  cajaId?: string;
  accountId?: string;
  accountName?: string;
}

export interface CodigoVinculacionDto {
  code: string;
  expiresAt: string;
  qr: string;
}

export interface ResultadoOperacion {
  id: string;
  estado: 'aplicada' | 'con_advertencia' | 'rechazada';
  codigo?: string;
  mensaje?: string;
}

// ---------- De la API a los modelos de la caja ----------

export const toProduct = (p: ProductoDto): Product => ({
  id: p.id,
  name: p.name,
  category: p.category,
  price: p.price,
  cost: p.cost,
  stock: p.stock,
  minStock: p.minStock,
  barcode: p.barcode,
  // Sin valor = por pieza (como en los modelos de la app)
  ...(p.saleType === 'peso' ? { saleType: 'peso' as const } : {}),
  photo: p.photo || undefined,
  description: p.description || undefined,
  showInApp: p.showInApp,
});

export const toCustomer = (c: ClienteCreditoDto): Customer => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  creditLimit: c.creditLimit,
  balance: c.balance,
  note: c.note,
  createdAt: c.createdAt,
});

export const toUser = (u: PersonalDto): User => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, hasPassword: u.hasPassword });

export const toStore = (t: TiendaDto, register: string): Store => ({
  name: t.name,
  owner: t.owner,
  email: t.email,
  phone: t.phone,
  address: t.address,
  rfc: t.rfc,
  register,
  acceptsOrders: t.acceptsOrders,
});

export const toSale = (v: VentaDto): Sale => ({
  id: v.id,
  folio: v.folio,
  serie: v.serie,
  date: v.date,
  items: v.items,
  total: v.total,
  method: v.method,
  employee: v.employee,
  paid: v.method === 'efectivo' ? v.received : v.method === 'credito' && v.paid > 0 ? v.paid : undefined,
  customerId: v.customerId,
  customerName: v.customerName,
  origin: v.origin,
  orderId: v.orderId,
  orderFolio: v.orderFolio,
  turnoId: v.turnoId,
});

export const toCashMovement = (m: MovimientoEfectivoDto): CashMovement => ({
  id: m.id,
  type: m.type,
  amount: m.amount,
  note: m.note,
  date: m.date,
  employee: m.employee,
});

export const toCreditMovement = (m: MovimientoCreditoDto): CreditMovement => ({
  id: m.id,
  customerId: m.customerId,
  type: m.type,
  amount: m.amount,
  date: m.date,
  employee: m.employee,
  note: m.note,
  saleId: m.saleId,
  method: (m.method || undefined) as CreditMovement['method'],
});

export const toCut = (c: CorteDto): CashCut => ({
  id: c.id,
  folio: c.folio,
  date: c.date,
  shift: c.shift,
  employee: c.employee,
  openingFund: c.openingFund,
  salesTotal: c.salesTotal,
  salesCount: c.salesCount,
  cashSales: c.cashSales,
  cardSales: c.cardSales,
  transferSales: c.transferSales,
  onlineSales: c.onlineSales,
  creditSales: c.creditSales,
  creditPaid: c.creditPaid,
  creditCash: c.creditCash,
  storeSales: c.storeSales,
  pickupSales: c.pickupSales,
  cashIn: c.cashIn,
  cashOut: c.cashOut,
  expectedCash: c.expectedCash,
  countedCash: c.countedCash,
  turnoId: c.turnoId,
  cajaId: c.cajaId,
});

export const toDevice = (d: DispositivoDto, register: string): Device => ({
  id: d.id,
  name: d.name,
  model: d.model,
  owner: d.owner,
  lastSeen: d.lastSeen ?? d.createdAt,
  register,
});

export const toOrder = (o: PedidoGestionDto): PickupOrder => ({
  id: o.id,
  folio: o.folio,
  customer: o.customer,
  items: o.items.map((i) => ({ productId: i.productId, name: i.name, qty: i.qty, price: i.price })),
  note: o.note,
  total: o.total,
  status: o.status,
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
  deliveredAt: o.deliveredAt,
  payment: o.payment ? { method: o.payment.method as CashMethod, received: o.payment.received } : undefined,
  online: o.online,
  saleId: o.saleId,
  cancel: o.cancel,
  issue: o.issue,
  editedAt: o.editedAt,
});

// Lee el payload de un JWT sin verificar la firma (eso lo hace el servidor)
export function decodeToken(jwt: string): TokenClaims | null {
  try {
    const part = jwt.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json))) as TokenClaims;
  } catch {
    return null;
  }
}

// ---------- En vivo (SignalR) ----------

export type HubHandlers = Record<string, (...args: never[]) => void>;

// Canal del personal: pedidos, envíos del celular, cambios del catálogo, presencia de los celulares.
// Se reconecta solo; onStatus avisa cuando se conecta o se cae.
export function openHub(params: { cajaId?: string }, handlers: HubHandlers, onStatus: (connected: boolean) => void) {
  const qs = new URLSearchParams();
  if (params.cajaId) qs.set('cajaId', params.cajaId);
  const conn = new signalR.HubConnectionBuilder()
    .withUrl(`${API_URL}/hubs/tienda?${qs}`, { accessTokenFactory: () => token ?? '' })
    .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (c) => Math.min(30000, 1000 * 2 ** Math.min(c.previousRetryCount, 5)) })
    .configureLogging(signalR.LogLevel.None)
    .build();
  // Sin valor de regreso: SignalR tomaría cualquier valor como respuesta del cliente
  for (const [name, fn] of Object.entries(handlers)) {
    conn.on(name, (...args: unknown[]) => {
      try {
        (fn as (...a: unknown[]) => void)(...args);
      } catch {
        /* un evento con datos inesperados no tumba la conexión */
      }
    });
  }
  conn.onreconnecting(() => onStatus(false));
  conn.onreconnected(() => onStatus(true));

  let stopped = false;
  let retry: number | undefined;
  const start = async () => {
    try {
      await conn.start();
      if (stopped) return void conn.stop();
      onStatus(true);
    } catch {
      onStatus(false);
      if (!stopped) retry = window.setTimeout(start, 5000);
    }
  };
  // La reconexión automática se rinde tras varios intentos: se vuelve a empezar
  conn.onclose(() => {
    onStatus(false);
    if (!stopped) retry = window.setTimeout(start, 5000);
  });
  void start();

  return {
    invoke: (method: string, ...args: unknown[]) =>
      conn.state === signalR.HubConnectionState.Connected ? conn.invoke(method, ...args).catch(() => undefined) : Promise.resolve(undefined),
    stop: () => {
      stopped = true;
      window.clearTimeout(retry);
      void conn.stop();
    },
  };
}

export type Hub = ReturnType<typeof openHub>;
