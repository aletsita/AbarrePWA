import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  money,
  uid,
  type CashCut,
  type CashMovement,
  type CashMethod,
  type CashMovementType,
  type CreditMovement,
  type Customer,
  type Device,
  type Movement,
  type MovementType,
  type PaymentMethod,
  type Product,
  type Role,
  type Sale,
  type Shift,
  type Store,
  type TicketConfig,
  type User,
} from '../data/models';
import { reservedStock, type CancelReason, type PickupOrder } from '../data/pickup';
import { productInUse } from '../data/productUse';
import { fromCents, isWeighed, roundQty, sumCents } from '../domain/weight';
import {
  ApiError,
  decodeToken,
  isNetworkError,
  onSessionExpired,
  openHub,
  request,
  setApiToken,
  toCashMovement,
  toCreditMovement,
  toCustomer,
  toCut,
  toDevice,
  toOrder,
  toProduct,
  toSale,
  toStore,
  toUser,
  type AuthRespuesta,
  type CajaDto,
  type CambiosDto,
  type CodigoVinculacionDto,
  type CorteDto,
  type DispositivoDto,
  type EnvioDto,
  type Hub,
  type MovimientoCreditoDto,
  type MovimientoEfectivoDto,
  type MovimientoInventarioDto,
  type PedidoGestionDto,
  type PersonalDto,
  type ResultadoOperacion,
  type TiendaDto,
  type VentaDto,
} from '../lib/api';
import { availableStock, piecesByProduct, type Shortfall } from '../domain/stock';

// La caja trabaja contra AbarreAPI (ver AbarreAPI/README.md):
// - Al entrar descarga todo con GET /sync/cambios y lo guarda en este equipo (sigue cobrando sin internet).
// - Lo que hace sin conexión (ventas, abonos, turnos, productos…) va a una cola que sube con POST /sync/subir.
// - Con conexión, el cobro va directo a POST /ventas para que el servidor revise la existencia antes.
// - En vivo (SignalR): pedidos, envíos del celular, cambios del catálogo y celulares conectados.
// Las cuentas abiertas (ticket, cuentas en espera) viven solo aquí; la caja las publica para el celular.

export interface TicketLine {
  product: Product;
  qty: number;
  source: 'movil' | 'manual';
  flashAt: number;
}

export type SentStatus = 'en-caja' | 'cobrado' | 'cancelado';
export type SyncState = 'pendiente' | 'subiendo';

export interface SentItem {
  id: string;
  product: Product;
  qty: number;
  at: number;
  status: SentStatus;
  deviceId: string;
  accountId?: string;
  // Nombre de la cuenta en la que quedó (para el historial del celular)
  accountName?: string;
}

// Cuentas abiertas a la vez: la activa vive en `ticket` + `account`, las demás esperan en `parked`
export interface OpenAccount {
  id: string;
  name: string;
  customerId: string | null;
  openedAt: number;
  lines: TicketLine[];
}

export type AccountInfo = Omit<OpenAccount, 'lines'>;

export interface Shortage {
  product: Product;
  qty: number;
  available: number;
}

export interface AccountView extends AccountInfo {
  active: boolean;
  count: number;
  total: number;
}

export type ProductView = Product & { sync?: SyncState };

export interface LastScan {
  name: string;
  deviceId: string;
  at: number;
}

interface Pairing {
  code: string;
  expiresAt: number;
  // Contenido del QR que armó el servidor (con su dirección pública, si la tiene)
  qr?: string;
}

// La caja de este equipo, como la conoce el servidor
interface Register {
  id: string;
  name: string;
  serie: string;
  lastSaleFolio: number;
  lastCutFolio: number;
}

interface Data {
  version: number;
  tiendaId: string | null;
  // Hasta dónde se descargaron los cambios del servidor (GET /sync/cambios?desde=)
  cursor: number;
  caja: Register | null;
  store: Store;
  ticketConfig: TicketConfig;
  users: User[];
  products: Product[];
  movements: Movement[];
  ticket: TicketLine[];
  account: AccountInfo;
  parked: OpenAccount[];
  customers: Customer[];
  creditMovements: CreditMovement[];
  sales: Sale[];
  sent: SentItem[];
  lastScan: LastScan | null;
  cuts: CashCut[];
  cashMovements: CashMovement[];
  shift: Shift;
  devices: Device[];
  pairing: Pairing | null;
  closedCutId: string | null;
  lastSaleId: string | null;
  // Pide y recoge (solo los pagados: el servidor no manda los que esperan el pago)
  orders: PickupOrder[];
}

// Lo que se recarga del servidor además del catálogo
interface Snapshot {
  caja: CajaDto;
  sales: Sale[];
  cuts: CashCut[];
  cashMovements: CashMovement[];
  orders: PickupOrder[];
  devices: Device[];
  movements: Movement[];
  creditMovements?: CreditMovement[];
}

type Action =
  | { type: 'SCAN_TO_REGISTER'; product: Product; qty: number; sentId: string; at: number; deviceId: string; accountId?: string }
  | { type: 'REMOVE_SENT'; sentId: string }
  | { type: 'TICKET_ADD'; product: Product; qty: number; at: number }
  | { type: 'TICKET_QTY'; productId: string; delta: number }
  // Peso exacto de una línea por peso (se vuelve a pesar)
  | { type: 'TICKET_SET_QTY'; productId: string; qty: number }
  | { type: 'TICKET_REMOVE'; productId: string }
  | { type: 'TICKET_CLEAR' }
  // applyStock: venta hecha sin servidor (se descuenta aquí); con servidor la existencia llega de él
  | { type: 'CONFIRM_SALE'; sale: Sale; applyStock: boolean }
  | { type: 'MARK_SALES_SYNCED'; ids: string[] }
  | { type: 'UPSERT_PRODUCT'; product: Product; isNew: boolean; at: number }
  // La API ya lo borró (borrado lógico): sale de la lista; las ventas y cortes que lo nombran siguen igual
  | { type: 'DELETE_PRODUCT'; id: string }
  | { type: 'DEVICE_SEEN'; id: string; at: number }
  | { type: 'REMOVE_DEVICE'; id: string }
  | { type: 'SET_PAIRING'; pairing: Pairing | null }
  | { type: 'CLOSE_CUT'; cut: CashCut }
  | { type: 'OPEN_SHIFT'; shift: Shift }
  | { type: 'ADD_CASH_MOVEMENT'; movement: CashMovement }
  | { type: 'UPDATE_STORE'; store: Store }
  | { type: 'UPDATE_TICKET_CONFIG'; config: TicketConfig }
  | { type: 'UPSERT_USER'; user: User; prevEmail?: string }
  | { type: 'ACCOUNT_NEW'; id: string; at: number }
  | { type: 'ACCOUNT_SWITCH'; id: string }
  | { type: 'ACCOUNT_UPDATE'; id: string; name: string; customerId: string | null }
  | { type: 'UPSERT_CUSTOMER'; customer: Customer }
  | { type: 'CREDIT_PAYMENT'; movement: CreditMovement }
  | { type: 'CREDIT_MOVEMENTS'; customerId: string; movements: CreditMovement[] }
  | { type: 'ORDER_UPSERT'; order: PickupOrder }
  | { type: 'STOCK'; items: { productId: string; stock: number; reserved: number }[] }
  | { type: 'MOVEMENTS_FOR'; productId: string; movements: Movement[] }
  | { type: 'SERVER_CHANGES'; changes: CambiosDto; cajaId: string | null }
  | { type: 'SERVER_SNAPSHOT'; snapshot: Snapshot }
  | { type: 'RESET'; tiendaId: string | null };

// Resultado de lo que el servidor revisa antes de aplicarlo (cobrar, preparar, entregar)
export type Outcome<T> =
  | { ok: true; value: T; offline?: boolean }
  | { ok: false; code?: string; message: string; shortages?: Shortfall[] };

const refused = (e: unknown, fallback: string): Outcome<never> =>
  e instanceof ApiError
    ? { ok: false, code: e.code, message: e.message || fallback, shortages: e.body.faltantes }
    : { ok: false, message: fallback };

// Operación de la cola (mismo formato que POST /api/sync/subir). title/detail: para la lista de pendientes.
type OpTipo = 'venta' | 'abono' | 'movimiento_efectivo' | 'turno_abrir' | 'turno_cerrar' | 'producto' | 'ajuste_inventario' | 'cliente_credito';

interface Op {
  id: string;
  tipo: OpTipo;
  ocurridaEn: string;
  datos: Record<string, unknown>;
  title: string;
  detail: string;
  at: number;
  // Lo que se ve en la caja mientras no sube (producto) y a quién toca (venta, cliente)
  product?: Product;
  saleId?: string;
  customerId?: string;
}

