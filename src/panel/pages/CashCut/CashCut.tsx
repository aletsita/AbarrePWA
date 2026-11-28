import { itemCount, lineTotal, qtyText, roundQty, type SaleType } from '../../../domain/weight';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonPage,
  IonSkeletonText,
  } from '@ionic/react';
import { CashMovementModal } from './CashMovementModal';
import {
  add,
  alertCircleOutline,
  arrowDownOutline,
  arrowUpOutline,
  bagHandleOutline,
  basketOutline,
  cardOutline,
  cashOutline,
  documentTextOutline,
  fileTrayOutline,
  globeOutline,
  informationCircleOutline,
  lockClosedOutline,
  lockOpenOutline,
  receiptOutline,
  storefrontOutline,
  swapHorizontalOutline,
  timeOutline,
  trendingUpOutline,
  walletOutline,
} from 'ionicons/icons';
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { IsotipoMark } from '../../../components/IsotipoMark';
import { StatCard } from '../../../components/StatCard';
import { useApp } from '../../../context/AppContext';
import { initials, money, ORIGIN_LABEL, PAYMENT_LABEL, saleOrigin, shortDate, time, type CashCut, type CashMovementType, type PaymentMethod, type SaleOrigin } from '../../../data/models';
import { PanelHeader } from '../../components/PanelHeader';
import { PromptModal } from '../../components/PromptModal';
import { ClosedCut, Difference } from './ClosedCut';
import './CashCut.css';
import { useAviso } from '../../../components/Aviso';
import { PanelModal } from '../../../components/PanelModal';

const MOVE_LABEL: Record<CashMovementType, string> = { entrada: 'Entrada', retiro: 'Retiro', gasto: 'Gasto' };

// Color e icono de cada método y origen en las barras
const METHOD_STYLE: Record<PaymentMethod, { color: string; icon: string }> = {
  efectivo: { color: '#15803D', icon: cashOutline },
  credito: { color: '#E59A00', icon: documentTextOutline },
  en_linea: { color: '#123F8C', icon: globeOutline },
  tarjeta: { color: '#6B7FA8', icon: cardOutline },
  transferencia: { color: '#8A94A6', icon: swapHorizontalOutline },
};
const ORIGIN_STYLE: Record<SaleOrigin, { color: string; icon: string }> = {
  tienda: { color: '#123F8C', icon: storefrontOutline },
  pedido: { color: '#5B88D6', icon: bagHandleOutline },
};

interface BarItem { key: string; label: string; value: number; color: string; icon: string; tip: string }

