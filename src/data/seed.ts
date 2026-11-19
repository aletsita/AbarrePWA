import type {
  CashCut,
  CashMovement,
  CreditMovement,
  Customer,
  Device,
  Movement,
  PaymentMethod,
  Product,
  Sale,
  SaleItem,
  Shift,
  Store,
  TicketConfig,
  User,
} from './models';

const HOUR = 3600000;
const DAY = 24 * HOUR;

function hoursAgo(h: number) {
  return new Date(Date.now() - h * HOUR).toISOString();
}

function dayAt(daysAgo: number, h: number, m: number) {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export const STORE: Store = {
  name: 'Abarrotes Don Pepe',
  owner: 'José Ramírez',
  email: 'donpepe@correo.mx',
  phone: '55 1234 5678',
  address: 'Av. Hidalgo 214, Col. Centro',
  rfc: 'RAJJ800101AB1',
  register: 'Caja 1',
};

export const TICKET: TicketConfig = {
  header: `${STORE.name}\n${STORE.address}`,
  footer: '¡Gracias por su compra!',
  showLogo: true,
  showEmployee: true,
};

export const USERS: User[] = [
  { name: 'José Ramírez', email: 'donpepe@correo.mx', role: 'Dueño', active: true },
  { name: 'Ana López', email: 'ana.lopez@correo.mx', role: 'Cajero', active: true },
  { name: 'Luis Pérez', email: 'luis.p@correo.mx', role: 'Inventario', active: false },
];

const [JOSE, ANA] = [USERS[0].name, USERS[1].name];

export const PRODUCTS: Product[] = [
  { id: 'p01', name: 'Coca-Cola 600 ml', category: 'Bebidas', price: 20, cost: 14.5, stock: 48, minStock: 12, barcode: '7501055300075' },
  { id: 'p02', name: 'Sabritas Original 45 g', category: 'Botanas', price: 21, cost: 15.8, stock: 6, minStock: 8, barcode: '7501011115217' },
  { id: 'p03', name: 'Pan blanco Bimbo grande', category: 'Panadería', price: 52, cost: 41, stock: 9, minStock: 4, barcode: '7441029502120' },
  { id: 'p04', name: 'Leche Lala entera 1 L', category: 'Lácteos', price: 29, cost: 23.5, stock: 3, minStock: 6, barcode: '7501020515008' },
  { id: 'p05', name: 'Maruchan camarón y chile', category: 'Abarrotes', price: 17, cost: 11.9, stock: 36, minStock: 10, barcode: '0041789002113' },
  { id: 'p06', name: 'Huevo blanco 12 pzas', category: 'Abarrotes', price: 48, cost: 39, stock: 0, minStock: 4, barcode: '7501234500129' },
  { id: 'p07', name: 'Tortillas de maíz 1 kg', category: 'Tortillería', price: 24, cost: 18, stock: 14, minStock: 5, barcode: '7501234500211' },
  { id: 'p08', name: 'Frijol negro La Sierra 430 g', category: 'Abarrotes', price: 26, cost: 19.4, stock: 18, minStock: 6, barcode: '7501042300120' },
  { id: 'p09', name: 'Aceite Nutrioli 850 ml', category: 'Abarrotes', price: 46, cost: 37.2, stock: 2, minStock: 4, barcode: '7501039120187' },
  { id: 'p10', name: 'Azúcar estándar 1 kg', category: 'Abarrotes', price: 32, cost: 25, stock: 20, minStock: 6, barcode: '7501234500334' },
  { id: 'p11', name: 'Jabón Zote rosa 400 g', category: 'Limpieza', price: 25, cost: 18.6, stock: 11, minStock: 5, barcode: '7501025400118' },
  { id: 'p12', name: 'Papel higiénico Pétalo 4 rollos', category: 'Limpieza', price: 38, cost: 29.9, stock: 0, minStock: 3, barcode: '7501019001234' },
  { id: 'p13', name: 'Galletas Marías Gamesa', category: 'Galletas', price: 22, cost: 16.2, stock: 15, minStock: 6, barcode: '7501000610119' },
  { id: 'p14', name: 'Agua Ciel 1 L', category: 'Bebidas', price: 14, cost: 9.1, stock: 30, minStock: 12, barcode: '7501055310067' },
  { id: 'p15', name: 'Chiles La Costeña 220 g', category: 'Enlatados', price: 19, cost: 13.7, stock: 5, minStock: 5, barcode: '7501017004121' },
];

function item(id: string, qty: number): SaleItem {
  const p = PRODUCTS.find((x) => x.id === id)!;
  return { productId: p.id, name: p.name, qty, price: p.price };
}

export const CUSTOMERS: Customer[] = [
  { id: 'cl1', name: 'Guadalupe Torres', phone: '55 2345 1188', creditLimit: 1500, balance: 0, note: 'Vecina de la esquina, paga los viernes', createdAt: dayAt(40, 10, 0) },
  { id: 'cl2', name: 'Jesús Martínez', phone: '55 9087 4421', creditLimit: 800, balance: 0, note: '', createdAt: dayAt(25, 12, 30) },
  { id: 'cl3', name: 'Rosa Hernández', phone: '', creditLimit: 500, balance: 0, note: 'Fonda Doña Rosa', createdAt: dayAt(12, 9, 15) },
];

const CUSTOMER_OF: Record<number, Customer> = { 1045: CUSTOMERS[0], 1037: CUSTOMERS[1] };

function sale(folio: number, date: string, items: SaleItem[], method: PaymentMethod, employee = JOSE): Sale {
  const total = items.reduce((s, i) => s + i.qty * i.price, 0);
  const customer = CUSTOMER_OF[folio];
  return {
    customerId: customer?.id,
    customerName: customer?.name,
    id: `v${folio}`,
    folio,
    date,
    items,
    total,
    method,
    employee,
    paid: method === 'efectivo' ? Math.ceil(total / 50) * 50 : undefined,
  };
}

export const SHIFT: Shift = {
  name: 'Turno matutino-vespertino',
  register: STORE.register,
  openedAt: hoursAgo(6.5),
  openedBy: JOSE,
  openingFund: 500,
};

export const SALES: Sale[] = [
  sale(1048, hoursAgo(0.3), [item('p01', 2), item('p02', 1)], 'efectivo'),
  sale(1047, hoursAgo(0.8), [item('p04', 2), item('p03', 1), item('p07', 1)], 'tarjeta', ANA),
  sale(1046, hoursAgo(1.4), [item('p05', 3)], 'efectivo', ANA),
  sale(1045, hoursAgo(2.1), [item('p11', 1), item('p12', 1)], 'credito'),
  sale(1044, hoursAgo(2.9), [item('p14', 2), item('p13', 1)], 'efectivo', ANA),
  sale(1043, hoursAgo(3.6), [item('p08', 2), item('p10', 1), item('p09', 1)], 'tarjeta'),
  sale(1042, hoursAgo(4.7), [item('p06', 1), item('p07', 1)], 'efectivo'),
  sale(1041, hoursAgo(5.9), [item('p01', 1), item('p03', 1)], 'efectivo'),
  sale(1040, dayAt(1, 20, 10), [item('p01', 3), item('p05', 2)], 'efectivo', ANA),
  sale(1039, dayAt(1, 17, 35), [item('p03', 1), item('p04', 1), item('p06', 1)], 'tarjeta'),
  sale(1038, dayAt(1, 13, 2), [item('p14', 4)], 'efectivo'),
  sale(1037, dayAt(2, 19, 48), [item('p09', 1), item('p10', 2), item('p08', 1)], 'credito', ANA),
  sale(1036, dayAt(3, 11, 25), [item('p13', 2), item('p01', 2)], 'efectivo'),
];

export const MOVEMENTS: Movement[] = [
  ...SALES.flatMap((s) =>
    s.items.map((i) => ({
      id: `${s.id}-${i.productId}`,
      productId: i.productId,
      type: 'venta' as const,
      qty: -i.qty,
      date: s.date,
      note: `Venta #${s.folio}`,
    })),
  ),
  ...PRODUCTS.map((p, n) => ({
    id: `e-${p.id}`,
    productId: p.id,
    type: 'entrada' as const,
    qty: 12 + (n % 4) * 6,
    date: dayAt(2 + (n % 3), 9, 10 + n),
    note: 'Compra a proveedor',
  })),
].sort((a, b) => b.date.localeCompare(a.date));

export const CASH_MOVEMENTS: CashMovement[] = [
  { id: 'c1', type: 'entrada', amount: 200, note: 'Cambio adicional (morralla)', date: hoursAgo(5.4), employee: JOSE },
  { id: 'c2', type: 'gasto', amount: 85, note: 'Bolsas y garrafón de agua', date: hoursAgo(4.2), employee: ANA },
  { id: 'c3', type: 'retiro', amount: 300, note: 'Pago a proveedor de refrescos', date: hoursAgo(3.1), employee: JOSE },
  { id: 'c4', type: 'gasto', amount: 40, note: 'Hielo', date: hoursAgo(1.1), employee: ANA },
];

// Cargos de las ventas a crédito y un abono en efectivo de hoy; los saldos salen de aquí
export const CREDIT_MOVEMENTS: CreditMovement[] = ([
  { id: 'ab1', customerId: 'cl2', type: 'abono', amount: 50, date: hoursAgo(1.8), employee: ANA, note: 'Abono', method: 'efectivo' },
  ...SALES.filter((s) => s.method === 'credito').map((s) => ({
    id: `cr-${s.id}`,
    customerId: s.customerId!,
    type: 'cargo' as const,
    amount: s.total,
    date: s.date,
    employee: s.employee,
    note: `Venta #${s.folio}`,
    saleId: s.id,
  })),
] as CreditMovement[]).sort((a, b) => b.date.localeCompare(a.date));

CUSTOMERS.forEach((c) => {
  c.balance = CREDIT_MOVEMENTS.filter((m) => m.customerId === c.id).reduce((n, m) => n + (m.type === 'cargo' ? m.amount : -m.amount), 0);
});

function cut(folio: number, daysAgo: number, salesTotal: number, salesCount: number, cash: number, card: number, counted: number, employee = JOSE): CashCut {
  const cashOut = 150;
  return {
    id: `k${folio}`,
    folio,
    date: dayAt(daysAgo, 21, 5),
    shift: SHIFT.name,
    employee,
    openingFund: 500,
    salesTotal,
    salesCount,
    cashSales: cash,
    cardSales: card,
    transferSales: salesTotal - cash - card,
    cashIn: 0,
    cashOut,
    expectedCash: 500 + cash - cashOut,
    countedCash: counted,
  };
}

export const CUTS: CashCut[] = [
  cut(27, 1, 1846, 31, 1210, 456, 1560),
  cut(26, 2, 2104, 36, 1388, 512, 1738, ANA),
  cut(25, 3, 1712, 29, 1095, 410, 1445),
  cut(24, 4, 1990, 33, 1302, 498, 1652),
  cut(23, 5, 2365, 40, 1540, 600, 1890, ANA),
];

export const DEVICES: Device[] = [
  { id: 'd1', name: 'Celular de José', model: 'Motorola moto g54', owner: JOSE, lastSeen: hoursAgo(0.3), register: STORE.register },
  { id: 'd2', name: 'Celular de Ana', model: 'Samsung Galaxy A15', owner: ANA, lastSeen: dayAt(1, 20, 12), register: STORE.register },
];