export interface PendingItem {
  id: string;
  kind: OpTipo;
  title: string;
  detail: string;
  at: number;
  status: SyncState;
}

export interface UploadReport {
  count: number;
  at: number;
  // Lo que el servidor no aceptó (no se reintenta) y lo que aceptó con aviso (existencia negativa, crédito excedido)
  rejected: { title: string; message: string }[];
  warnings: { title: string; message: string }[];
}

interface CajaSession {
  token: string;
  email: string;
  userId: string;
  name: string;
  role: Role;
  tiendaId: string;
  exp: number;
}

const VERSION = 6;
const DATA_KEY = 'abarre.caja.datos';
const SESSION_KEY = 'abarre.caja.sesion';
const QUEUE_KEY = 'abarre.caja.cola';
const CAJA_KEY = 'abarre.caja.id';
const HISTORY_DAYS = 30;
const RETRY_MS = 30000;

const EMPTY_SHIFT: Shift = { name: '', register: '', openedAt: new Date(0).toISOString(), openedBy: '', openingFund: 0 };

function emptyData(tiendaId: string | null = null): Data {
  return {
    version: VERSION,
    tiendaId,
    cursor: 0,
    caja: null,
    store: { name: '', owner: '', email: '', phone: '', address: '', rfc: '', register: '' },
    ticketConfig: { header: '', footer: '¡Gracias por su compra!', showLogo: true, showEmployee: true },
    users: [],
    products: [],
    movements: [],
    ticket: [],
    account: { id: uid(), name: 'Cuenta 1', customerId: null, openedAt: 0 },
    parked: [],
    customers: [],
    creditMovements: [],
    sales: [],
    sent: [],
    lastScan: null,
    cuts: [],
    cashMovements: [],
    shift: EMPTY_SHIFT,
    devices: [],
    pairing: null,
    closedCutId: null,
    lastSaleId: null,
    orders: [],
  };
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sin espacio o almacenamiento bloqueado
  }
}

function loadData(): Data {
  const saved = read<Data | null>(DATA_KEY, null);
  return saved && saved.version === VERSION ? saved : emptyData();
}

function loadSession(): CajaSession | null {
  const s = read<CajaSession | null>(SESSION_KEY, null);
  if (!s?.token || s.exp * 1000 <= Date.now()) return null;
  setApiToken(s.token);
  return s;
}

function addToTicket(ticket: TicketLine[], product: Product, qty: number, source: TicketLine['source'], at: number) {
  if (ticket.some((l) => l.product.id === product.id)) {
    return ticket.map((l) => (l.product.id === product.id ? { ...l, product, qty: roundQty(l.qty + qty), source, flashAt: at } : l));
  }
  return [{ product, qty, source, flashAt: at }, ...ticket];
}

const iso = (at: number) => new Date(at).toISOString();
const enc = encodeURIComponent;

// En centavos (igual que la API): el total de una cuenta nunca arrastra decimales de punto flotante
const sumLines = (lines: TicketLine[]) => fromCents(sumCents(lines.map((l) => ({ qty: l.qty, price: l.product.price, saleType: l.product.saleType }))));

// Siguiente "Cuenta N" libre
function nextAccountName(accounts: { name: string }[]) {
  const used = accounts.map((a) => Number(/^Cuenta (\d+)$/.exec(a.name)?.[1] ?? 0));
  return `Cuenta ${Math.max(0, ...used) + 1}`;
}

// La cuenta activa pasa a espera; si está vacía se cierra sola, aunque tenga cliente asignado
// (lo que un celular le mande después llega a la cuenta activa)
function parkActive(s: Data): OpenAccount[] {
  if (!s.ticket.length) return s.parked;
  return [...s.parked, { ...s.account, lines: s.ticket }];
}

// Al cobrar o cancelar, la cuenta activa se cierra y su lugar lo toma una vacía
function resetAccount(s: Data, at: number): AccountInfo {
  return { id: uid(), name: nextAccountName(s.parked), customerId: null, openedAt: at };
}

const inActive = (s: Data, x: SentItem) => !x.accountId || x.accountId === s.account.id;

const MOVEMENT_TYPES: MovementType[] = ['venta', 'entrada', 'ajuste', 'alta'];
const toMovement = (m: MovimientoInventarioDto): Movement => ({
  id: m.id,
  productId: m.productId,
  // cancelacion (devolución de un pedido) se muestra como ajuste
  type: MOVEMENT_TYPES.includes(m.type as MovementType) ? (m.type as MovementType) : 'ajuste',
  qty: m.qty,
  date: m.date,
  note: m.note,
});

const toRegister = (c: CajaDto): Register => ({ id: c.id, name: c.name, serie: c.serie, lastSaleFolio: c.lastSaleFolio, lastCutFolio: c.lastCutFolio });

const toShift = (c: CajaDto): Shift =>
  c.openShift
    ? { id: c.openShift.id, name: c.openShift.name, register: c.name, openedAt: c.openShift.openedAt, openedBy: c.openShift.openedBy, openingFund: c.openShift.openingFund }
    : { ...EMPTY_SHIFT, register: c.name };

// Cambia el producto en las cuentas abiertas (precio o nombre nuevos)
function refreshLines(s: Data, product: Product): Pick<Data, 'ticket' | 'parked'> {
  const swap = (lines: TicketLine[]) => lines.map((l) => (l.product.id === product.id ? { ...l, product } : l));
  return { ticket: swap(s.ticket), parked: s.parked.map((p) => ({ ...p, lines: swap(p.lines) })) };
}

const known = (s: Data, id: string) => s.products.some((p) => p.id === id);

