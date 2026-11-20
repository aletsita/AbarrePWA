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
  type PaymentMethod,
  type Product,
  type Sale,
  type SaleItem,
  type Shift,
  type Store,
  type TicketConfig,
  type User,
} from '../data/models';
import { nextStatus, orderFolio, reservedStock, type OrderRequest, type PickupOrder } from '../data/pickup';
import { CASH_MOVEMENTS, CREDIT_MOVEMENTS, CUSTOMERS, CUTS, DEVICES, MOVEMENTS, ORDERS, PRODUCTS, SALES, SHIFT, STORE, TICKET, USERS } from '../data/seed';
import { openSync, type SyncLink } from '../lib/sync';

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
}

interface Data {
  version: number;
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
  // Pide y recoge
  orders: PickupOrder[];
}

type StockEntry = { productId: string; qty: number };

type Action =
  | { type: 'SCAN_TO_REGISTER'; product: Product; qty: number; sentId: string; at: number; deviceId: string }
  | { type: 'REMOVE_SENT'; sentId: string }
  | { type: 'TICKET_ADD'; product: Product; qty: number; at: number }
  | { type: 'TICKET_QTY'; productId: string; delta: number }
  | { type: 'TICKET_REMOVE'; productId: string }
  | { type: 'TICKET_CLEAR' }
  | { type: 'CONFIRM_SALE'; sale: Sale }
  | { type: 'MARK_SALE_SYNCED'; saleId: string }
  | { type: 'UPSERT_PRODUCT'; product: Product; isNew: boolean; at: number }
  | { type: 'ADD_STOCK'; entries: StockEntry[]; at: number; note: string }
  | { type: 'ADD_DEVICE'; device: Device }
  | { type: 'REMOVE_DEVICE'; id: string }
  | { type: 'DEVICE_SEEN'; id: string; at: number }
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
  | { type: 'REPLACE_DATA'; data: Data }
  // Pide y recoge: el pedido llega por el canal de sincronización, igual que un producto escaneado
  | { type: 'ORDER_RECEIVED'; request: OrderRequest }
  | { type: 'ORDER_ADVANCE'; id: string; from: PickupOrder['status']; at: number }
  | { type: 'ORDER_DELIVER'; id: string; sale: Sale; payment: { method: CashMethod; received: number }; pickupCode: string };

type Message = Action | { type: 'PING'; key: string } | { type: 'BYE'; key: string } | { type: 'WHO' } | { type: 'SNAPSHOT'; data: Data };

type Op =
  | { id: string; kind: 'producto'; product: Product; isNew: boolean; at: number }
  | { id: string; kind: 'venta'; saleId: string; at: number };

export interface PendingItem {
  id: string;
  kind: Op['kind'];
  title: string;
  detail: string;
  at: number;
  status: SyncState;
}

const VERSION = 5;
const DATA_KEY = 'tendero.datos';
const SESSION_KEY = 'tendero.sesion';
const QUEUE_KEY = 'tendero.pendientes.panel';
const CHANNEL = 'tendero';
const PRESENCE_KEY = 'panel';
const PING_MS = 4000;
const STALE_MS = 10000;

