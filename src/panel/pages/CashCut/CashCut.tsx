import { itemCount, lineTotal, qtyText, roundQty, type SaleType } from '../../../domain/weight';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonPage,
  } from '@ionic/react';
import { CashMovementModal } from './CashMovementModal';
import {
  add,
  alertCircleOutline,
  arrowDownCircleOutline,
  arrowUpCircleOutline,
  basketOutline,
  cashOutline,
  lockClosedOutline,
  lockOpenOutline,
  receiptOutline,
  trendingUpOutline,
  walletOutline,
} from 'ionicons/icons';
import { useMemo, useRef, useState } from 'react';
import { StatCard } from '../../../components/StatCard';
import { useApp } from '../../../context/AppContext';
import { money, ORIGIN_LABEL, PAYMENT_LABEL, saleOrigin, shortDate, time, type CashCut, type CashMovementType, type PaymentMethod, type SaleOrigin } from '../../../data/models';
import { PanelHeader } from '../../components/PanelHeader';
import { PromptModal } from '../../components/PromptModal';
import { ClosedCut, Difference } from './ClosedCut';
import './CashCut.css';
import { useAviso } from '../../../components/Aviso';
import { PanelModal } from '../../../components/PanelModal';

const MOVE_LABEL: Record<CashMovementType, string> = { entrada: 'Entrada', retiro: 'Retiro', gasto: 'Gasto' };
const MOVE_ICON: Record<CashMovementType, string> = { entrada: arrowDownCircleOutline, retiro: arrowUpCircleOutline, gasto: basketOutline };