function reducer(s: Data, a: Action): Data {
  switch (a.type) {
    case 'SCAN_TO_REGISTER': {
      if (s.sent.some((x) => x.id === a.sentId)) return s;
      // Un producto que ya se borró no entra a ninguna cuenta
      if (s.products.length && !known(s, a.product.id)) return s;
      // El celular elige la cuenta; sin accountId, o si esa cuenta ya no está abierta, va a la activa
      const parkedTarget = a.accountId && a.accountId !== s.account.id ? s.parked.find((p) => p.id === a.accountId) : undefined;
      return {
        ...s,
        ticket: parkedTarget ? s.ticket : addToTicket(s.ticket, a.product, a.qty, 'movil', a.at),
        parked: parkedTarget
          ? s.parked.map((p) => (p.id === parkedTarget.id ? { ...p, lines: addToTicket(p.lines, a.product, a.qty, 'movil', a.at) } : p))
          : s.parked,
        sent: [
          {
            id: a.sentId,
            product: a.product,
            qty: a.qty,
            at: a.at,
            status: 'en-caja' as SentStatus,
            deviceId: a.deviceId,
            accountId: parkedTarget?.id ?? s.account.id,
            accountName: parkedTarget?.name ?? s.account.name,
          },
          ...s.sent,
        ].slice(0, 200),
        lastScan: { name: a.product.name, deviceId: a.deviceId, at: a.at },
      };
    }
    case 'REMOVE_SENT': {
      const item = s.sent.find((x) => x.id === a.sentId);
      if (!item) return s;
      const take = (lines: TicketLine[]) =>
        lines.map((l) => (l.product.id === item.product.id ? { ...l, qty: roundQty(l.qty - item.qty) } : l)).filter((l) => l.qty > 0);
      const waiting = item.status === 'en-caja';
      return {
        ...s,
        ticket: waiting && inActive(s, item) ? take(s.ticket) : s.ticket,
        parked: waiting ? s.parked.map((p) => (p.id === item.accountId ? { ...p, lines: take(p.lines) } : p)) : s.parked,
        sent: s.sent.filter((x) => x.id !== a.sentId),
      };
    }
    case 'TICKET_ADD':
      if (!known(s, a.product.id)) return s;
      return { ...s, ticket: addToTicket(s.ticket, a.product, a.qty, 'manual', a.at) };
    case 'TICKET_QTY':
      // +1 / −1 solo para piezas; lo pesado se corrige con TICKET_SET_QTY
      return {
        ...s,
        ticket: s.ticket
          .map((l) => (l.product.id === a.productId && !isWeighed(l.product) ? { ...l, qty: l.qty + a.delta } : l))
          .filter((l) => l.qty > 0),
      };
    case 'TICKET_SET_QTY':
      if (!(a.qty > 0)) return s;
      return { ...s, ticket: s.ticket.map((l) => (l.product.id === a.productId && isWeighed(l.product) ? { ...l, qty: roundQty(a.qty) } : l)) };
    case 'TICKET_REMOVE':
      return { ...s, ticket: s.ticket.filter((l) => l.product.id !== a.productId) };
    case 'TICKET_CLEAR':
      return {
        ...s,
        ticket: [],
        account: resetAccount(s, s.account.openedAt),
        sent: s.sent.map((x) => (x.status === 'en-caja' && inActive(s, x) ? { ...x, status: 'cancelado' } : x)),
      };
    case 'CONFIRM_SALE': {
      if (s.sales.some((x) => x.id === a.sale.id || (a.sale.orderId && x.orderId === a.sale.orderId))) return s;
      const sale = a.sale;
      const moves: Movement[] = a.applyStock
        ? sale.items.map((i) => ({ id: `${sale.id}-${i.productId}`, productId: i.productId, type: 'venta', qty: -i.qty, date: sale.date, note: `Venta #${sale.folio}` }))
        : [];
      // Sin servidor el saldo del cliente se mueve aquí; con servidor se vuelve a leer de él
      const charge: CreditMovement | null =
        a.applyStock && sale.method === 'credito' && sale.customerId
          ? { id: `cr-${sale.id}`, customerId: sale.customerId, type: 'cargo', amount: sale.total, date: sale.date, employee: sale.employee, note: `Venta #${sale.folio}`, saleId: sale.id }
          : null;
      const ownFolio = s.caja && sale.serie === s.caja.serie && sale.origin !== 'pedido';
      return {
        ...s,
        caja: ownFolio && s.caja ? { ...s.caja, lastSaleFolio: Math.max(s.caja.lastSaleFolio, sale.folio) } : s.caja,
        sales: [sale, ...s.sales],
        movements: [...moves, ...s.movements],
        customers: charge ? s.customers.map((c) => (c.id === charge.customerId ? { ...c, balance: c.balance + charge.amount } : c)) : s.customers,
        creditMovements: charge ? [charge, ...s.creditMovements] : s.creditMovements,
        products: a.applyStock
          ? s.products.map((p) => {
              const qty = sale.items.filter((i) => i.productId === p.id).reduce((n, i) => roundQty(n + i.qty), 0);
              return qty ? { ...p, stock: roundQty(p.stock - qty) } : p;
            })
          : s.products,
        // La venta de un pedido no sale de la cuenta abierta: esa se queda como está
        ...(sale.orderId
          ? { lastSaleId: sale.method === 'en_linea' ? sale.id : s.lastSaleId }
          : {
              ticket: [],
              account: resetAccount(s, Date.parse(sale.date)),
              sent: s.sent.map((x) => (x.status === 'en-caja' && inActive(s, x) ? { ...x, status: 'cobrado' as const } : x)),
              lastSaleId: sale.id,
            }),
      };
    }
    case 'DELETE_PRODUCT':
      return { ...s, products: s.products.filter((p) => p.id !== a.id) };
    case 'MARK_SALES_SYNCED': {
      const ids = new Set(a.ids);
      return { ...s, sales: s.sales.map((x) => (ids.has(x.id) ? { ...x, pending: false } : x)) };
    }
    case 'UPSERT_PRODUCT': {
      const prev = s.products.find((p) => p.id === a.product.id);
      const diff = roundQty(a.product.stock - (prev?.stock ?? 0));
      const move: Movement | null = !prev
        ? { id: uid(), productId: a.product.id, type: 'alta', qty: a.product.stock, date: iso(a.at), note: 'Alta del producto' }
        : diff !== 0
          ? { id: uid(), productId: a.product.id, type: 'ajuste', qty: diff, date: iso(a.at), note: 'Ajuste de existencia' }
          : null;
      return {
        ...s,
        products: prev ? s.products.map((p) => (p.id === a.product.id ? a.product : p)) : [a.product, ...s.products],
        movements: move ? [move, ...s.movements] : s.movements,
        ...refreshLines(s, a.product),
      };
    }
    case 'REMOVE_DEVICE':
      return { ...s, devices: s.devices.filter((d) => d.id !== a.id) };
    case 'DEVICE_SEEN':
      return { ...s, devices: s.devices.map((d) => (d.id === a.id ? { ...d, lastSeen: iso(a.at) } : d)) };
    case 'SET_PAIRING':
      return { ...s, pairing: a.pairing };
    case 'CLOSE_CUT':
      return { ...s, cuts: [a.cut, ...s.cuts.filter((c) => c.id !== a.cut.id)], closedCutId: a.cut.id };
    case 'OPEN_SHIFT':
      return { ...s, shift: a.shift, cashMovements: [], closedCutId: null };
    case 'ADD_CASH_MOVEMENT':
      return { ...s, cashMovements: [a.movement, ...s.cashMovements] };
    case 'UPDATE_STORE':
      return { ...s, store: a.store };
    case 'UPDATE_TICKET_CONFIG':
      return { ...s, ticketConfig: a.config };
    case 'UPSERT_USER': {
      const key = (a.prevEmail ?? a.user.email).toLowerCase();
      const match = (u: User) => (a.user.id && u.id === a.user.id) || u.email.toLowerCase() === key;
      const exists = s.users.some(match);
      return { ...s, users: exists ? s.users.map((u) => (match(u) ? a.user : u)) : [...s.users, a.user] };
    }
    case 'ACCOUNT_NEW': {
      const parked = parkActive(s);
      return { ...s, parked, ticket: [], account: { id: a.id, name: nextAccountName(parked), customerId: null, openedAt: a.at } };
    }
    case 'ACCOUNT_SWITCH': {
      const target = s.parked.find((p) => p.id === a.id);
      if (!target) return s;
      const { lines, ...account } = target;
      return { ...s, parked: parkActive(s).filter((p) => p.id !== a.id), ticket: lines, account };
    }
    case 'ACCOUNT_UPDATE':
      return s.account.id === a.id
        ? { ...s, account: { ...s.account, name: a.name, customerId: a.customerId } }
        : { ...s, parked: s.parked.map((p) => (p.id === a.id ? { ...p, name: a.name, customerId: a.customerId } : p)) };
    case 'UPSERT_CUSTOMER': {
      // El saldo solo lo mueven las ventas a crédito y los abonos
      const prev = s.customers.find((c) => c.id === a.customer.id);
      const customer = { ...a.customer, balance: prev?.balance ?? 0 };
      return { ...s, customers: prev ? s.customers.map((c) => (c.id === customer.id ? customer : c)) : [customer, ...s.customers] };
    }
    case 'CREDIT_PAYMENT':
      return {
        ...s,
        creditMovements: [a.movement, ...s.creditMovements],
        customers: s.customers.map((c) => (c.id === a.movement.customerId ? { ...c, balance: Math.max(0, c.balance - a.movement.amount) } : c)),
      };
    case 'CREDIT_MOVEMENTS':
      return { ...s, creditMovements: [...a.movements, ...s.creditMovements.filter((m) => m.customerId !== a.customerId)] };
    case 'ORDER_UPSERT': {
      const exists = s.orders.some((o) => o.id === a.order.id);
      return { ...s, orders: exists ? s.orders.map((o) => (o.id === a.order.id ? a.order : o)) : [a.order, ...s.orders] };
    }
    case 'STOCK': {
      if (!a.items.length) return s;
      const byId = new Map(a.items.map((i) => [i.productId, i.stock]));
      return { ...s, products: s.products.map((p) => (byId.has(p.id) ? { ...p, stock: byId.get(p.id)! } : p)) };
    }
    case 'MOVEMENTS_FOR':
      return { ...s, movements: [...a.movements, ...s.movements.filter((m) => m.productId !== a.productId)] };
    case 'SERVER_CHANGES': {
      const c = a.changes;
      const dead = new Set([...c.eliminados.productos, ...c.eliminados.clientes, ...c.eliminados.usuarios]);
      const merge = <T extends { id?: string }>(list: T[], fresh: T[]) => {
        const ids = new Set(fresh.map((x) => x.id));
        const kept = c.completo ? [] : list.filter((x) => !ids.has(x.id) && !dead.has(x.id ?? ''));
        return [...fresh, ...kept];
      };
      const cajaDto = c.cajas.find((x) => x.id === (a.cajaId ?? s.caja?.id));
      const caja = cajaDto ? toRegister(cajaDto) : s.caja;
      const products = merge(s.products, c.productos.map(toProduct)).sort((x, y) => x.name.localeCompare(y.name, 'es'));
      let next: Data = {
        ...s,
        cursor: c.cursor,
        caja: caja && s.caja && caja.id === s.caja.id ? { ...caja, lastSaleFolio: Math.max(caja.lastSaleFolio, s.caja.lastSaleFolio), lastCutFolio: Math.max(caja.lastCutFolio, s.caja.lastCutFolio) } : caja,
        store: c.tienda ? toStore(c.tienda, caja?.name ?? s.store.register) : { ...s.store, register: caja?.name ?? s.store.register },
        ticketConfig: c.tienda ? c.tienda.ticketConfig : s.ticketConfig,
        users: merge(s.users, c.usuarios.map(toUser)),
        products,
        customers: merge(s.customers, c.clientes.map(toCustomer)),
      };
      for (const p of c.productos) next = { ...next, ...refreshLines(next, toProduct(p)) };
      return next;
    }
    case 'SERVER_SNAPSHOT': {
      const x = a.snapshot;
      const ids = new Set(x.sales.map((v) => v.id));
      // Las ventas hechas sin internet que todavía no suben se conservan
      const local = s.sales.filter((v) => v.pending && !ids.has(v.id));
      const shift = toShift(x.caja);
      const mine = x.cuts.filter((c) => c.cajaId === x.caja.id).sort((p, q) => q.date.localeCompare(p.date));
      return {
        ...s,
        caja: toRegister(x.caja),
        shift,
        closedCutId: shift.id ? null : (mine[0]?.id ?? null),
        sales: [...local, ...x.sales],
        cuts: x.cuts,
        cashMovements: x.cashMovements,
        orders: x.orders,
        devices: x.devices,
        movements: x.movements,
        creditMovements: x.creditMovements ?? s.creditMovements,
      };
    }
    case 'RESET':
      return emptyData(a.tiendaId);
  }
  return s;
}