function seedData(): Data {
  return {
    version: VERSION,
    store: STORE,
    ticketConfig: TICKET,
    users: USERS,
    products: PRODUCTS,
    movements: MOVEMENTS,
    ticket: [],
    account: { id: 'a1', name: 'Cuenta 1', customerId: null, openedAt: 0 },
    parked: [],
    customers: CUSTOMERS,
    creditMovements: CREDIT_MOVEMENTS,
    sales: SALES,
    sent: [],
    lastScan: null,
    cuts: CUTS,
    cashMovements: CASH_MOVEMENTS,
    shift: SHIFT,
    devices: DEVICES,
    pairing: null,
    closedCutId: null,
    lastSaleId: null,
    orders: ORDERS,
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
  if (!saved || saved.version !== VERSION) return seedData();
  // Datos guardados antes de Pide y recoge: reciben los pedidos de ejemplo que aún no se entregan
  if (!saved.orders) return { ...saved, orders: ORDERS.filter((o) => o.status !== 'entregado') };
  return {
    ...saved,
    // Pedidos de ejemplo guardados antes de que existiera el código para recoger
    orders: saved.orders.map((o) => (o.pickupCode ? o : { ...o, pickupCode: ORDERS.find((x) => x.id === o.id)?.pickupCode })),
    // Productos de ejemplo guardados antes de que existiera la descripción
    products: saved.products.map((p) => (p.description !== undefined ? p : { ...p, description: PRODUCTS.find((x) => x.id === p.id)?.description })),
  };
}

function addToTicket(ticket: TicketLine[], product: Product, qty: number, source: TicketLine['source'], at: number) {
  if (ticket.some((l) => l.product.id === product.id)) {
    return ticket.map((l) => (l.product.id === product.id ? { ...l, product, qty: l.qty + qty, source, flashAt: at } : l));
  }
  return [{ product, qty, source, flashAt: at }, ...ticket];
}

const iso = (at: number) => new Date(at).toISOString();

const sumLines = (lines: TicketLine[]) => lines.reduce((n, l) => n + l.qty * l.product.price, 0);

// Siguiente "Cuenta N" libre; se calcula en el reducer para que todos los equipos lleguen al mismo nombre
function nextAccountName(accounts: { name: string }[]) {
  const used = accounts.map((a) => Number(/^Cuenta (\d+)$/.exec(a.name)?.[1] ?? 0));
  return `Cuenta ${Math.max(0, ...used) + 1}`;
}

// La cuenta activa pasa a espera; si está vacía y sin cliente simplemente se descarta
function parkActive(s: Data): OpenAccount[] {
  if (!s.ticket.length && !s.account.customerId) return s.parked;
  return [...s.parked, { ...s.account, lines: s.ticket }];
}

// Al cobrar o cancelar, la cuenta activa se cierra y su lugar lo toma una vacía
function resetAccount(s: Data, at: number): AccountInfo {
  return { id: s.account.id, name: nextAccountName(s.parked), customerId: null, openedAt: at };
}

const inActive = (s: Data, x: SentItem) => !x.accountId || x.accountId === s.account.id;

function reducer(s: Data, a: Action): Data {
  switch (a.type) {
    case 'SCAN_TO_REGISTER':
      return {
        ...s,
        ticket: addToTicket(s.ticket, a.product, a.qty, 'movil', a.at),
        sent: [
          { id: a.sentId, product: a.product, qty: a.qty, at: a.at, status: 'en-caja' as SentStatus, deviceId: a.deviceId, accountId: s.account.id },
          ...s.sent,
        ].slice(0, 200),
        lastScan: { name: a.product.name, deviceId: a.deviceId, at: a.at },
      };
    case 'REMOVE_SENT': {
      const item = s.sent.find((x) => x.id === a.sentId);
      if (!item) return s;
      const take = (lines: TicketLine[]) =>
        lines.map((l) => (l.product.id === item.product.id ? { ...l, qty: l.qty - item.qty } : l)).filter((l) => l.qty > 0);
      const waiting = item.status === 'en-caja';
      return {
        ...s,
        ticket: waiting && inActive(s, item) ? take(s.ticket) : s.ticket,
        parked: waiting ? s.parked.map((p) => (p.id === item.accountId ? { ...p, lines: take(p.lines) } : p)) : s.parked,
        sent: s.sent.filter((x) => x.id !== a.sentId),
      };
    }
    case 'TICKET_ADD':
      return { ...s, ticket: addToTicket(s.ticket, a.product, a.qty, 'manual', a.at) };
    case 'TICKET_QTY':
      return {
        ...s,
        ticket: s.ticket.map((l) => (l.product.id === a.productId ? { ...l, qty: l.qty + a.delta } : l)).filter((l) => l.qty > 0),
      };
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
      if (a.sale.orderId && s.sales.some((x) => x.id === a.sale.id || x.orderId === a.sale.orderId)) return s;
      const moves: Movement[] = a.sale.items.map((i) => ({
        id: `${a.sale.id}-${i.productId}`,
        productId: i.productId,
        type: 'venta',
        qty: -i.qty,
        date: a.sale.date,
        note: `Venta #${a.sale.folio}`,
      }));
      const charge: CreditMovement | null =
        a.sale.method === 'credito' && a.sale.customerId
          ? {
              id: `cr-${a.sale.id}`,
              customerId: a.sale.customerId,
              type: 'cargo',
              amount: a.sale.total,
              date: a.sale.date,
              employee: a.sale.employee,
              note: `Venta #${a.sale.folio}`,
              saleId: a.sale.id,
            }
          : null;
      return {
        ...s,
        sales: [a.sale, ...s.sales],
        movements: [...moves, ...s.movements],
        customers: charge ? s.customers.map((c) => (c.id === charge.customerId ? { ...c, balance: c.balance + charge.amount } : c)) : s.customers,
        creditMovements: charge ? [charge, ...s.creditMovements] : s.creditMovements,
        products: s.products.map((p) => {
          const it = a.sale.items.find((i) => i.productId === p.id);
          return it ? { ...p, stock: Math.max(0, p.stock - it.qty) } : p;
        }),
        // La venta de un pedido no sale de la cuenta abierta: esa se queda como está
        ...(a.sale.orderId
          ? {}
          : {
              ticket: [],
              account: resetAccount(s, Date.parse(a.sale.date)),
              sent: s.sent.map((x) => (x.status === 'en-caja' && inActive(s, x) ? { ...x, status: 'cobrado' as const } : x)),
              lastSaleId: a.sale.id,
            }),
      };
    }
    case 'MARK_SALE_SYNCED':
      return { ...s, sales: s.sales.map((x) => (x.id === a.saleId ? { ...x, pending: false } : x)) };
    case 'UPSERT_PRODUCT': {
      const prev = s.products.find((p) => p.id === a.product.id);
      const diff = a.product.stock - (prev?.stock ?? 0);
      const move: Movement | null = !prev
        ? { id: uid(), productId: a.product.id, type: 'alta', qty: a.product.stock, date: iso(a.at), note: 'Alta del producto' }
        : diff !== 0
          ? { id: uid(), productId: a.product.id, type: 'ajuste', qty: diff, date: iso(a.at), note: 'Ajuste de existencia' }
          : null;
      return {
        ...s,
        products: prev ? s.products.map((p) => (p.id === a.product.id ? a.product : p)) : [a.product, ...s.products],
        movements: move ? [move, ...s.movements] : s.movements,
        ticket: s.ticket.map((l) => (l.product.id === a.product.id ? { ...l, product: a.product } : l)),
        parked: s.parked.map((p) => ({ ...p, lines: p.lines.map((l) => (l.product.id === a.product.id ? { ...l, product: a.product } : l)) })),
      };
    }
    case 'ADD_STOCK':
      return {
        ...s,
        products: s.products.map((p) => {
          const qty = a.entries.filter((e) => e.productId === p.id).reduce((n, e) => n + e.qty, 0);
          return qty ? { ...p, stock: p.stock + qty } : p;
        }),
        movements: [
          ...a.entries.map((e) => ({ id: uid(), productId: e.productId, type: 'entrada' as const, qty: e.qty, date: iso(a.at), note: a.note })),
          ...s.movements,
        ],
      };
    case 'ADD_DEVICE':
      return { ...s, devices: [...s.devices.filter((d) => d.id !== a.device.id), a.device] };
    case 'REMOVE_DEVICE':
      return { ...s, devices: s.devices.filter((d) => d.id !== a.id) };
    case 'DEVICE_SEEN':
      return { ...s, devices: s.devices.map((d) => (d.id === a.id ? { ...d, lastSeen: iso(a.at) } : d)) };
    case 'REPLACE_DATA':
      return a.data;
    case 'ORDER_RECEIVED': {
      // Los precios y la existencia los pone la caja; si algo no alcanza, el pedido no se acepta
      const r = a.request;
      if (s.orders.some((o) => o.id === r.id) || !/^\d{6}$/.test(String(r.pickupCode ?? ''))) return s;
      const qty: Record<string, number> = {};
      for (const it of r.items) qty[it.productId] = (qty[it.productId] ?? 0) + Math.floor(it.qty);
      const reserved = reservedStock(s.orders);
      const items: SaleItem[] = [];
      for (const [id, n] of Object.entries(qty)) {
        const p = s.products.find((x) => x.id === id);
        if (!p || p.showInApp === false || n < 1 || n > p.stock - (reserved[id] ?? 0)) return s;
        items.push({ productId: p.id, name: p.name, qty: n, price: p.price });
      }
      if (!items.length) return s;
      const n = Math.max(0, ...s.orders.map((o) => Number(o.folio.slice(2)) || 0)) + 1;
      const at = iso(r.at);
      const order: PickupOrder = {
        id: r.id,
        folio: orderFolio(n),
        customer: r.customer,
        items,
        note: (r.note ?? '').trim().slice(0, 300),
        total: items.reduce((t, i) => t + i.qty * i.price, 0),
        status: 'pendiente',
        createdAt: at,
        updatedAt: at,
        pickupCode: r.pickupCode,
      };
      return { ...s, orders: [order, ...s.orders] };
    }
    case 'ORDER_ADVANCE': {
      // Solo avanza una etapa; "entregado" exige cobro (ORDER_DELIVER)
      const o = s.orders.find((x) => x.id === a.id);
      const next = o && nextStatus(o.status);
      if (!o || o.status !== a.from || !next || next === 'entregado') return s;
      return { ...s, orders: s.orders.map((x) => (x.id === a.id ? { ...x, status: next, updatedAt: iso(a.at) } : x)) };
    }
    case 'ORDER_DELIVER': {
      const o = s.orders.find((x) => x.id === a.id);
      // Sin el código del cliente no se entrega, venga de esta caja o de otro equipo
      if (!o || o.status !== 'listo' || (o.pickupCode && o.pickupCode !== a.pickupCode)) return s;
      const after = reducer(s, { type: 'CONFIRM_SALE', sale: a.sale });
      return {
        ...after,
        orders: after.orders.map((x) =>
          x.id === a.id ? { ...x, status: 'entregado', updatedAt: a.sale.date, deliveredAt: a.sale.date, payment: a.payment, saleId: a.sale.id } : x,
        ),
      };
    }
    case 'SET_PAIRING':
      return { ...s, pairing: a.pairing };
    case 'CLOSE_CUT':
      return { ...s, cuts: [a.cut, ...s.cuts], closedCutId: a.cut.id };
    case 'OPEN_SHIFT':
      return { ...s, shift: a.shift, cashMovements: [], closedCutId: null };
    case 'ADD_CASH_MOVEMENT':
      return { ...s, cashMovements: [a.movement, ...s.cashMovements] };
    case 'UPDATE_STORE':
      return { ...s, store: a.store };
    case 'UPDATE_TICKET_CONFIG':
      return { ...s, ticketConfig: a.config };
    case 'UPSERT_USER': {
      const key = a.prevEmail ?? a.user.email;
      const exists = s.users.some((u) => u.email === key);
      return { ...s, users: exists ? s.users.map((u) => (u.email === key ? a.user : u)) : [...s.users, a.user] };
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
  }
}

interface AppState extends Omit<Data, 'products' | 'version'> {
  products: ProductView[];
  online: boolean;
  syncConnected: boolean;
  uploading: boolean;
  pending: PendingItem[];
  lastUpload: { count: number; at: number } | null;

  isLive: (key: string) => boolean;
  newPairingCode: () => void;
  removeDevice: (id: string) => void;

  user: User | null;
  login: (email: string, password: string) => boolean;
  registerStore: (storeName: string, name: string, email: string) => void;
  logout: () => void;

  saveProduct: (p: Product, isNew: boolean) => 'enviado' | 'pendiente';
  findByBarcode: (code: string) => ProductView | undefined;
  movementsFor: (productId: string) => Movement[];

  ticketTotal: number;
  ticketCount: number;
  ticketAdd: (p: Product, qty?: number) => void;
  ticketQty: (productId: string, delta: number) => void;
  ticketRemove: (productId: string) => void;
  ticketClear: () => void;
  confirmSale: (method: PaymentMethod, paid: number) => Sale;

  receiveOrder: (request: OrderRequest) => void;
  advanceOrder: (id: string) => void;
  deliverOrder: (id: string, method: CashMethod, received: number, pickupCode: string) => Sale | null;

  accounts: AccountView[];
  newAccount: () => void;
  switchAccount: (id: string) => void;
  updateAccount: (id: string, name: string, customerId: string | null) => void;
  linkCustomer: (id: string, customer: Customer | null) => void;

  saveCustomer: (c: Omit<Customer, 'id' | 'balance' | 'createdAt'> & { id?: string }) => Customer;
  addCreditPayment: (customerId: string, amount: number, method: CashMethod, note?: string) => void;

  closeCut: (cut: CashCut) => void;
  openShift: (openingFund: number) => void;
  addCashMovement: (type: CashMovementType, amount: number, note: string) => void;
  updateStore: (store: Store) => void;
  updateTicketConfig: (config: TicketConfig) => void;
  saveUser: (user: User, prevEmail?: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, localDispatch] = useReducer(reducer, undefined, loadData);
  const dataRef = useRef(data);
  dataRef.current = data;
  const channel = useRef<SyncLink | null>(null);

  const [queue, setQueue] = useState<Op[]>(() => read(QUEUE_KEY, []));
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const [uploading, setUploading] = useState(false);
  const flushing = useRef(false);
  const [lastUpload, setLastUpload] = useState<{ count: number; at: number } | null>(null);

  const [online, setOnline] = useState(navigator.onLine);
  const [syncConnected, setSyncConnected] = useState(false);
  const [presence, setPresence] = useState<Record<string, number>>({});
  const presenceRef = useRef(presence);
  presenceRef.current = presence;

  const [sessionEmail, setSessionEmail] = useState<string | null>(() => read(SESSION_KEY, null));

  const dispatch = useCallback((a: Action) => {
    localDispatch(a);
    channel.current?.post(a);
  }, []);

  useEffect(() => write(DATA_KEY, data), [data]);
  useEffect(() => write(QUEUE_KEY, queue), [queue]);
  useEffect(() => write(SESSION_KEY, sessionEmail), [sessionEmail]);

  const markSeen = useCallback((keys: string[]) => {
    keys.filter((k) => k !== 'panel').forEach((id) => dispatch({ type: 'DEVICE_SEEN', id, at: presenceRef.current[id] ?? Date.now() }));
  }, [dispatch]);

  useEffect(() => {
    const share = () => ch.post({ type: 'SNAPSHOT', data: dataRef.current });
    const ch = openSync(
      CHANNEL,
      (raw) => onMessage(raw as Message),
      () => {
        ch.post({ type: 'WHO' });
        share();
      },
      setSyncConnected,
    );
    channel.current = ch;
    const onMessage = (msg: Message) => {
      if (msg.type === 'SNAPSHOT') return;
      if (msg.type === 'PING') setPresence((p) => ({ ...p, [msg.key]: Date.now() }));
      else if (msg.type === 'BYE') {
        if (!(msg.key in presenceRef.current)) return;
        markSeen([msg.key]);
        setPresence((p) => {
          const next = { ...p };
          delete next[msg.key];
          return next;
        });
      } else if (msg.type === 'WHO') {
        if (navigator.onLine) ch.post({ type: 'PING', key: PRESENCE_KEY });
        share();
      } else localDispatch(msg);
    };
    ch.post({ type: 'WHO' });
    share();
    return () => ch.close();
  }, [markSeen]);

  useEffect(() => {
    const ch = channel.current;
    if (!ch) return;
    if (!online) {
      ch.post({ type: 'BYE', key: PRESENCE_KEY });
      return;
    }
    const ping = () => ch.post({ type: 'PING', key: PRESENCE_KEY });
    ping();
    const t = window.setInterval(ping, PING_MS);
    const bye = () => ch.post({ type: 'BYE', key: PRESENCE_KEY });
    window.addEventListener('pagehide', bye);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('pagehide', bye);
      bye();
    };
  }, [online]);

  useEffect(() => {
    const t = window.setInterval(() => {
      const now = Date.now();
      const stale = Object.keys(presenceRef.current).filter((k) => now - presenceRef.current[k] > STALE_MS);
      if (!stale.length) return;
      markSeen(stale);
      setPresence((p) => {
        const next = { ...p };
        stale.forEach((k) => delete next[k]);
        return next;
      });
    }, 3000);
    return () => window.clearInterval(t);
  }, [markSeen]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const opToAction = useCallback((op: Op): Action => {
    switch (op.kind) {
      case 'producto':
        return { type: 'UPSERT_PRODUCT', product: op.product, isNew: op.isNew, at: op.at };
      case 'venta':
        return { type: 'MARK_SALE_SYNCED', saleId: op.saleId };
    }
  }, []);

  const flush = useCallback(() => {
    if (flushing.current || !navigator.onLine || queueRef.current.length === 0) return;
    flushing.current = true;
    setUploading(true);
    window.setTimeout(() => {
      flushing.current = false;
      setUploading(false);
      if (!navigator.onLine) return;
      const ops = queueRef.current;
      ops.forEach((op) => dispatch(opToAction(op)));
      const ids = new Set(ops.map((o) => o.id));
      setQueue((q) => q.filter((o) => !ids.has(o.id)));
      setLastUpload({ count: ops.length, at: Date.now() });
    }, 1500);
  }, [dispatch, opToAction]);

  useEffect(() => {
    if (online) flush();
  }, [online, flush]);

  const run = useCallback((op: Op) => {
    if (navigator.onLine) {
      dispatch(opToAction(op));
      return 'enviado' as const;
    }
    setQueue((q) => [...q, op]);
    return 'pendiente' as const;
  }, [dispatch, opToAction]);

  const view = useMemo(() => {
    const status: SyncState = uploading ? 'subiendo' : 'pendiente';
    const byId = new Map<string, ProductView>(data.products.map((p) => [p.id, p]));
    const created: string[] = [];
    const pending: PendingItem[] = [];

    for (const op of queue) {
      if (op.kind === 'producto') {
        if (op.isNew && !byId.has(op.product.id)) created.unshift(op.product.id);
        byId.set(op.product.id, { ...op.product, sync: status });
        pending.push({ id: op.id, kind: op.kind, title: op.product.name, detail: op.isNew ? 'Producto nuevo' : 'Cambios del producto', at: op.at, status });
      } else {
        const sale = data.sales.find((x) => x.id === op.saleId);
        pending.push({
          id: op.id,
          kind: op.kind,
          title: `Venta #${sale?.folio ?? ''}`,
          detail: sale ? money(sale.total) : 'Venta',
          at: op.at,
          status,
        });
      }
    }

    const createdSet = new Set(created);
    const products = [...created.map((id) => byId.get(id)!), ...[...byId.values()].filter((p) => !createdSet.has(p.id))];
    return { products, pending: pending.reverse() };
  }, [data.products, data.sales, queue, uploading]);

  const viewRef = useRef(view);
  viewRef.current = view;

  const saveProduct = useCallback(
    (product: Product, isNew: boolean) => run({ id: uid(), kind: 'producto', product, isNew, at: Date.now() }),
    [run],
  );
  const findByBarcode = useCallback((code: string) => viewRef.current.products.find((p) => p.barcode === code.trim()), []);
  const movementsFor = useCallback(
    (productId: string) => dataRef.current.movements.filter((m) => m.productId === productId).slice(0, 8),
    [],
  );

  const user = data.users.find((u) => u.email === sessionEmail && u.active) ?? null;
  const employee = user?.name ?? data.store.owner;

  const addCreditPayment = useCallback(
    (customerId: string, amount: number, method: CashMethod, note = 'Abono', saleId?: string) =>
      dispatch({
        type: 'CREDIT_PAYMENT',
        movement: { id: uid(), customerId, type: 'abono', amount, date: new Date().toISOString(), employee, note, method, saleId },
      }),
    [dispatch, employee],
  );

  // A crédito, `paid` es lo que el cliente abona en efectivo al momento; el resto queda a su cuenta
  const confirmSale = useCallback(
    (method: PaymentMethod, paid: number) => {
      const s = dataRef.current;
      const folio = Math.max(...s.sales.map((x) => x.folio), 1000) + 1;
      const total = sumLines(s.ticket);
      const customer = s.customers.find((c) => c.id === s.account.customerId);
      const offline = !navigator.onLine;
      const sale: Sale = {
        id: `v${folio}-${uid().slice(0, 4)}`,
        folio,
        date: new Date().toISOString(),
        items: s.ticket.map((l) => ({ productId: l.product.id, name: l.product.name, qty: l.qty, price: l.product.price })),
        total,
        method,
        employee,
        paid: method === 'efectivo' || (method === 'credito' && paid > 0) ? paid : undefined,
        pending: offline || undefined,
        customerId: customer?.id,
        customerName: customer?.name,
      };
      dispatch({ type: 'CONFIRM_SALE', sale });
      if (method === 'credito' && customer && paid > 0) {
        addCreditPayment(customer.id, Math.min(paid, total), 'efectivo', `Abono inicial · venta #${folio}`, sale.id);
      }
      if (offline) setQueue((q) => [...q, { id: uid(), kind: 'venta', saleId: sale.id, at: Date.now() }]);
      return sale;
    },
    [dispatch, employee, addCreditPayment],
  );

  const advanceOrder = useCallback(
    (id: string) => {
      const o = dataRef.current.orders.find((x) => x.id === id);
      if (o) dispatch({ type: 'ORDER_ADVANCE', id, from: o.status, at: Date.now() });
    },
    [dispatch],
  );

  // Entregar y cobrar: la venta entra por el mismo flujo que una de mostrador, una sola vez por pedido
  const deliverOrder = useCallback(
    (id: string, method: CashMethod, received: number, pickupCode: string) => {
      const s = dataRef.current;
      const o = s.orders.find((x) => x.id === id);
      if (!o || o.status !== 'listo') return s.sales.find((x) => x.orderId === id) ?? null;
      if (o.pickupCode && o.pickupCode !== pickupCode) return null;
      const folio = Math.max(...s.sales.map((x) => x.folio), 1000) + 1;
      const offline = !navigator.onLine;
      const sale: Sale = {
        id: `pedido-${o.id}`,
        folio,
        date: new Date().toISOString(),
        items: o.items,
        total: o.total,
        method,
        employee,
        paid: method === 'efectivo' ? received : undefined,
        pending: offline || undefined,
        customerName: o.customer.name,
        origin: 'pedido',
        orderId: o.id,
        orderFolio: o.folio,
      };
      dispatch({ type: 'ORDER_DELIVER', id, sale, payment: { method, received: method === 'efectivo' ? received : o.total }, pickupCode });
      if (offline) setQueue((q) => [...q, { id: uid(), kind: 'venta', saleId: sale.id, at: Date.now() }]);
      return sale;
    },
    [dispatch, employee],
  );

  const ticketTotal = sumLines(data.ticket);
  const accounts: AccountView[] = [
    { ...data.account, lines: data.ticket, active: true },
    ...data.parked.map((p) => ({ ...p, active: false })),
  ]
    .sort((a, b) => a.openedAt - b.openedAt)
    .map(({ lines, ...a }) => ({ ...a, count: lines.reduce((n, l) => n + l.qty, 0), total: sumLines(lines) }));
  const ticketCount = data.ticket.reduce((s, l) => s + l.qty, 0);

  const value: AppState = {
    ...data,
    products: view.products,
    pending: view.pending,
    online,
    syncConnected,
    uploading,
    lastUpload,

    isLive: (key) => key in presence,
    newPairingCode: () =>
      dispatch({
        type: 'SET_PAIRING',
        pairing: { code: String(Math.floor(100000 + Math.random() * 900000)), expiresAt: Date.now() + 5 * 60000 },
      }),
    removeDevice: (id) => dispatch({ type: 'REMOVE_DEVICE', id }),

    user,
    login: (email, password) => {
      const mail = email.trim().toLowerCase();
      if (!mail || password.length < 4) return false;
      const found = data.users.find((u) => u.email.toLowerCase() === mail);
      if (found && !found.active) return false;
      if (!found) {
        const name = mail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        dispatch({ type: 'UPSERT_USER', user: { name, email: mail, role: 'Dueño', active: true } });
      }
      setSessionEmail(found?.email ?? mail);
      return true;
    },
    registerStore: (storeName, name, email) => {
      dispatch({ type: 'UPDATE_STORE', store: { ...data.store, name: storeName.trim(), owner: name.trim(), email: email.trim() } });
      dispatch({ type: 'UPSERT_USER', user: { name: name.trim(), email: email.trim(), role: 'Dueño', active: true } });
      setSessionEmail(email.trim());
    },
    logout: () => setSessionEmail(null),

    saveProduct,
    findByBarcode,
    movementsFor,

    ticketTotal,
    ticketCount,
    ticketAdd: (product, qty = 1) => dispatch({ type: 'TICKET_ADD', product, qty, at: Date.now() }),
    ticketQty: (productId, delta) => dispatch({ type: 'TICKET_QTY', productId, delta }),
    ticketRemove: (productId) => dispatch({ type: 'TICKET_REMOVE', productId }),
    ticketClear: () => dispatch({ type: 'TICKET_CLEAR' }),
    confirmSale,
    receiveOrder: (request) => dispatch({ type: 'ORDER_RECEIVED', request }),
    advanceOrder,
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
        id: c.id ?? `cl-${uid()}`,
        balance: prev?.balance ?? 0,
        createdAt: prev?.createdAt ?? new Date().toISOString(),
      };
      dispatch({ type: 'UPSERT_CUSTOMER', customer });
      return customer;
    },
    addCreditPayment: (customerId, amount, method, note) => addCreditPayment(customerId, amount, method, note),

    closeCut: (cut) => dispatch({ type: 'CLOSE_CUT', cut }),
    openShift: (openingFund) =>
      dispatch({
        type: 'OPEN_SHIFT',
        shift: { ...data.shift, openedAt: new Date().toISOString(), openedBy: employee, openingFund },
      }),
    addCashMovement: (type, amount, note) =>
      dispatch({
        type: 'ADD_CASH_MOVEMENT',
        movement: { id: uid(), type, amount, note, date: new Date().toISOString(), employee },
      }),
    updateStore: (store) => dispatch({ type: 'UPDATE_STORE', store }),
    updateTicketConfig: (config) => dispatch({ type: 'UPDATE_TICKET_CONFIG', config }),
    saveUser: (u, prevEmail) => dispatch({ type: 'UPSERT_USER', user: u, prevEmail }),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp fuera de AppProvider');
  return ctx;
}