export default function CashCut() {
  const { sales, cashMovements, creditMovements, cuts, closedCutId, closeCut, shift, store, user, addCashMovement, openShift } = useApp();
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
  const methods: PaymentMethod[] = ['efectivo', 'tarjeta', 'transferencia', 'credito', 'en_linea'];
  const maxMethod = Math.max(...methods.map(sum), 1);

  return (
    <IonPage>
      <PanelHeader title="Corte del día" />
      <IonContent>
        <div className="ppage">
          <div className="ppage-head">
            <div>
              <h1>Corte del día</h1>
              <p className="cut-sub">
                <span className="cut-date">{new Date().toLocaleDateString('es-MX', { dateStyle: 'full' })}</span>
                {shift.id && <span>{shift.name} · {shift.register} · abierto {time(shift.openedAt)} por {shift.openedBy}</span>}
              </p>
            </div>
            <div className="ppage-actions">
              {closed || noShift ? (
                <IonButton className="btn-lg" onClick={() => setShiftOpen(true)}>
                  <IonIcon slot="start" icon={lockOpenOutline} />
                  {noShift ? 'Abrir turno' : 'Abrir nuevo turno'}
                </IonButton>
              ) : (
                <IonButton className="btn-lg" onClick={startCut}>
                  <IonIcon slot="start" icon={walletOutline} />
                  Realizar corte
                </IonButton>
              )}
            </div>
          </div>

          {noShift ? (
            <section className="pcard cut-closed">
              <p className="muted">No hay un turno abierto en esta caja. Ábrelo con el fondo de caja para empezar a cobrar y recibir pedidos.</p>
            </section>
          ) : closed ? (
            <section className="pcard cut-closed">
              <ClosedCut cut={closed} />
            </section>
          ) : (
            <>
              <div className="kpis">
                <StatCard tone="accent" icon={trendingUpOutline} label="Ventas totales" value={money(total)} />
                <StatCard tone="primary" icon={receiptOutline} label="Número de ventas" value={String(today.length)} />
                <StatCard tone="success" icon={cashOutline} label="Ticket promedio" value={money(today.length ? total / today.length : 0)} />
                <StatCard tone="warning" icon={basketOutline} label="Productos vendidos" value={`${pieces} pzas`} />
              </div>

              <div className="cut-grid">
                <div className="cut-col">
                  <section className="pcard">
                    <div className="pcard-head"><h2>Ventas por método de pago</h2></div>
                    <div className="pcard-body">
                      <ul className="bars" aria-label="Ventas por método de pago">
                        {methods.map((m) => {
                          const v = sum(m);
                          const pct = total ? Math.round((v / total) * 100) : 0;
                          const n = byMethod(m).length;
                          return (
                            <li key={m} className="bar-row" tabIndex={0}>
                              <span className="bar-label">{PAYMENT_LABEL[m]}</span>
                              <span className="bar-track">
                                <span className="bar-fill" style={{ width: `${(v / maxMethod) * 100}%` }} />
                              </span>
                              <span className="bar-value">
                                <strong className="money">{money(v)}</strong> <span>{pct} %</span>
                              </span>
                              <span className="bar-tip" role="tooltip">
                                <strong>{PAYMENT_LABEL[m]}</strong>
                                {n} {n === 1 ? 'venta' : 'ventas'} · {money(v)} · {pct} % del día
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </section>

                  <section className="pcard">
                    <div className="pcard-head"><h2>Ventas por origen</h2></div>
                    <div className="pcard-body">
                      <ul className="bars" aria-label="Ventas por origen">
                        {(Object.keys(ORIGIN_LABEL) as SaleOrigin[]).map((o) => {
                          const v = originSum(o);
                          const pct = total ? Math.round((v / total) * 100) : 0;
                          const n = byOrigin(o).length;
                          const cash = byOrigin(o).filter((s) => s.method === 'efectivo').reduce((t, s) => t + s.total, 0);
                          return (
                            <li key={o} className="bar-row" tabIndex={0}>
                              <span className="bar-label">{ORIGIN_LABEL[o]}</span>
                              <span className="bar-track">
                                <span className="bar-fill" style={{ width: `${(v / Math.max(total, 1)) * 100}%` }} />
                              </span>
                              <span className="bar-value">
                                <strong className="money">{money(v)}</strong> <span>{pct} %</span>
                              </span>
                              <span className="bar-tip" role="tooltip">
                                <strong>{ORIGIN_LABEL[o]}</strong>
                                {n} {n === 1 ? 'venta' : 'ventas'} · {money(cash)} en efectivo
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </section>

                  <section className="pcard">
                    <div className="pcard-head"><h2>Más vendidos del turno</h2></div>
                    <ol className="top-list">
                      {top.map((t, i) => (
                        <li key={t.name}>
                          <span className="top-rank">{i + 1}</span>
                          <span className="top-name">{t.name}</span>
                          <span className="top-qty">{t.saleType === 'peso' ? qtyText(t.qty, 'peso') : `${t.qty} pzas`}</span>
                          <span className="money top-amt">{money(t.amount)}</span>
                        </li>
                      ))}
                      {top.length === 0 && <li className="muted">Aún no hay ventas en este turno.</li>}
                    </ol>
                  </section>
                </div>

                <div className="cut-col">
                  <section className="pcard recon" ref={reconRef}>
                    <div className="pcard-head"><h2>Conciliación de caja</h2></div>
                    <div className="pcard-body">
                      <dl className="recon-list">
                        <div><dt>Fondo inicial</dt><dd className="money">{money(shift.openingFund)}</dd></div>
                        <div><dt>+ Ventas en efectivo</dt><dd className="money">{money(cashSales)}</dd></div>
                        <div><dt>+ Abonos de clientes en efectivo</dt><dd className="money">{money(creditCash)}</dd></div>
                        <div><dt>+ Entradas de efectivo</dt><dd className="money">{money(cashIn)}</dd></div>
                        <div><dt>− Salidas (retiros y gastos)</dt><dd className="money">{money(cashOut)}</dd></div>
                        <div className="is-total"><dt>Efectivo esperado</dt><dd className="money">{money(expected)}</dd></div>
                      </dl>
                      <label className="recon-count" htmlFor="counted">
                        <span>Efectivo contado</span>
                        <span className="recon-input">
                          <span>$</span>
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
                      {counted === null ? (
                        <p className="recon-hint">Cuenta los billetes y monedas del cajón y escribe el total.</p>
                      ) : (
                        <Difference value={counted - expected} big />
                      )}
                    </div>
                  </section>

                  <section className="pcard">
                    <div className="pcard-head">
                      <h2>Movimientos de efectivo</h2>
                      <IonButton fill="clear" size="small" onClick={() => setMoveOpen(true)}>
                        <IonIcon slot="start" icon={add} />
                        Registrar
                      </IonButton>
                    </div>
                    <ul className="cash-moves">
                      {cashMovements.length === 0 && <li className="muted">Sin entradas ni salidas en este turno.</li>}
                      {cashMovements.map((c) => (
                        <li key={c.id}>
                          <span className={`cm-icon t-${c.type}`}><IonIcon icon={MOVE_ICON[c.type]} /></span>
                          <span className="cm-text">
                            <strong>{c.note}</strong>
                            <span className="muted">{MOVE_LABEL[c.type]} · {time(c.date)} · {c.employee}</span>
                          </span>
                          <span className={`money cm-amt ${c.type === 'entrada' ? 'is-in' : 'is-out'}`}>
                            {c.type === 'entrada' ? '+' : '−'}{money(c.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </div>

              <div className="cut-close-bar">
                <p>
                  <IonIcon icon={alertCircleOutline} />
                  Al cerrar el corte ya no se podrán registrar ventas en este turno.
                </p>
                <IonButton color="secondary" className="btn-xl" disabled={counted === null} onClick={() => setConfirmOpen(true)}>
                  <IonIcon slot="start" icon={lockClosedOutline} />
                  Cerrar corte
                </IonButton>
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