interface AppState extends Omit<Data, 'products' | 'version' | 'cursor' | 'tiendaId'> {
  products: ProductView[];
  // Hay internet y el canal en vivo con el servidor está conectado
  online: boolean;
  syncConnected: boolean;
  // Ya se descargaron los datos de la tienda al menos una vez
  ready: boolean;
  uploading: boolean;
  pending: PendingItem[];
  lastUpload: UploadReport | null;

  isLive: (key: string) => boolean;
  newPairingCode: () => Promise<Outcome<null>>;
  removeDevice: (id: string) => Promise<Outcome<null>>;
  // Borrado lógico; requiere conexión. La API responde 409 producto-en-uso si está en una cuenta o apartado en un pedido.
  deleteProduct: (id: string) => Promise<Outcome<null>>;

  user: User | null;
  // Regresan el mensaje de error, o null si entró
  login: (email: string, password: string) => Promise<string | null>;
  registerStore: (input: { storeName: string; name: string; email: string; phone: string; password: string }) => Promise<string | null>;
  logout: () => void;
  // Vuelve a descargar todo del servidor
  refresh: () => Promise<void>;

  saveProduct: (p: Product, isNew: boolean) => 'enviado' | 'pendiente';
  findByBarcode: (code: string) => ProductView | undefined;
  movementsFor: (productId: string) => Movement[];

  ticketTotal: number;
  ticketCount: number;
  // Piezas que todavía se pueden agregar a una cuenta
  availableFor: (productId: string) => number;
  ticketShortages: Shortage[];
  ticketAdd: (p: Product, qty?: number) => void;
  ticketQty: (productId: string, delta: number) => void;
  ticketSetQty: (productId: string, qty: number) => void;
  ticketRemove: (productId: string) => void;
  ticketClear: () => void;
  // El servidor revisa el inventario antes; si no alcanza, no se cobra y dice qué falta. Sin conexión se cobra y sube después.
  confirmSale: (method: PaymentMethod, paid: number) => Promise<Outcome<Sale>>;

  // Pide y recoge: todo pasa por el servidor (requiere conexión)
  advanceOrder: (id: string) => Promise<Outcome<null>>;
  cancelOrder: (id: string, reason: CancelReason, missing: string[], note?: string) => Promise<Outcome<null>>;
  reportShortage: (id: string, missing: string[]) => Promise<Outcome<null>>;
  // El servidor busca el pedido listo con ese código (escrito o QR). La caja nunca recibe el código: solo lo compara.
  verifyPickupCode: (raw: string) => Promise<Outcome<PickupOrder>>;
  // method en_linea: pedido pagado en la app, no se cobra (el servidor valida el código)
  deliverOrder: (id: string, method: CashMethod, received: number, pickupCode: string) => Promise<Outcome<Sale>>;

  accounts: AccountView[];
  newAccount: () => void;
  switchAccount: (id: string) => void;
  updateAccount: (id: string, name: string, customerId: string | null) => void;
  linkCustomer: (id: string, customer: Customer | null) => void;

  saveCustomer: (c: Omit<Customer, 'id' | 'balance' | 'createdAt'> & { id?: string }) => Customer;
  addCreditPayment: (customerId: string, amount: number, method: CashMethod, note?: string) => void;

  // Regresa el folio del corte
  closeCut: (cut: CashCut) => number;
  openShift: (openingFund: number) => void;
  addCashMovement: (type: CashMovementType, amount: number, note: string) => void;
  updateStore: (store: Store) => Promise<Outcome<null>>;
  updateTicketConfig: (config: TicketConfig) => Promise<Outcome<null>>;
  saveUser: (user: User, prevEmail?: string) => Promise<Outcome<User>>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CajaSession | null>(loadSession);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const [data, dispatch] = useReducer(reducer, undefined, loadData);
  const dataRef = useRef(data);
  dataRef.current = data;

  const [queue, setQueueState] = useState<Op[]>(() => read(QUEUE_KEY, []));
  const queueRef = useRef(queue);
  // La cola se lee justo después de cambiarla (al cobrar): se actualiza la referencia al momento
  const setQueue = useCallback((fn: (q: Op[]) => Op[]) => {
    queueRef.current = fn(queueRef.current);
    setQueueState(queueRef.current);
  }, []);

  const [uploading, setUploading] = useState(false);
  const flushing = useRef<Promise<void> | null>(null);
  const [lastUpload, setLastUpload] = useState<UploadReport | null>(null);

  const [netOnline, setNetOnline] = useState(navigator.onLine);
  const [hubUp, setHubUp] = useState(false);
  const hubRef = useRef<Hub | null>(null);
  const [presence, setPresence] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(() => dataRef.current.cursor > 0);

  useEffect(() => write(DATA_KEY, data), [data]);
  useEffect(() => write(QUEUE_KEY, queue), [queue]);
  useEffect(() => write(SESSION_KEY, session), [session]);

