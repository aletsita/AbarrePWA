import { itemCount, lineTotal, qtyText } from '../domain/weight';
import { money, ORIGIN_LABEL, PAYMENT_LABEL, saleOrigin, time, type CashCut, type Customer, type Sale, type Store, type TicketConfig } from '../data/models';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const RECEIPT_CSS = `
  @page { size: 80mm auto; margin: 4mm; }
  body { font: 12px/1.4 ui-monospace, Consolas, monospace; color: #000; margin: 0; width: 72mm; }
  .c { text-align: center; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .b { font-weight: 700; }
  h1 { font-size: 14px; margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.n { text-align: right; white-space: nowrap; }
`;

function printHtml(title: string, body: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentWindow!.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${RECEIPT_CSS}</style></head><body>${body}</body></html>`);
  doc.close();
  window.setTimeout(() => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    window.setTimeout(() => frame.remove(), 1000);
  }, 50);
}

// Con `customer`, el ticket de una venta a crédito muestra lo que el cliente debe en total
export function printSale(sale: Sale, store: Store, config: TicketConfig, customer?: Customer) {
  const [first, ...rest] = config.header.split('\n');
  const rows = sale.items
    .map((i) =>
      i.saleType === 'peso'
        ? `<tr><td>${esc(i.name)}<br>${qtyText(i.qty, 'peso')} × ${money(i.price)}/kg</td><td class="n">${money(lineTotal(i.qty, i.price, i.saleType))}</td></tr>`
        : `<tr><td>${i.qty} ${esc(i.name)}</td><td class="n">${money(lineTotal(i.qty, i.price))}</td></tr>`,
    )
    .join('');
  const change = sale.method === 'efectivo' && sale.paid ? sale.paid - sale.total : 0;
  const row = (k: string, v: number) => `<div class="row"><span>${k}</span><span>${money(v)}</span></div>`;
  const payment =
    sale.method === 'credito'
      ? `${sale.paid ? row('Abono en efectivo', sale.paid) : ''}${row('A crédito', sale.total - (sale.paid ?? 0))}
         <div class="sep"></div><div>Cliente: ${esc(sale.customerName ?? '')}</div>${customer ? row('Saldo pendiente', customer.balance) : ''}`
      : sale.method === 'en_linea'
        ? `<div class="row b"><span>PAGADO EN LÍNEA</span><span>${money(sale.total)}</span></div>
         ${sale.customerName ? `<div>Cliente: ${esc(sale.customerName)}</div>` : ''}`
      : `${row(PAYMENT_LABEL[sale.method], sale.paid ?? sale.total)}${sale.method === 'efectivo' ? row('Cambio', change) : ''}
         ${sale.customerName ? `<div>Cliente: ${esc(sale.customerName)}</div>` : ''}`;
  printHtml(
    `Ticket ${sale.folio}`,
    `<div class="c"><h1>${esc(first ?? store.name)}</h1>${rest.map((l) => `<div>${esc(l)}</div>`).join('')}<div>RFC ${esc(store.rfc)}</div></div>
     <div class="sep"></div>
     <div class="c">Folio ${sale.folio} · ${new Date(sale.date).toLocaleDateString('es-MX')} ${time(sale.date)}</div>
     ${sale.orderFolio ? `<div class="c">${ORIGIN_LABEL.pedido} · pedido ${esc(sale.orderFolio)}</div>` : ''}
     <div class="sep"></div>
     <table>${rows}</table>
     <div class="sep"></div>
     <div class="row b"><span>TOTAL</span><span>${money(sale.total)}</span></div>
     ${payment}
     <div class="sep"></div>
     <div class="c">${esc(config.footer).replace(/\n/g, '<br>')}${config.showEmployee ? `<br>Atendió: ${esc(sale.employee)}` : ''}</div>`,
  );
}

function cutRows(cut: CashCut): [string, number][] {
  return [
    ['Total vendido', cut.salesTotal],
    ['Número de ventas', cut.salesCount],
    // Cortes anteriores a Pide y recoge: todo fue venta en tienda
    ['Ventas en tienda', cut.storeSales ?? cut.salesTotal - (cut.pickupSales ?? 0)],
    ['Ventas Pide y recoge', cut.pickupSales ?? 0],
    ['Efectivo', cut.cashSales],
    ['Tarjeta', cut.cardSales],
    ['Transferencia', cut.transferSales],
    ...(cut.onlineSales ? [['En línea (pedidos pagados en la app)', cut.onlineSales] as [string, number]] : []),
    ['A crédito', cut.creditSales ?? 0],
    ['Abonos de clientes', cut.creditPaid ?? 0],
    ['Fondo inicial', cut.openingFund],
    ['Abonos en efectivo', cut.creditCash ?? 0],
    ['Entradas de efectivo', cut.cashIn],
    ['Salidas de efectivo', cut.cashOut],
    ['Efectivo esperado', cut.expectedCash],
    ['Efectivo contado', cut.countedCash],
    ['Diferencia', cut.countedCash - cut.expectedCash],
  ];
}

export function printCut(cut: CashCut, store: Store) {
  const rows = cutRows(cut)
    .map(([k, v]) => `<tr><td>${k}</td><td class="n">${k === 'Número de ventas' ? v : money(v)}</td></tr>`)
    .join('');
  printHtml(
    `Corte ${cut.folio}`,
    `<div class="c"><h1>${esc(store.name)}</h1><div>Corte de caja #${cut.folio}</div>
     <div>${new Date(cut.date).toLocaleDateString('es-MX', { dateStyle: 'long' })} ${time(cut.date)}</div>
     <div>${esc(cut.shift)} · ${esc(cut.employee)}</div></div>
     <div class="sep"></div><table>${rows}</table><div class="sep"></div>
     <div class="c">Firma: ____________________</div>`,
  );
}

export function downloadCutCsv(cut: CashCut, store: Store) {
  const lines = [
    ['Tienda', store.name],
    ['Corte', `#${cut.folio}`],
    ['Fecha', new Date(cut.date).toLocaleString('es-MX')],
    ['Turno', cut.shift],
    ['Responsable', cut.employee],
    [],
    ['Concepto', 'Importe'],
    ...cutRows(cut).map(([k, v]) => [k, v.toFixed(k === 'Número de ventas' ? 0 : 2)]),
  ];
  downloadCsv(`corte-${cut.folio}.csv`, lines);
}

function downloadCsv(name: string, lines: (string | number)[][]) {
  const csv = '\ufeff' + lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSalesCsv(sales: Sale[], store: Store, period: string) {
  downloadCsv(`ventas-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Tienda', store.name],
    ['Periodo', period],
    [],
    ['Folio', 'Fecha', 'Hora', 'Origen', 'Pedido', 'Empleado', 'Cliente', 'Artículos', 'Método de pago', 'Total', 'Pagó con'],
    ...sales.map((s) => [
      s.folio,
      new Date(s.date).toLocaleDateString('es-MX'),
      time(s.date),
      ORIGIN_LABEL[saleOrigin(s)],
      s.orderFolio ?? '',
      s.employee,
      s.customerName ?? '',
      itemCount(s.items),
      PAYMENT_LABEL[s.method],
      s.total.toFixed(2),
      (s.paid ?? (s.method === 'credito' ? 0 : s.total)).toFixed(2),
    ]),
  ]);
}