// Barra apilada arriba y una fila por concepto; los conceptos en $0.00 se ven en gris
function BreakdownBars({ items, total, label }: { items: BarItem[]; total: number; label: string }) {
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  return (
    <>
      <div className="stack-bar" aria-hidden="true">
        {items.filter((i) => i.value > 0).map((i) => (
          <span key={i.key} style={{ flexGrow: i.value, background: i.color }} />
        ))}
      </div>
      <ul className="bars" aria-label={label}>
        {items.map((i) => (
          <li key={i.key} className={`bar-row ${i.value > 0 ? '' : 'is-zero'}`} tabIndex={0} style={{ '--bar-color': i.color } as CSSProperties}>
            <span className="bar-label">
              <span className="bar-icon"><IonIcon icon={i.icon} aria-hidden="true" /></span>
              {i.label}
            </span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${total ? (i.value / total) * 100 : 0}%` }} />
            </span>
            <span className="bar-value">
              <strong>{money(i.value)}</strong> <span>{pct(i.value)} %</span>
            </span>
            <span className="bar-tip" role="tooltip">
              <strong>{i.label}</strong>
              {i.tip}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

// Diferencia en vivo mientras se escribe el conteo (contado menos esperado)
function LiveDifference({ value }: { value: number }) {
  const tone = Math.abs(value) < 0.005 ? 'is-even' : value > 0 ? 'is-over' : 'is-short';
  const text = tone === 'is-even' ? 'Cuadra perfecto' : tone === 'is-over' ? `Sobran ${money(value)}` : `Faltan ${money(Math.abs(value))}`;
  return (
    <div className="recon-diff" role="status" aria-live="polite">
      <span>Diferencia</span>
      <span className={`diff-pill ${tone}`}>{text}</span>
    </div>
  );
}

// Esqueletos con las alturas aproximadas de las tarjetas mientras llegan los datos
function CutSkeleton() {
  const card = (h: number, order: string) => (
    <section className={`pcard cut-card ${order}`} style={{ minHeight: h }}>
      <IonSkeletonText animated className="sk-title" />
      <IonSkeletonText animated className="sk-line" />
      <IonSkeletonText animated className="sk-line" />
      <IonSkeletonText animated className="sk-line is-short" />
    </section>
  );
  return (
    <div aria-busy="true" aria-label="Cargando el corte">
      <div className="cut-kpis">
        <div className="cut-hero is-loading"><IonSkeletonText animated className="sk-line" /></div>
        {[0, 1, 2].map((i) => <div key={i} className="stat-card"><IonSkeletonText animated className="sk-line" /></div>)}
      </div>
      <div className="cut-body">
        <div className="cut-col">
          {card(300, 'o-method')}
          {card(180, 'o-origin')}
          {card(320, 'o-top')}
        </div>
        <div className="cut-col">
          {card(520, 'o-recon')}
          {card(180, 'o-moves')}
          {card(150, 'o-close')}
        </div>
      </div>
    </div>
  );
}

export default function CashCut() {
  const { sales, cashMovements, creditMovements, cuts, closedCutId, closeCut, shift, store, user, addCashMovement, openShift, ready } = useApp();
  const toast = useAviso();
  const [countedText, setCountedText] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [viewCut, setViewCut] = useState<CashCut>();
  const countedRef = useRef<HTMLInputElement>(null);
  const reconRef = useRef<HTMLElement>(null);

  // Ventas del turno abierto de esta caja (incluye los pedidos entregados en él)
  const today = sales.filter((s) => (shift.id ? s.turnoId === shift.id : s.date >= shift.openedAt));
  const total = today.reduce((n, s) => n + s.total, 0);
  const pieces = today.reduce((n, s) => n + itemCount(s.items), 0);
  const byMethod = (m: PaymentMethod) => today.filter((s) => s.method === m);
  const sum = (m: PaymentMethod) => byMethod(m).reduce((n, s) => n + s.total, 0);
  const cashSales = sum('efectivo');
  // Los pedidos entregados ya son ventas del turno: aquí solo se separan por origen
  const byOrigin = (o: SaleOrigin) => today.filter((s) => saleOrigin(s) === o);
  const originSum = (o: SaleOrigin) => byOrigin(o).reduce((n, s) => n + s.total, 0);
  const cashIn = cashMovements.filter((c) => c.type === 'entrada').reduce((n, c) => n + c.amount, 0);
  const cashOut = cashMovements.filter((c) => c.type !== 'entrada').reduce((n, c) => n + c.amount, 0);
  const payments = creditMovements.filter((m) => m.type === 'abono' && m.date >= shift.openedAt);
  const creditPaid = payments.reduce((n, m) => n + m.amount, 0);
  const creditCash = payments.filter((m) => m.method === 'efectivo').reduce((n, m) => n + m.amount, 0);
  const expected = shift.openingFund + cashSales + creditCash + cashIn - cashOut;
  const counted = countedText === '' ? null : Number(countedText);

  const top = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; amount: number; saleType?: SaleType }>();
    today.forEach((s) =>
      s.items.forEach((i) => {
        const cur = map.get(i.productId) ?? { name: i.name, qty: 0, amount: 0, saleType: i.saleType };
        map.set(i.productId, { ...cur, qty: roundQty(cur.qty + i.qty), amount: cur.amount + lineTotal(i.qty, i.price, i.saleType) });
      }),
    );
    return [...map.values()].sort((a, b) => b.qty - a.qty || b.amount - a.amount).slice(0, 5);
  }, [sales, shift.openedAt]);

  const closed = cuts.find((c) => c.id === closedCutId);
  // Caja sin turno abierto ni corte reciente (por ejemplo, recién creada)
  const noShift = !shift.id && !closed;

  const startCut = () => {
    reconRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => countedRef.current?.focus(), 400);
  };

  // El folio lo pone la caja (su serie) y el servidor recalcula los totales al recibir el corte
  const doClose = () => {
    const folio = closeCut({
      id: '',
      folio: 0,
      date: new Date().toISOString(),
      shift: shift.name,
      employee: user?.name ?? store.owner,
      openingFund: shift.openingFund,
      salesTotal: total,
      salesCount: today.length,
      cashSales,
      cardSales: sum('tarjeta'),
      transferSales: sum('transferencia'),
      onlineSales: sum('en_linea'),
      storeSales: originSum('tienda'),
      pickupSales: originSum('pedido'),
      creditSales: sum('credito'),
      creditPaid,
      creditCash,
      cashIn,
      cashOut,
      expectedCash: expected,
      countedCash: counted ?? 0,
    });
    setConfirmOpen(false);
    setCountedText('');
    toast({ message: `Corte #${folio} cerrado`, duration: 1800, color: 'success', position: 'top', cssClass: 'toast-app' });
  };

  // En línea: pedidos pagados en la app; cuentan como venta pero no entran al efectivo de la caja
  const methods: PaymentMethod[] = ['efectivo', 'credito', 'en_linea', 'tarjeta', 'transferencia'];
  const methodItems: BarItem[] = methods.map((m) => {
    const n = byMethod(m).length;
    const v = sum(m);
    return {
      key: m,
      label: PAYMENT_LABEL[m],
      value: v,
      ...METHOD_STYLE[m],
      tip: `${n} ${n === 1 ? 'venta' : 'ventas'} · ${money(v)} · ${total ? Math.round((v / total) * 100) : 0} % del día`,
    };
  });
  const originItems: BarItem[] = (Object.keys(ORIGIN_LABEL) as SaleOrigin[]).map((o) => {
    const n = byOrigin(o).length;
    const cash = byOrigin(o).filter((s) => s.method === 'efectivo').reduce((t, s) => t + s.total, 0);
    return {
      key: o,
      label: ORIGIN_LABEL[o],
      value: originSum(o),
      ...ORIGIN_STYLE[o],
      tip: `${n} ${n === 1 ? 'venta' : 'ventas'} · ${money(cash)} en efectivo`,
    };
  });

  return (
    <IonPage>
      <PanelHeader title="Corte del día" />
      <IonContent>
        <div className="ppage cut-page">
          <div className="ppage-head cut-head">
            <div>
              <h1>Corte del día</h1>
              <p className="cut-date">{new Date().toLocaleDateString('es-MX', { dateStyle: 'full' })}</p>
              {shift.id && (
                <ul className="cut-chips" aria-label="Turno actual">
                  <li className="cut-chip"><IonIcon icon={storefrontOutline} aria-hidden="true" />{shift.register}</li>
                  <li className="cut-chip"><IonIcon icon={timeOutline} aria-hidden="true" />Abierto {time(shift.openedAt)}</li>
                  <li className="cut-chip">
                    <span className="cut-avatar" aria-hidden="true">{initials(shift.openedBy)}</span>
                    {shift.openedBy}
                  </li>
                </ul>
              )}
            </div>
            <div className="ppage-actions">
              {closed || noShift ? (
                <IonButton className="cut-cta" onClick={() => setShiftOpen(true)}>
                  <IonIcon slot="start" icon={lockOpenOutline} />
                  {noShift ? 'Abrir turno' : 'Abrir nuevo turno'}
                </IonButton>
              ) : (
                <IonButton className="cut-cta" onClick={startCut}>
                  <IonIcon slot="start" icon={walletOutline} />
                  Realizar corte
                </IonButton>
              )}
            </div>
          </div>

          {!ready ? (
            <CutSkeleton />
          ) : noShift ? (
            <section className="pcard cut-card cut-closed">
              <p className="muted">No hay un turno abierto en esta caja. Ábrelo con el fondo de caja para empezar a cobrar y recibir pedidos.</p>
            </section>
          ) : closed ? (
            <section className="pcard cut-card cut-closed">
              <ClosedCut cut={closed} />
            </section>
          ) : (
            <>
              <div className="cut-kpis">
                <div className="cut-hero">
                  <IsotipoMark className="cut-hero-mark" />
                  <span className="cut-hero-head">
                    <span className="cut-hero-icon"><IonIcon icon={trendingUpOutline} aria-hidden="true" /></span>
                    Ventas totales
                  </span>
                  <span>
                    <strong className="money cut-hero-value">{money(total)}</strong>
                    <span className="cut-hero-hint">de las ventas de este turno</span>
                  </span>
                </div>
                <StatCard tone="primary" icon={receiptOutline} label="Número de ventas" value={String(today.length)} />
                <StatCard tone="success" icon={cashOutline} label="Ticket promedio" value={money(today.length ? total / today.length : 0)} />
                <StatCard tone="warning" icon={basketOutline} label="Productos vendidos" value={`${pieces} pzas`} />
              </div>

              <div className="cut-body">
                <div className="cut-col">
                  <section className="pcard cut-card o-method">
                    <h2>Ventas por método de pago</h2>
                    <BreakdownBars items={methodItems} total={total} label="Ventas por método de pago" />
                  </section>

                  <section className="pcard cut-card o-origin">
                    <h2>Ventas por origen</h2>
                    <BreakdownBars items={originItems} total={total} label="Ventas por origen" />
                  </section>

                  <section className="pcard cut-card o-top">
                    <h2>Más vendidos del turno</h2>
                    <ol className="top-list">
                      {top.map((t, i) => (
                        <li key={t.name}>
                          <span className="top-rank">{i + 1}</span>
                          <span className="top-text">
                            <span className="top-name">{t.name}</span>
                            <span className="top-qty">{t.saleType === 'peso' ? qtyText(t.qty, 'peso') : `${t.qty} pzas`}</span>
                          </span>
                          <span className="money top-amt">{money(t.amount)}</span>
                        </li>
                      ))}
                      {top.length === 0 && <li className="muted">Aún no hay ventas en este turno.</li>}
                    </ol>
                  </section>
                </div>

                <div className="cut-col">
                  <section className="pcard cut-card recon o-recon" ref={reconRef}>
                    <h2>Conciliación de caja</h2>
                    <dl className="recon-list">
                      <div>
                        <dt><span className="recon-sign is-fund"><IonIcon icon={walletOutline} aria-hidden="true" /></span>Fondo inicial</dt>
                        <dd className="money">{money(shift.openingFund)}</dd>
                      </div>
                      <div>
                        <dt><span className="recon-sign is-plus" aria-label="Más">+</span>Ventas en efectivo</dt>
                        <dd className="money">{money(cashSales)}</dd>
                      </div>
                      <div>
                        <dt><span className="recon-sign is-plus" aria-label="Más">+</span>Abonos de clientes en efectivo</dt>
                        <dd className="money">{money(creditCash)}</dd>
                      </div>
                      <div>
                        <dt><span className="recon-sign is-plus" aria-label="Más">+</span>Entradas de efectivo</dt>
                        <dd className="money">{money(cashIn)}</dd>
                      </div>
                      <div>
                        <dt><span className="recon-sign is-minus" aria-label="Menos">−</span>Salidas (retiros y gastos)</dt>
                        <dd className="money">{money(cashOut)}</dd>
                      </div>
                    </dl>
                    <div className="recon-expected">
                      <span>
                        <strong>Efectivo esperado</strong>
                        <small>Lo que debería haber en el cajón</small>
                      </span>
                      <strong className="money">{money(expected)}</strong>
                    </div>
                    <label className="recon-count" htmlFor="counted">
                      <span>Efectivo contado</span>
                      <span className="recon-input">
                        <span aria-hidden="true">$</span>
                        <input
                          id="counted"
                          ref={countedRef}
                          inputMode="decimal"
                          placeholder="0.00"
                          value={countedText}
                          onChange={(e) => setCountedText(e.target.value.replace(/[^\d.]/g, ''))}
                        />
                      </span>
                    </label>
                    {counted !== null && <LiveDifference value={counted - expected} />}
                    <p className="recon-hint">
                      <IonIcon icon={informationCircleOutline} aria-hidden="true" />
                      Cuenta los billetes y monedas del cajón y escribe el total. Aquí verás si sobra o falta.
                    </p>
                  </section>

                  <section className="pcard cut-card o-moves">
                    <div className="cut-card-head">
                      <h2>Movimientos de efectivo</h2>
                      <IonButton className="cut-add" onClick={() => setMoveOpen(true)}>
                        <IonIcon slot="start" icon={add} />
                        Registrar
                      </IonButton>
                    </div>
                    {cashMovements.length === 0 ? (
                      <div className="cash-empty">
                        <span><IonIcon icon={fileTrayOutline} aria-hidden="true" /></span>
                        Sin entradas ni salidas en este turno.
                      </div>
                    ) : (
                      <ul className="cash-moves">
                        {cashMovements.map((c) => (
                          <li key={c.id}>
                            <span className={`cm-icon ${c.type === 'entrada' ? 'is-in' : 'is-out'}`}>
                              <IonIcon icon={c.type === 'entrada' ? arrowDownOutline : arrowUpOutline} aria-hidden="true" />
                            </span>
                            <span className="cm-text">
                              <strong>{c.note}</strong>
                              <span>{MOVE_LABEL[c.type]} · {time(c.date)} · {c.employee}</span>
                            </span>
                            <span className={`money cm-amt ${c.type === 'entrada' ? 'is-in' : 'is-out'}`}>
                              {c.type === 'entrada' ? '+' : '−'}{money(c.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="pcard cut-card cut-close o-close">
                    <p className="cut-close-warn">
                      <span><IonIcon icon={informationCircleOutline} aria-hidden="true" /></span>
                      Al cerrar el corte ya no se podrán registrar ventas en este turno.
                    </p>
                    <IonButton className="cut-close-btn" expand="block" disabled={counted === null} onClick={() => setConfirmOpen(true)}>
                      <IonIcon slot="start" icon={lockClosedOutline} />
                      Cerrar corte
                    </IonButton>
                    {counted === null && <p className="cut-close-note">Se activa cuando escribes el efectivo contado.</p>}
                  </section>
                </div>
              </div>
            </>
          )}

          <section className="pcard cut-history">
            <div className="pcard-head"><h2>Cortes anteriores</h2></div>
            <div className="ptable-scroll">
              <table className="ptable is-cards">
                <thead>
                  <tr>
                    <th>Corte</th>
                    <th>Fecha</th>
                    <th>Responsable</th>
                    <th className="num">Ventas</th>
                    <th className="num">Esperado</th>
                    <th className="num">Contado</th>
                    <th className="num">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {cuts.map((c) => (
                    <tr key={c.id} className="is-click" onClick={() => setViewCut(c)}>
                      <td className="is-main strong">#{c.folio}</td>
                      <td data-label="Fecha">{shortDate(c.date)} · {time(c.date)}</td>
                      <td data-label="Responsable">{c.employee}</td>
                      <td className="num" data-label="Ventas">{money(c.salesTotal)}</td>
                      <td className="num" data-label="Esperado">{money(c.expectedCash)}</td>
                      <td className="num" data-label="Contado">{money(c.countedCash)}</td>
                      <td className="num is-end"><Difference value={c.countedCash - c.expectedCash} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </IonContent>

      <PanelModal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} size="form" title="¿Cerrar el corte del día?">
        <div className="pmodal-body">
          <dl className="recon-list">
            <div><dt>Ventas del turno</dt><dd className="money">{money(total)} · {today.length}</dd></div>
            <div><dt>En tienda · Pide y recoge</dt><dd className="money">{money(originSum('tienda'))} · {money(originSum('pedido'))}</dd></div>
            <div><dt>Efectivo esperado</dt><dd className="money">{money(expected)}</dd></div>
            <div className="is-total"><dt>Efectivo contado</dt><dd className="money">{money(counted ?? 0)}</dd></div>
          </dl>
          <Difference value={(counted ?? 0) - expected} big />
          {counted !== null && Math.abs(counted - expected) >= 0.005 && (
            <p className="confirm-warn">
              <IonIcon icon={alertCircleOutline} />
              Hay una diferencia. Revisa el conteo antes de cerrar; quedará registrada en el corte.
            </p>
          )}
        </div>
        <div className="pmodal-foot">
          <IonButton fill="outline" className="btn-lg" onClick={() => setConfirmOpen(false)}>Revisar de nuevo</IonButton>
          <IonButton color="secondary" className="btn-lg" onClick={doClose}>
            <IonIcon slot="start" icon={lockClosedOutline} />
            Confirmar y cerrar
          </IonButton>
        </div>
      </PanelModal>

      <PanelModal isOpen={!!viewCut} onClose={() => setViewCut(undefined)} size="detail" title={<>Corte #{viewCut?.folio}</>}>
        <div className="pmodal-body">{viewCut && <ClosedCut cut={viewCut} />}</div>
      </PanelModal>
      <PromptModal
        isOpen={shiftOpen}
        title="Abrir nuevo turno"
        text="Cuenta el efectivo con el que empieza el cajón."
        label="Fondo inicial"
        hint="Billetes y monedas para dar cambio"
        initial={String(shift.openingFund)}
        money
        confirmText="Abrir turno"
        onClose={() => setShiftOpen(false)}
        onSave={(v) => openShift(Number(v) || 0)}
      />
      <CashMovementModal
        isOpen={moveOpen}
        onClose={() => setMoveOpen(false)}
        onSave={(type, amount, note) => addCashMovement(type, amount, note)}
      />
    </IonPage>
  );
}
