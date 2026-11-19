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
  type CashMovementType,
  type Device,
  type Movement,
  type PaymentMethod,
  type Product,
  type Sale,
  type Shift,
  type Store,
  type TicketConfig,
  type User,
} from '../data/models';
import { CASH_MOVEMENTS, CUTS, DEVICES, MOVEMENTS, PRODUCTS, SALES, SHIFT, STORE, TICKET, USERS } from '../data/seed';
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
  | { type: 'REPLACE_DATA'; data: Data };

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

const VERSION = 4;
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
  return saved && saved.version === VERSION ? saved : seedData();
}

function addToTicket(ticket: TicketLine[], product: Product, qty: number, source: TicketLine['source'], at: number) {
  if (ticket.some((l) => l.product.id === product.id)) {
    return ticket.map((l) => (l.product.id === product.id ? { ...l, product, qty: l.qty + qty, source, flashAt: at } : l));
  }
  return [{ product, qty, source, flashAt: at }, ...ticket];
}

const iso = (at: number) => new Date(at).toISOString();

function reducer(s: Data, a: Action): Data {
  switch (a.type) {
    case 'SCAN_TO_REGISTER':
      return {
        ...s,
        ticket: addToTicket(s.ticket, a.product, a.qty, 'movil', a.at),
        sent: [{ id: a.sentId, product: a.product, qty: a.qty, at: a.at, status: 'en-caja' as SentStatus, deviceId: a.deviceId }, ...s.sent].slice(0, 200),
        lastScan: { name: a.product.name, deviceId: a.deviceId, at: a.at },
      };
    case 'REMOVE_SENT': {
      const item = s.sent.find((x) => x.id === a.sentId);
      if (!item) return s;
      const ticket =
        item.status === 'en-caja'
          ? s.ticket.map((l) => (l.product.id === item.product.id ? { ...l, qty: l.qty - item.qty } : l)).filter((l) => l.qty > 0)
          : s.ticket;
      return { ...s, ticket, sent: s.sent.filter((x) => x.id !== a.sentId) };
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
      return { ...s, ticket: [], sent: s.sent.map((x) => (x.status === 'en-caja' ? { ...x, status: 'cancelado' } : x)) };
    case 'CONFIRM_SALE': {
      const moves: Movement[] = a.sale.items.map((i) => ({
        id: `${a.sale.id}-${i.productId}`,
        productId: i.productId,
        type: 'venta',
        qty: -i.qty,
        date: a.sale.date,
        note: `Venta #${a.sale.folio}`,
      }));
      return {
        ...s,
        sales: [a.sale, ...s.sales],
        movements: [...moves, ...s.movements],
        products: s.products.map((p) => {
          const it = a.sale.items.find((i) => i.productId === p.id);
          return it ? { ...p, stock: Math.max(0, p.stock - it.qty) } : p;
        }),
        ticket: [],
        sent: s.sent.map((x) => (x.status === 'en-caja' ? { ...x, status: 'cobrado' } : x)),
        lastSaleId: a.sale.id,
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
  }
}

interface AppState extends Omit<Data, 'products' | 'version'> {
  products: ProductView[];
  online: boolean;
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

  const confirmSale = useCallback(
    (method: PaymentMethod, paid: number) => {
      const s = dataRef.current;
      const folio = Math.max(...s.sales.map((x) => x.folio), 1000) + 1;
      const total = s.ticket.reduce((n, l) => n + l.qty * l.product.price, 0);
      const offline = !navigator.onLine;
      const sale: Sale = {
        id: `v${folio}-${uid().slice(0, 4)}`,
        folio,
        date: new Date().toISOString(),
        items: s.ticket.map((l) => ({ productId: l.product.id, name: l.product.name, qty: l.qty, price: l.product.price })),
        total,
        method,
        employee,
        paid: method === 'efectivo' ? paid : undefined,
        pending: offline || undefined,
      };
      dispatch({ type: 'CONFIRM_SALE', sale });
      if (offline) setQueue((q) => [...q, { id: uid(), kind: 'venta', saleId: sale.id, at: Date.now() }]);
      return sale;
    },
    [dispatch, employee],
  );

  const ticketTotal = data.ticket.reduce((s, l) => s + l.qty * l.product.price, 0);
  const ticketCount = data.ticket.reduce((s, l) => s + l.qty, 0);

  const value: AppState = {
    ...data,
    products: view.products,
    pending: view.pending,
    online,
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