  useEffect(() => {
    const on = () => setNetOnline(true);
    const off = () => setNetOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const logout = useCallback((expired = false) => {
    if (!expired && sessionRef.current) void request('POST', '/auth/salir').catch(() => undefined);
    setApiToken(null);
    setSession(null);
    hubRef.current?.stop();
    hubRef.current = null;
    setHubUp(false);
  }, []);

  useEffect(() => {
    onSessionExpired(() => logout(true));
    return () => onSessionExpired(null);
  }, [logout]);

  // ---------- Descargar del servidor ----------

  // Cambios del catálogo, usuarios y clientes desde el último cursor
  const pull = useCallback(async () => {
    if (!sessionRef.current) return;
    try {
      const c = await request<CambiosDto>('GET', `/sync/cambios?desde=${dataRef.current.cursor}`);
      dispatch({ type: 'SERVER_CHANGES', changes: c, cajaId: dataRef.current.caja?.id ?? null });
    } catch {
      /* sin conexión: se reintenta con el siguiente aviso */
    }
  }, []);

  const pullTimer = useRef<number>();
  const schedulePull = useCallback(() => {
    window.clearTimeout(pullTimer.current);
    pullTimer.current = window.setTimeout(() => void pull(), 300);
  }, [pull]);

  const refreshCredit = useCallback(async (customerId: string) => {
    try {
      const list = await request<MovimientoCreditoDto[]>('GET', `/clientes-credito/${enc(customerId)}/movimientos`);
      dispatch({ type: 'CREDIT_MOVEMENTS', customerId, movements: list.map(toCreditMovement) });
    } catch {
      /* se vuelve a leer en la siguiente descarga */
    }
  }, []);

  // El celular mandó un producto (o canceló un envío). La caja anota en qué cuenta quedó.
  const receiveEnvio = useCallback((e: EnvioDto) => {
    const s = dataRef.current;
    if (!s.caja || (e.cajaId && e.cajaId !== s.caja.id)) return;
    if (e.status === 'cancelado') {
      dispatch({ type: 'REMOVE_SENT', sentId: e.id });
      return;
    }
    if (e.status !== 'en-caja' || s.sent.some((x) => x.id === e.id)) return;
    const target = e.accountId && e.accountId !== s.account.id ? s.parked.find((p) => p.id === e.accountId) : undefined;
    const accountId = target?.id ?? s.account.id;
    const accountName = target?.name ?? s.account.name;
    dispatch({ type: 'SCAN_TO_REGISTER', product: toProduct(e.product), qty: e.qty, sentId: e.id, at: Date.parse(e.at) || Date.now(), deviceId: e.deviceId ?? '', accountId: e.accountId });
    if (e.accountId !== accountId || e.accountName !== accountName) {
      void request('POST', `/envios/${enc(e.id)}/cuenta`, { accountId, accountName }).catch(() => undefined);
    }
  }, []);

  const flushRef = useRef<() => Promise<void>>(async () => undefined);

  // Todo lo de la tienda: catálogo, caja y turno, ventas recientes, cortes, pedidos, celulares
  const loadAll = useCallback(async (withCredit = true) => {
    if (!sessionRef.current) return;
    // Primero sube lo pendiente, para no pisar lo que se hizo sin internet
    await flushRef.current();
    let c: CambiosDto;
    try {
      c = await request<CambiosDto>('GET', '/sync/cambios?desde=0');
    } catch {
      return;
    }
    const cajas = c.cajas.filter((x) => x.active);
    const saved = read<string | null>(CAJA_KEY, null);
    const caja = cajas.find((x) => x.id === (dataRef.current.caja?.id ?? saved)) ?? cajas[0] ?? null;
    if (caja) write(CAJA_KEY, caja.id);
    dispatch({ type: 'SERVER_CHANGES', changes: c, cajaId: caja?.id ?? null });
    setReady(true);
    if (!caja) return;

    // Lo que el rol no puede ver (por ejemplo, ventas para Inventario) se queda vacío
    const get = <T,>(path: string, fallback: T) =>
      request<T>('GET', path).catch((e) => {
        if (isNetworkError(e)) throw e;
        return fallback;
      });
    const since = enc(new Date(Date.now() - HISTORY_DAYS * 864e5).toISOString());
    try {
      const [ventas, cortes, efectivo, activos, recientes, dispositivos, movs, envios] = await Promise.all([
        get<VentaDto[]>(`/ventas?desde=${since}&limite=1000`, []),
        get<CorteDto[]>('/cortes', []),
        caja.openShift ? get<MovimientoEfectivoDto[]>(`/turnos/${caja.openShift.id}/movimientos`, []) : Promise.resolve([]),
        get<PedidoGestionDto[]>('/gestion/pedidos?estado=activos', []),
        get<PedidoGestionDto[]>(`/gestion/pedidos?estado=todos&desde=${since}`, []),
        get<DispositivoDto[]>('/dispositivos', []),
        get<MovimientoInventarioDto[]>('/inventario/movimientos?limite=500', []),
        get<EnvioDto[]>('/envios?estado=en-caja', []),
      ]);
      const credit = withCredit
        ? (await Promise.all(c.clientes.slice(0, 200).map((cl) => get<MovimientoCreditoDto[]>(`/clientes-credito/${cl.id}/movimientos`, [])))).flat()
        : undefined;
      // Si mientras tanto se volvió a llenar la cola (se cobró sin conexión), no se pisa el turno local
      if (queueRef.current.some((o) => o.tipo === 'turno_abrir' || o.tipo === 'turno_cerrar')) return;
      const orders = new Map<string, PickupOrder>();
      for (const o of [...recientes, ...activos]) orders.set(o.id, toOrder(o));
      dispatch({
        type: 'SERVER_SNAPSHOT',
        snapshot: {
          caja,
          sales: ventas.map(toSale),
          cuts: cortes.map(toCut),
          cashMovements: efectivo.map(toCashMovement),
          orders: [...orders.values()].sort((p, q) => q.createdAt.localeCompare(p.createdAt)),
          devices: dispositivos.map((d) => toDevice(d, caja.name)),
          movements: movs.map(toMovement),
          creditMovements: credit?.map(toCreditMovement),
        },
      });
      setPresence(new Set(dispositivos.filter((d) => d.online).map((d) => d.id)));
      envios.forEach(receiveEnvio);
    } catch {
      /* sin conexión a medias: se queda lo que había */
    }
  }, [receiveEnvio]);

  const loadTimer = useRef<number>();
  const scheduleLoad = useCallback(() => {
    window.clearTimeout(loadTimer.current);
    loadTimer.current = window.setTimeout(() => void loadAll(false), 400);
  }, [loadAll]);

  // ---------- Subir la cola ----------

  const flush = useCallback(async (): Promise<void> => {
    if (flushing.current) return flushing.current;
    const caja = dataRef.current.caja;
    if (!navigator.onLine || !sessionRef.current || !caja || queueRef.current.length === 0) return;
    const ops = queueRef.current;
    const run = (async () => {
      setUploading(true);
      try {
        const r = await request<{ resultados: ResultadoOperacion[]; cursor: number }>('POST', '/sync/subir', {
          cajaId: caja.id,
          operaciones: ops.map((o) => ({ id: o.id, tipo: o.tipo, ocurridaEn: o.ocurridaEn, datos: o.datos })),
        });
        const results = new Map(r.resultados.map((x) => [x.id, x]));
        const handled = ops.filter((o) => results.has(o.id));
        setQueue((q) => q.filter((o) => !results.has(o.id)));
        const sales = handled.flatMap((o) => (o.tipo === 'venta' && o.saleId ? [o.saleId] : []));
        if (sales.length) dispatch({ type: 'MARK_SALES_SYNCED', ids: sales });
        const report = (estado: ResultadoOperacion['estado']) =>
          handled
            .filter((o) => results.get(o.id)!.estado === estado)
            .map((o) => ({ title: o.title, message: results.get(o.id)!.mensaje ?? '' }));
        if (handled.length) setLastUpload({ count: handled.length, at: Date.now(), rejected: report('rechazada'), warnings: report('con_advertencia') });
        // Lo que el servidor recalculó (existencias, saldos, cortes) se vuelve a leer
        new Set(handled.flatMap((o) => (o.customerId ? [o.customerId] : []))).forEach((id) => void refreshCredit(id));
        // Lo rechazado se había aplicado aquí: se vuelve a leer todo del servidor
        const rejected = handled.some((o) => results.get(o.id)!.estado === 'rechazada');
        if (rejected || handled.some((o) => o.tipo === 'turno_abrir' || o.tipo === 'turno_cerrar' || o.tipo === 'movimiento_efectivo' || o.tipo === 'venta')) scheduleLoad();
        else schedulePull();
      } catch (e) {
        if (!isNetworkError(e) && e instanceof ApiError && e.status !== 401) {
          setLastUpload({ count: 0, at: Date.now(), rejected: [{ title: 'No se pudieron subir los pendientes', message: e.message }], warnings: [] });
        }
      } finally {
        setUploading(false);
      }
    })();
    flushing.current = run;
    try {
      await run;
    } finally {
      flushing.current = null;
    }
  }, [refreshCredit, schedulePull, scheduleLoad, setQueue]);
  flushRef.current = flush;

  const enqueue = useCallback(
    (op: Omit<Op, 'id' | 'ocurridaEn' | 'at'>) => {
      const at = Date.now();
      setQueue((q) => [...q, { ...op, id: uid(), ocurridaEn: iso(at), at }]);
      if (navigator.onLine) window.setTimeout(() => void flush(), 0);
    },
    [flush, setQueue],
  );

  // Reintento mientras haya pendientes
  useEffect(() => {
    if (!netOnline || !session) return;
    void flush();
    const t = window.setInterval(() => queueRef.current.length && void flush(), RETRY_MS);
    return () => window.clearInterval(t);
  }, [netOnline, session, flush]);

  // ---------- En vivo ----------

  const cajaId = data.caja?.id;
  useEffect(() => {
    if (!session) return;
    const hub = openHub(
      { cajaId },
      {
        pedido: ((dto: PedidoGestionDto) => dispatch({ type: 'ORDER_UPSERT', order: toOrder(dto) })) as never,
        envio: ((dto: EnvioDto) => receiveEnvio(dto)) as never,
        catalogo: (() => schedulePull()) as never,
        inventario: ((list: { productId: string; stock: number; reserved: number }[]) => dispatch({ type: 'STOCK', items: list })) as never,
        dispositivo: ((d: { id: string; online: boolean }) => {
          setPresence((p) => {
            const next = new Set(p);
            if (d.online) next.add(d.id);
            else next.delete(d.id);
            return next;
          });
          if (!d.online) dispatch({ type: 'DEVICE_SEEN', id: d.id, at: Date.now() });
          // Un celular recién vinculado
          else if (!dataRef.current.devices.some((x) => x.id === d.id)) scheduleLoad();
        }) as never,
        tienda: ((t: { abierta: boolean }) => void t) as never,
      },
      (up) => {
        setHubUp(up);
        // Al conectarse (o reconectarse) se sube lo pendiente y se vuelve a leer todo
        if (up) void loadAll(false);
      },
    );
    hubRef.current = hub;
    return () => {
      hub.stop();
      if (hubRef.current === hub) hubRef.current = null;
      setHubUp(false);
    };
  }, [session?.token, cajaId, receiveEnvio, schedulePull, scheduleLoad, loadAll]); // eslint-disable-line react-hooks/exhaustive-deps

  // Primera descarga al abrir con sesión (también sin el canal en vivo)
  useEffect(() => {
    if (session) void loadAll(true);
  }, [session?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Vista: lo que espera subir se ve ya aplicado ----------

  const view = useMemo(() => {
    const status: SyncState = uploading ? 'subiendo' : 'pendiente';
    const byId = new Map<string, ProductView>(data.products.map((p) => [p.id, p]));
    const created: string[] = [];
    const pending: PendingItem[] = [];
    for (const op of queue) {
      if (op.tipo === 'producto' && op.product) {
        const isNew = !byId.has(op.product.id);
        if (isNew) created.unshift(op.product.id);
        byId.set(op.product.id, { ...op.product, sync: status });
      }
      pending.push({ id: op.id, kind: op.tipo, title: op.title, detail: op.detail, at: op.at, status });
    }
    const createdSet = new Set(created);
    const products = [...created.map((id) => byId.get(id)!), ...[...byId.values()].filter((p) => !createdSet.has(p.id))];
    return { products, pending: pending.reverse() };
  }, [data.products, queue, uploading]);

  const viewRef = useRef(view);
  viewRef.current = view;

  // ---------- Sesión ----------

  const user: User | null = useMemo(() => {
    if (!session) return null;
    const found = data.users.find((u) => u.email.toLowerCase() === session.email.toLowerCase());
    if (found) return found.active ? found : null;
    return { id: session.userId, name: session.name, email: session.email, role: session.role, active: true };
  }, [session, data.users]);
  const employee = user?.name ?? data.store.owner;

  const begin = useCallback((r: AuthRespuesta, email: string): string | null => {
    const claims = decodeToken(r.token);
    if (!claims || claims.role !== 'personal' || !claims.staffRole || !claims.tiendaId) {
      return 'Esta cuenta es de cliente. En la caja entra con una cuenta del personal de la tienda.';
    }
    setApiToken(r.token);
    if (dataRef.current.tiendaId !== claims.tiendaId) {
      // Otra tienda: lo guardado en este equipo era de la anterior
      dispatch({ type: 'RESET', tiendaId: claims.tiendaId });
      setQueue(() => []);
      write(CAJA_KEY, null);
      setReady(false);
    }
    setSession({ token: r.token, email: r.user.email || email, userId: claims.sub, name: claims.name, role: claims.staffRole, tiendaId: claims.tiendaId, exp: claims.exp });
    return null;
  }, [setQueue]);

  // ---------- Acciones ----------

  const saveProduct = useCallback(
    (product: Product, isNew: boolean) => {
      const at = Date.now();
      const prev = viewRef.current.products.find((p) => p.id === product.id);
      dispatch({ type: 'UPSERT_PRODUCT', product, isNew, at });
      // Foto: data URL nueva se sube; la misma URL no se manda; quitarla manda ''
      const photo = product.photo?.startsWith('data:') ? product.photo : product.photo ? undefined : prev?.photo ? '' : undefined;
      enqueue({
        tipo: 'producto',
        title: product.name,
        detail: isNew ? 'Producto nuevo' : 'Cambios del producto',
        product,
        datos: {
          id: product.id,
          name: product.name,
          category: product.category,
          price: product.price,
          cost: product.cost,
          ...(isNew ? { stock: product.stock } : {}),
          minStock: product.minStock,
          barcode: product.barcode,
          saleType: product.saleType ?? 'pieza',
          ...(photo !== undefined ? { photo } : {}),
          description: product.description ?? '',
          showInApp: product.showInApp !== false,
          updatedAt: iso(at),
        },
      });
      // En una edición la existencia no cambia con el producto: se manda lo que se contó como ajuste
      if (!isNew && prev && prev.stock !== product.stock) {
        enqueue({
          tipo: 'ajuste_inventario',
          title: product.name,
          detail: `Existencia ${prev.stock} → ${product.stock}`,
          datos: { id: uid(), productId: product.id, countedStock: product.stock, note: 'Ajuste desde la caja', at: iso(at) },
        });
      }
      return navigator.onLine ? ('enviado' as const) : ('pendiente' as const);
    },
    [enqueue],
  );

  const findByBarcode = useCallback((code: string) => viewRef.current.products.find((p) => p.barcode === code.trim()), []);

  // Los movimientos se leen de lo guardado y se actualizan del servidor en segundo plano
  const movementsAsked = useRef(new Map<string, number>());
  const movementsFor = useCallback((productId: string) => {
    const last = movementsAsked.current.get(productId) ?? 0;
    if (Date.now() - last > 30000 && navigator.onLine && sessionRef.current) {
      movementsAsked.current.set(productId, Date.now());
      void request<MovimientoInventarioDto[]>('GET', `/inventario/movimientos?productoId=${enc(productId)}&limite=20`)
        .then((list) => dispatch({ type: 'MOVEMENTS_FOR', productId, movements: list.map(toMovement) }))
        .catch(() => undefined);
    }
    return dataRef.current.movements.filter((m) => m.productId === productId).slice(0, 8);
  }, []);

  const addCreditPayment = useCallback(
    (customerId: string, amount: number, method: CashMethod, note = 'Abono') => {
      const s = dataRef.current;
      const movement: CreditMovement = { id: uid(), customerId, type: 'abono', amount, date: new Date().toISOString(), employee, note, method };
      dispatch({ type: 'CREDIT_PAYMENT', movement });
      const customer = s.customers.find((c) => c.id === customerId);
      enqueue({
        tipo: 'abono',
        title: `Abono · ${customer?.name ?? 'cliente'}`,
        detail: money(amount),
        customerId,
        datos: { customerId, id: movement.id, amount, method, note, turnoId: s.shift.id ?? null, date: movement.date },
      });
    },
    [enqueue, employee],
  );

  const nextSaleFolio = (s: Data) => {
    const own = s.sales.filter((x) => x.serie === s.caja?.serie && x.origin !== 'pedido').map((x) => x.folio);
    return Math.max(s.caja?.lastSaleFolio ?? 0, 0, ...own) + 1;
  };

  // A crédito, `paid` es lo que el cliente abona en efectivo al momento; el resto queda a su cuenta
  const confirmSale = useCallback(
    async (method: PaymentMethod, paid: number): Promise<Outcome<Sale>> => {
      if (navigator.onLine) await flush();
      const s = dataRef.current;
      if (!s.caja) return { ok: false, message: 'Esta caja todavía no se conecta con el servidor. Revisa la conexión.' };
      if (!s.shift.id || s.closedCutId) return { ok: false, code: 'turno-cerrado', message: 'No hay un turno abierto. Ábrelo en «Corte del día» para cobrar.' };
      if (!s.ticket.length) return { ok: false, message: 'La cuenta está vacía.' };
      const folio = nextSaleFolio(s);
      const total = sumLines(s.ticket);
      const customer = s.customers.find((c) => c.id === s.account.customerId);
      const date = new Date().toISOString();
      const items = s.ticket.map((l) => ({
        productId: l.product.id,
        name: l.product.name,
        qty: l.qty,
        price: l.product.price,
        ...(isWeighed(l.product) ? { saleType: 'peso' as const } : {}),
      }));
      const sentIds = s.sent.filter((x) => x.status === 'en-caja' && inActive(s, x)).map((x) => x.id);
      const upfront = method === 'credito' ? Math.min(Math.max(0, paid), total) : 0;
      const body = {
        id: uid(),
        cajaId: s.caja.id,
        turnoId: s.shift.id,
        folio,
        date,
        items,
        method,
        received: method === 'efectivo' ? paid : undefined,
        paid: method === 'credito' ? upfront : undefined,
        customerId: customer?.id,
        sentIds,
        // La API revisa que cuadre con la suma de las líneas (en centavos)
        total,
      };
      const local: Sale = {
        id: body.id,
        folio,
        serie: s.caja.serie,
        date,
        items,
        total,
        method,
        employee,
        paid: method === 'efectivo' || (method === 'credito' && upfront > 0) ? paid : undefined,
        customerId: customer?.id,
        customerName: customer?.name,
        turnoId: s.shift.id,
      };

      // Con conexión y sin pendientes, el servidor revisa la existencia antes de cobrar
      if (navigator.onLine && queueRef.current.length === 0) {
        try {
          const v = await request<VentaDto>('POST', '/ventas', body);
          const sale = { ...toSale(v), customerName: v.customerName ?? customer?.name };
          dispatch({ type: 'CONFIRM_SALE', sale, applyStock: false });
          if (customer && method === 'credito') void refreshCredit(customer.id);
          return { ok: true, value: sale };
        } catch (e) {
          if (!isNetworkError(e)) return refused(e, 'No se pudo cobrar.');
        }
      }

      // Sin conexión: se cobra aquí y sube después (el servidor la acepta aunque la existencia quede negativa)
      const sale = { ...local, pending: true };
      dispatch({ type: 'CONFIRM_SALE', sale, applyStock: true });
      if (customer && upfront > 0) {
        dispatch({
          type: 'CREDIT_PAYMENT',
          movement: { id: `ab-${sale.id}`, customerId: customer.id, type: 'abono', amount: upfront, date, employee, note: `Abono inicial · venta #${folio}`, method: 'efectivo', saleId: sale.id },
        });
      }
      enqueue({ tipo: 'venta', title: `Venta #${folio}`, detail: money(total), saleId: sale.id, customerId: customer?.id, datos: body });
      return { ok: true, value: sale, offline: true };
    },
    [flush, enqueue, employee, refreshCredit],
  );

  const orderCall = useCallback(async (id: string, action: string, body: unknown, fallback: string): Promise<Outcome<null>> => {
    if (!navigator.onLine) return { ok: false, code: 'sin-conexion', message: 'Sin conexión con el servidor. Revisa la conexión e intenta de nuevo.' };
    try {
      const o = await request<PedidoGestionDto>('POST', `/gestion/pedidos/${enc(id)}/${action}`, body);
      dispatch({ type: 'ORDER_UPSERT', order: toOrder(o) });
      return { ok: true, value: null };
    } catch (e) {
      // Alguien más lo cambió: se vuelve a leer
      if (e instanceof ApiError && e.status === 409) {
        void request<PedidoGestionDto>('GET', `/gestion/pedidos/${enc(id)}`)
          .then((o) => dispatch({ type: 'ORDER_UPSERT', order: toOrder(o) }))
          .catch(() => undefined);
      }
      return refused(e, fallback);
    }
  }, []);

  // Empezar a preparar exige que alcance el inventario (lo revisa el servidor; si no, se queda en pendiente)
  const advanceOrder = useCallback(
    async (id: string) => {
      const o = dataRef.current.orders.find((x) => x.id === id);
      if (!o) return { ok: false, message: 'No encontramos ese pedido. Revisa el código e inténtalo de nuevo.' } as Outcome<null>;
      return orderCall(id, 'avanzar', { from: o.status }, 'No se pudo cambiar el pedido.');
    },
    [orderCall],
  );

  // Entregar: el servidor valida el código, crea la venta (serie P) y descuenta la existencia
  const deliverOrder = useCallback(
    async (id: string, method: CashMethod, received: number, pickupCode: string): Promise<Outcome<Sale>> => {
      const s = dataRef.current;
      const done = s.sales.find((x) => x.orderId === id);
      const o = s.orders.find((x) => x.id === id);
      if (o?.status === 'entregado' && done) return { ok: true, value: done };
      if (!navigator.onLine) return { ok: false, code: 'sin-conexion', message: 'Entregar un pedido requiere conexión con el servidor.' };
      try {
        const r = await request<{ order: PedidoGestionDto; sale: VentaDto }>('POST', `/gestion/pedidos/${enc(id)}/entregar`, {
          code: pickupCode,
          method,
          received: method === 'efectivo' ? received : undefined,
          cajaId: s.caja?.id,
          turnoId: s.shift.id,
        });
        const sale = toSale(r.sale);
        dispatch({ type: 'ORDER_UPSERT', order: toOrder(r.order) });
        dispatch({ type: 'CONFIRM_SALE', sale, applyStock: false });
        return { ok: true, value: sale };
      } catch (e) {
        return refused(e, 'No se pudo entregar el pedido.');
      }
    },
    [],
  );

  const ticketTotal = sumLines(data.ticket);
  const accounts: AccountView[] = [
    { ...data.account, lines: data.ticket, active: true },
    ...data.parked.map((p) => ({ ...p, active: false })),
  ]
    .sort((a, b) => a.openedAt - b.openedAt)
    .map(({ lines, ...a }) => ({ ...a, count: lines.reduce((n, l) => n + l.qty, 0), total: sumLines(lines) }));
  const ticketCount = data.ticket.reduce((s, l) => s + l.qty, 0);

  // El celular elige a qué cuenta abierta mandar lo que escanea: se le avisan cada vez que cambian.
  // productIds: lo que tiene cada cuenta, para que el servidor no deje borrar un producto que está en una.
  const productIdsOf = (id: string) =>
    [...new Set((id === data.account.id ? data.ticket : data.parked.find((p) => p.id === id)?.lines ?? []).map((l) => l.product.id))];
  const accountsKey = JSON.stringify(accounts.map((a) => [a.id, a.name, a.customerId, a.active, a.count, productIdsOf(a.id)]));
  useEffect(() => {
    const caja = dataRef.current.caja;
    if (!hubUp || !caja || !hubRef.current) return;
    const t = window.setTimeout(() => {
      void hubRef.current?.invoke(
        'PublicarCuentas',
        caja.id,
        accounts.map((a) => ({ id: a.id, name: a.name, customerId: a.customerId, active: a.active, count: a.count, productIds: productIdsOf(a.id) })),
      );
    }, 250);
    return () => window.clearTimeout(t);
  }, [accountsKey, hubUp]); // eslint-disable-line react-hooks/exhaustive-deps

  // Disponible = existencia − apartado por pedidos − piezas que ya están en alguna cuenta abierta.
  // La pantalla solo avisa con esto; quien decide al cobrar es el servidor.
  const reserved = reservedStock(data.orders);
  const inAccounts = piecesByProduct(
    [data.ticket, ...data.parked.map((p) => p.lines)].flat().map((l) => ({ productId: l.product.id, qty: l.qty })),
  );
  const stockOf = (id: string) => view.products.find((p) => p.id === id)?.stock ?? 0;
  const availableFor = (id: string) => availableStock(stockOf(id), reserved[id], inAccounts[id]);
  // Líneas de la cuenta activa que ya no alcanzan (por ejemplo, un pedido apartó las piezas después)
  const ticketShortages: Shortage[] = data.ticket.flatMap((l) => {
    const room = availableStock(stockOf(l.product.id), reserved[l.product.id], (inAccounts[l.product.id] ?? 0) - l.qty);
    return l.qty > room ? [{ product: l.product, qty: l.qty, available: room }] : [];
  });

  const online = netOnline && (hubUp || !session);

  const value: AppState = {
    caja: data.caja,
    store: data.store,
    ticketConfig: data.ticketConfig,
    users: data.users,
    movements: data.movements,
    ticket: data.ticket,
    account: data.account,
    parked: data.parked,
    customers: data.customers,
    creditMovements: data.creditMovements,
    sales: data.sales,
    sent: data.sent,
    lastScan: data.lastScan,
    cuts: data.cuts,
    cashMovements: data.cashMovements,
    shift: data.shift,
    devices: data.devices,
    pairing: data.pairing,
    closedCutId: data.closedCutId,
    lastSaleId: data.lastSaleId,
    orders: data.orders,
    products: view.products,
    pending: view.pending,
    online,
    syncConnected: hubUp,
    ready,
    uploading,
    lastUpload,

    isLive: (key) => presence.has(key),
    newPairingCode: async () => {
      try {
        const c = await request<CodigoVinculacionDto>('POST', '/dispositivos/codigo');
        dispatch({ type: 'SET_PAIRING', pairing: { code: c.code, expiresAt: Date.parse(c.expiresAt), qr: c.qr } });
        return { ok: true, value: null };
      } catch (e) {
        return refused(e, 'No se pudo generar el código.');
      }
    },
    removeDevice: async (id) => {
      try {
        await request('DELETE', `/dispositivos/${enc(id)}`);
        dispatch({ type: 'REMOVE_DEVICE', id });
        return { ok: true, value: null };
      } catch (e) {
        return refused(e, 'No se pudo quitar el celular.');
      }
    },
    // Va directo a la API: ella revisa los pedidos de los clientes y las cuentas de las otras cajas, y avisa a todos
    deleteProduct: async (id) => {
      const s = dataRef.current;
      if (!s.products.some((p) => p.id === id)) return { ok: false, code: 'no-existe', message: 'Ese producto ya no existe.' };
      const busy = productInUse(id, s);
      if (busy) return { ok: false, code: 'producto-en-uso', message: busy };
      if (queueRef.current.some((op) => op.product?.id === id || op.datos.productId === id))
        return { ok: false, code: 'pendiente', message: 'Este producto tiene cambios sin subir. Espera a que se suban e intenta de nuevo.' };
      try {
        await request('DELETE', `/productos/${enc(id)}`);
        dispatch({ type: 'DELETE_PRODUCT', id });
        return { ok: true, value: null };
      } catch (e) {
        return refused(e, 'No se pudo borrar el producto.');
      }
    },

    user,
    login: async (email, password) => {
      try {
        return begin(await request<AuthRespuesta>('POST', '/auth/entrar', { email, password }), email);
      } catch (e) {
        if (isNetworkError(e)) return 'No se pudo contactar al servidor. Revisa la conexión.';
        return e instanceof ApiError && e.message ? e.message : 'No se pudo iniciar sesión.';
      }
    },
    registerStore: async (input) => {
      try {
        return begin(await request<AuthRespuesta>('POST', '/auth/registro-tienda', input), input.email);
      } catch (e) {
        if (isNetworkError(e)) return 'No se pudo contactar al servidor. Revisa la conexión.';
        if (e instanceof ApiError && e.body.fields) return Object.values(e.body.fields)[0] ?? e.message;
        return e instanceof ApiError && e.message ? e.message : 'No se pudo crear la tienda.';
      }
    },
    logout: () => logout(false),
    refresh: () => loadAll(true),

    saveProduct,
    findByBarcode,
    movementsFor,

    ticketTotal,
    ticketCount,
    availableFor,
    ticketShortages,
    ticketAdd: (product, qty = 1) => dispatch({ type: 'TICKET_ADD', product, qty, at: Date.now() }),
    ticketQty: (productId, delta) => dispatch({ type: 'TICKET_QTY', productId, delta }),
    ticketSetQty: (productId, qty) => dispatch({ type: 'TICKET_SET_QTY', productId, qty }),
    ticketRemove: (productId) => dispatch({ type: 'TICKET_REMOVE', productId }),
    ticketClear: () => {
      // Lo que mandó el celular a esta cuenta queda cancelado también en el servidor
      const s = dataRef.current;
      s.sent
        .filter((x) => x.status === 'en-caja' && inActive(s, x))
        .forEach((x) => void request('POST', `/envios/${enc(x.id)}/cancelar`).catch(() => undefined));
      dispatch({ type: 'TICKET_CLEAR' });
    },
    confirmSale,
    advanceOrder,
    cancelOrder: (id, reason, missing, note) =>
      orderCall(id, 'cancelar', { reason: reason === 'cliente' ? 'otro' : reason, missing, note: note?.trim() || undefined }, 'No se pudo cancelar el pedido.'),
    reportShortage: (id, missing) => orderCall(id, 'agotado', { missing }, 'No se pudo avisar al cliente.'),
    verifyPickupCode: async (raw) => {
      if (!navigator.onLine) return { ok: false, code: 'sin-conexion', message: 'Entregar un pedido requiere conexión con el servidor.' };
      try {
        const o = toOrder(await request<PedidoGestionDto>('POST', '/gestion/pedidos/buscar-codigo', { code: raw }));
        dispatch({ type: 'ORDER_UPSERT', order: o });
        return { ok: true, value: o };
      } catch (e) {
        return refused(e, 'No se pudo revisar el código.');
      }
    },
    deliverOrder,

    accounts,
    newAccount: () => dispatch({ type: 'ACCOUNT_NEW', id: uid(), at: Date.now() }),
    switchAccount: (id) => dispatch({ type: 'ACCOUNT_SWITCH', id }),
    updateAccount: (id, name, customerId) => dispatch({ type: 'ACCOUNT_UPDATE', id, name, customerId }),
    // Una cuenta con nombre automático toma el del cliente, y lo suelta si se le quita
    linkCustomer: (id, customer) => {
      const all = [data.account, ...data.parked];
      const acc = all.find((a) => a.id === id);
      if (!acc) return;
      const prevName = data.customers.find((c) => c.id === acc.customerId)?.name;
      const auto = /^Cuenta \d+$/.test(acc.name) || acc.name === prevName;
      const name = !auto ? acc.name : customer ? customer.name : nextAccountName(all.filter((a) => a.id !== id));
      dispatch({ type: 'ACCOUNT_UPDATE', id, name, customerId: customer?.id ?? null });
    },

    saveCustomer: (c) => {
      const prev = data.customers.find((x) => x.id === c.id);
      const customer: Customer = {
        ...c,
        id: c.id ?? uid(),
        balance: prev?.balance ?? 0,
        createdAt: prev?.createdAt ?? new Date().toISOString(),
      };
      dispatch({ type: 'UPSERT_CUSTOMER', customer });
      enqueue({
        tipo: 'cliente_credito',
        title: customer.name,
        detail: prev ? 'Cambios del cliente' : 'Cliente nuevo',
        datos: { id: customer.id, name: customer.name, phone: customer.phone, creditLimit: customer.creditLimit, note: customer.note, updatedAt: new Date().toISOString() },
      });
      return customer;
    },
    addCreditPayment: (customerId, amount, method, note) => addCreditPayment(customerId, amount, method, note),

    closeCut: (cut) => {
      const s = dataRef.current;
      const own = s.cuts.filter((c) => c.cajaId === s.caja?.id).map((c) => c.folio);
      const folio = Math.max(s.caja?.lastCutFolio ?? 0, 0, ...own) + 1;
      const id = uid();
      const at = new Date().toISOString();
      dispatch({ type: 'CLOSE_CUT', cut: { ...cut, id, folio, date: at, turnoId: s.shift.id, cajaId: s.caja?.id } });
      if (s.shift.id) {
        enqueue({
          tipo: 'turno_cerrar',
          title: `Corte #${folio}`,
          detail: `Efectivo contado ${money(cut.countedCash)}`,
          datos: { turnoId: s.shift.id, cutId: id, folio, countedCash: cut.countedCash, at },
        });
      }
      return folio;
    },
    openShift: (openingFund) => {
      const s = dataRef.current;
      if (!s.caja) return;
      const shift: Shift = {
        id: uid(),
        name: s.shift.name || 'Turno',
        register: s.caja.name,
        openedAt: new Date().toISOString(),
        openedBy: employee,
        openingFund,
      };
      dispatch({ type: 'OPEN_SHIFT', shift });
      enqueue({
        tipo: 'turno_abrir',
        title: 'Apertura de turno',
        detail: `Fondo ${money(openingFund)}`,
        datos: { id: shift.id, cajaId: s.caja.id, name: shift.name, openingFund, openedAt: shift.openedAt },
      });
    },
    addCashMovement: (type, amount, note) => {
      const s = dataRef.current;
      const movement: CashMovement = { id: uid(), type, amount, note, date: new Date().toISOString(), employee };
      dispatch({ type: 'ADD_CASH_MOVEMENT', movement });
      if (s.shift.id) {
        enqueue({
          tipo: 'movimiento_efectivo',
          title: type === 'entrada' ? 'Entrada de efectivo' : type === 'retiro' ? 'Retiro de efectivo' : 'Gasto',
          detail: money(amount),
          datos: { id: movement.id, turnoId: s.shift.id, type, amount, note, date: movement.date },
        });
      }
    },
    updateStore: async (store) => {
      const before = dataRef.current.store;
      dispatch({ type: 'UPDATE_STORE', store: { ...store, register: before.register } });
      try {
        const t = await request<TiendaDto>('PUT', '/tienda/datos', {
          name: store.name,
          owner: store.owner,
          email: store.email,
          phone: store.phone,
          address: store.address,
          rfc: store.rfc,
          acceptsOrders: store.acceptsOrders,
        });
        dispatch({ type: 'UPDATE_STORE', store: toStore(t, before.register) });
        return { ok: true, value: null };
      } catch (e) {
        dispatch({ type: 'UPDATE_STORE', store: before });
        return refused(e, 'No se pudieron guardar los datos de la tienda.');
      }
    },
    updateTicketConfig: async (config) => {
      const before = dataRef.current.ticketConfig;
      dispatch({ type: 'UPDATE_TICKET_CONFIG', config });
      try {
        const t = await request<TiendaDto>('PUT', '/tienda/datos', { ticketConfig: config });
        dispatch({ type: 'UPDATE_TICKET_CONFIG', config: t.ticketConfig });
        return { ok: true, value: null };
      } catch (e) {
        dispatch({ type: 'UPDATE_TICKET_CONFIG', config: before });
        return refused(e, 'No se pudo guardar el ticket.');
      }
    },
    saveUser: async (u, prevEmail) => {
      const existing = u.id ?? dataRef.current.users.find((x) => x.email.toLowerCase() === (prevEmail ?? u.email).toLowerCase())?.id;
      try {
        const body = { name: u.name, email: u.email, role: u.role, active: u.active };
        const dto = existing
          ? await request<PersonalDto>('PUT', `/usuarios/${enc(existing)}`, body)
          : await request<PersonalDto>('POST', '/usuarios', body);
        const saved = toUser(dto);
        dispatch({ type: 'UPSERT_USER', user: saved, prevEmail });
        return { ok: true, value: saved };
      } catch (e) {
        return refused(e, 'No se pudo guardar el usuario.');
      }
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp fuera de AppProvider');
  return ctx;
}
