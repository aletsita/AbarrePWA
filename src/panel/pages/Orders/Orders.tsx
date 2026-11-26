import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonModal, IonPage, IonTitle, IonToolbar, useIonRouter, useIonToast } from '@ionic/react';
import { useAppAlert } from '../../../components/AppAlert';
import {
  alertCircleOutline,
  bagCheckOutline,
  callOutline,
  closeCircleOutline,
  closeOutline,
  createOutline,
  globeOutline,
  flameOutline,
  hourglassOutline,
  printOutline,
  qrCodeOutline,
  timeOutline,
  warningOutline,
} from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { useApp } from '../../../context/AppContext';
import { isToday, money, PAYMENT_LABEL, time } from '../../../data/models';
import { ACTIVE_STATUSES, CANCEL_REASON_LABEL, isPaidOnline, ORDER_NEXT_ACTION, ORDER_STATUS_LABEL, reservedStock, type OrderStatus, type PickupOrder } from '../../../data/pickup';
import { shortfallText } from '../../../domain/stock';
import { printSale } from '../../../lib/print';
import { PanelHeader } from '../../components/PanelHeader';
import { CheckoutModal } from '../Register/CheckoutModal';
import { CancelOrderModal } from './CancelOrderModal';
import { PickupCodeModal } from './PickupCodeModal';
import './Orders.css';

const NEW_MS = 2 * 60000;
const PREVIEW_ITEMS = 3;

type View = 'curso' | 'entregado' | 'cancelado';

// Tablero: una columna por etapa, del pedido que lleva más tiempo esperando al más nuevo
const COLUMNS: { status: Exclude<OrderStatus, 'entregado' | 'cancelado'>; title: string; empty: string; icon: string }[] = [
  { status: 'pendiente', title: 'Pendientes', empty: 'Sin pedidos nuevos', icon: timeOutline },
  { status: 'preparando', title: 'Preparando', empty: 'Nada en preparación', icon: flameOutline },
  { status: 'listo', title: 'Listos para recoger', empty: 'Nada esperando al cliente', icon: bagCheckOutline },
];

function ago(iso: string, now: number) {
  const min = Math.floor((now - Date.parse(iso)) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

const pieces = (o: PickupOrder) => o.items.reduce((n, i) => n + i.qty, 0);
const closedAt = (o: PickupOrder) => o.deliveredAt ?? o.updatedAt;

export default function Orders() {
  const { orders, products, sales, store, ticketConfig, advanceOrder, deliverOrder, cancelOrder, reportShortage } = useApp();
  const [view, setView] = useState<View>('curso');
  const [openId, setOpenId] = useState<string>();
  // Entrega en dos pasos: primero el código del cliente, después el cobro
  const [verifying, setVerifying] = useState<{ order?: PickupOrder } | null>(null);
  const [charging, setCharging] = useState<{ order: PickupOrder; code: string }>();
  const [problem, setProblem] = useState<PickupOrder>();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string>();
  const [toast] = useIonToast();
  const router = useIonRouter();

  const showAlert = useAppAlert();
  const warn = (message: string) => showAlert({ tone: 'error', title: 'No se pudo mover el pedido', message, primary: 'Entendido' });

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const column = (st: OrderStatus) => orders.filter((o) => o.status === st).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const history = (st: 'entregado' | 'cancelado') =>
    orders.filter((o) => o.status === st && isToday(closedAt(o))).sort((a, b) => Date.parse(closedAt(b)) - Date.parse(closedAt(a)));
  const sumOf = (l: PickupOrder[]) => l.reduce((n, o) => n + o.total, 0);
  const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const waiting = active.filter((o) => o.issue);
  const delivered = history('entregado');
  const cancelled = history('cancelado');
  const open = orders.find((o) => o.id === openId);

  // Existencia que hoy le falta a un pedido (por ejemplo, si se vendió en mostrador después)
  const shortages = (o: PickupOrder) => {
    if (!ACTIVE_STATUSES.includes(o.status)) return [];
    const reserved = reservedStock(orders, o.id);
    return o.items.filter((i) => {
      const p = products.find((x) => x.id === i.productId);
      return !p || p.stock - (reserved[i.productId] ?? 0) < i.qty;
    });
  };

  const askProblem = (o: PickupOrder) => {
    setOpenId(undefined);
    setProblem(o);
  };

  const act = async (o: PickupOrder) => {
    if (o.status !== 'listo') {
      if (busy) return;
      setBusy(o.id);
      const r = await advanceOrder(o.id);
      setBusy(undefined);
      // Sin inventario suficiente el pedido se queda en pendiente y se dice qué falta
      if (!r.ok) void warn(r.shortages?.length ? `No se puede empezar ${o.folio}. ${shortfallText(r.shortages)}` : r.message);
      return;
    }
    setOpenId(undefined);
    // Siempre se pide el código del cliente: el servidor lo compara (la caja nunca lo recibe)
    setVerifying({ order: o });
  };

  const sale = open?.saleId ? sales.find((s) => s.id === open.saleId) : undefined;
  const openMissing = open ? shortages(open) : [];

  const card = (o: PickupOrder) => {
    const fresh = o.status === 'pendiente' && now - Date.parse(o.createdAt) < NEW_MS;
    const missing = !o.issue && shortages(o).length > 0;
    const rest = o.items.length - PREVIEW_ITEMS;
    return (
      <li key={o.id} className={`ob-card ${o.issue ? 'is-waiting' : ''} ${fresh ? 'is-new' : ''}`}>
        <button type="button" className="ob-card-main" onClick={() => setOpenId(o.id)} aria-label={`${o.folio}, ${o.customer.name}, ${money(o.total)}`}>
          <span className="ob-card-top">
            <strong className="ob-folio">
              {fresh && <span className="ord-dot" aria-hidden="true" />}
              {o.folio}
            </strong>
            <span className="ob-ago">{ago(o.createdAt, now)}</span>
          </span>
          <span className="ob-who">{o.customer.name}</span>
          <ul className="ob-items">
            {o.items.slice(0, PREVIEW_ITEMS).map((i) => (
              <li key={i.productId} className={o.issue?.missing.includes(i.productId) ? 'is-out' : ''}>
                <b>{i.qty}×</b> {i.name}
              </li>
            ))}
            {rest > 0 && <li className="ob-more">y {rest} {rest === 1 ? 'producto más' : 'productos más'}</li>}
          </ul>
          <span className="ob-card-foot">
            <span className="muted">{pieces(o)} {pieces(o) === 1 ? 'pieza' : 'piezas'}</span>
            <strong className="money">{money(o.total)}</strong>
          </span>
          {o.issue && (
            <span className="ob-flag is-waiting"><IonIcon icon={hourglassOutline} />Esperando al cliente</span>
          )}
          {missing && (
            <span className="ob-flag is-warn"><IonIcon icon={warningOutline} />Falta existencia</span>
          )}
          {o.editedAt && !o.issue && (
            <span className="ob-flag is-edited"><IonIcon icon={createOutline} />El cliente cambió productos</span>
          )}
          {isPaidOnline(o) && (
            <span className="ob-flag is-paid"><IonIcon icon={globeOutline} />Pagado en línea</span>
          )}
        </button>
        <div className="ob-card-actions">
          {o.issue ? (
            <IonButton fill="outline" color="medium" className="ob-act" disabled>Esperando respuesta</IonButton>
          ) : (
            <IonButton fill={o.status === 'listo' ? 'solid' : 'outline'} color={o.status === 'listo' ? 'success' : undefined} className="ob-act" disabled={busy === o.id} onClick={() => void act(o)}>
              {o.status === 'listo' ? 'Entregar' : ORDER_NEXT_ACTION[o.status as keyof typeof ORDER_NEXT_ACTION]}
            </IonButton>
          )}
          <IonButton fill="clear" color="danger" className="ob-problem" onClick={() => askProblem(o)} aria-label={`Problema con ${o.folio}`} title="Producto agotado o cancelar">
            <IonIcon slot="icon-only" icon={alertCircleOutline} />
          </IonButton>
        </div>
      </li>
    );
  };

  return (
    <IonPage>
      <PanelHeader title="Pedidos" />
      <IonContent>
        <div className="ppage">
          <div className="ppage-head">
            <div>
              <h1>Pedidos</h1>
              <p>
                {active.length ? `${active.length} por entregar · ${money(sumOf(active))}` : 'Nada por entregar'}
                {waiting.length > 0 && ` · ${waiting.length} esperando al cliente`}
              </p>
            </div>
            <div className="ppage-actions">
              <IonButton className="btn-lg" onClick={() => setVerifying({})}>
                <IonIcon slot="start" icon={qrCodeOutline} />
                Entregar con código
              </IonButton>
            </div>
          </div>

          <div className="ob-views" role="tablist" aria-label="Pedidos">
            {([
              ['curso', 'En curso', active.length],
              ['entregado', 'Entregados hoy', delivered.length],
              ['cancelado', 'Cancelados hoy', cancelled.length],
            ] as [View, string, number][]).map(([id, label, n]) => (
              <button key={id} type="button" role="tab" aria-selected={view === id} className={`ob-view ${view === id ? 'is-active' : ''}`} onClick={() => setView(id)}>
                {label}
                <span className="ob-count">{n}</span>
              </button>
            ))}
          </div>

          {view === 'curso' ? (
            <div className="ob-board">
              {COLUMNS.map((c) => {
                const list = column(c.status);
                return (
                  <section key={c.status} className={`ob-col is-${c.status}`} aria-label={c.title}>
                    <header className="ob-col-head">
                      <IonIcon icon={c.icon} aria-hidden="true" />
                      <h2>{c.title}</h2>
                      <span className="ob-count">{list.length}</span>
                      {list.length > 0 && <span className="ob-col-sum money">{money(sumOf(list))}</span>}
                    </header>
                    {list.length === 0 ? <p className="ob-empty">{c.empty}</p> : <ul className="ob-cards">{list.map(card)}</ul>}
                  </section>
                );
              })}
            </div>
          ) : (
            <section className="pcard">
              {(view === 'entregado' ? delivered : cancelled).length === 0 ? (
                <EmptyState
                  art="cart"
                  title={view === 'entregado' ? 'Aún no entregas pedidos hoy' : 'No hay pedidos cancelados hoy'}
                  text="Los pedidos que hagan tus clientes desde la app aparecen aquí."
                />
              ) : (
                <ul className="ord-list">
                  {(view === 'entregado' ? delivered : cancelled).map((o) => (
                    <li key={o.id} className="ord-row">
                      <button type="button" className="ord-row-main" onClick={() => setOpenId(o.id)}>
                        <span className="ord-row-folio">{o.folio}</span>
                        <span className="ord-row-who">
                          <strong>{o.customer.name}</strong>
                          <small>
                            {pieces(o)} {pieces(o) === 1 ? 'pieza' : 'piezas'} · {time(closedAt(o))}
                            {o.cancel && <em> · {CANCEL_REASON_LABEL[o.cancel.reason].toLowerCase()}</em>}
                          </small>
                        </span>
                        <span className="ord-row-total money">{money(o.total)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </IonContent>

      <IonModal isOpen={!!open} onDidDismiss={() => setOpenId(undefined)} className="pmodal">
        {open && (
          <>
            <IonHeader className="ion-no-border">
              <IonToolbar>
                <IonTitle>{open.folio} · {ORDER_STATUS_LABEL[open.status]}</IonTitle>
                <IonButtons slot="end">
                  <IonButton onClick={() => setOpenId(undefined)} aria-label="Cerrar">
                    <IonIcon slot="icon-only" icon={closeOutline} />
                  </IonButton>
                </IonButtons>
              </IonToolbar>
            </IonHeader>
            <div className="pmodal-body">
              <dl className="sd-facts">
                <div><dt>Cliente</dt><dd>{open.customer.name}</dd></div>
                {open.customer.phone && (
                  <div>
                    <dt>Teléfono</dt>
                    <dd><a className="ord-phone" href={`tel:${open.customer.phone.replace(/\s/g, '')}`}><IonIcon icon={callOutline} />{open.customer.phone}</a></dd>
                  </div>
                )}
                <div><dt>Pidió</dt><dd>{time(open.createdAt)}</dd></div>
                {open.payment && <div><dt>Pagó</dt><dd>{PAYMENT_LABEL[open.payment.method]}{sale ? ` · venta #${sale.folio}` : ''}</dd></div>}
                {!open.payment && <div><dt>Pago</dt><dd>{isPaidOnline(open) ? 'Pagado en línea · solo pide el código' : 'Se paga al recoger'}</dd></div>}
              </dl>

              {open.note && <p className="ord-note">“{open.note}”</p>}
              {open.issue && (
                <p className="ord-waiting">
                  <IonIcon icon={hourglassOutline} />
                  <span>
                    <strong>Esperando al cliente</strong> · le avisaste a las {time(open.issue.at)} que se agotó:{' '}
                    {open.items.filter((i) => open.issue!.missing.includes(i.productId)).map((i) => i.name).join(', ')}. Puede elegir otro producto, quitarlo o cancelar.
                  </span>
                </p>
              )}
              {open.editedAt && !open.issue && open.status !== 'cancelado' && (
                <p className="ord-edited">
                  <IonIcon icon={createOutline} />
                  El cliente cambió los productos a las {time(open.editedAt)}.
                </p>
              )}
              {open.cancel && (
                <p className="ord-cancelled">
                  <IonIcon icon={closeCircleOutline} />
                  <span>
                    <strong>{open.cancel.reason === 'cliente' ? 'Lo canceló el cliente' : `Cancelado por ${CANCEL_REASON_LABEL[open.cancel.reason].toLowerCase()}`}</strong> · {time(open.cancel.at)}
                    {open.cancel.missing.length > 0 && <> · Se agotó: {open.items.filter((i) => open.cancel!.missing.includes(i.productId)).map((i) => i.name).join(', ')}</>}
                    {open.cancel.note && <> · “{open.cancel.note}”</>}
                  </span>
                </p>
              )}
              {!open.issue && openMissing.length > 0 && (
                <p className="ord-warn">
                  <IonIcon icon={alertCircleOutline} />
                  Ya no alcanza: {openMissing.map((i) => i.name).join(', ')}.
                </p>
              )}

              <ul className="ord-items">
                {open.items.map((i) => (
                  <li key={i.productId} className={open.issue?.missing.includes(i.productId) ? 'is-out' : ''}>
                    <span><strong>{i.qty}</strong> {i.name}</span>
                    <span className="money">{money(i.qty * i.price)}</span>
                  </li>
                ))}
              </ul>
              <div className="sd-total">
                <span>Total</span>
                <strong className="money">{money(open.total)}</strong>
              </div>
            </div>
            <div className="pmodal-foot">
              {open.status === 'entregado' ? (
                sale && (
                  <IonButton fill="outline" className="btn-lg" onClick={() => printSale(sale, store, ticketConfig)}>
                    <IonIcon slot="start" icon={printOutline} />
                    Imprimir ticket
                  </IonButton>
                )
              ) : open.status !== 'cancelado' && (
                <>
                  <IonButton fill="clear" color="danger" className="btn-lg" onClick={() => askProblem(open)}>
                    <IonIcon slot="start" icon={alertCircleOutline} />
                    Producto agotado o cancelar
                  </IonButton>
                  {!open.issue && (
                    <IonButton className="btn-lg" color={open.status === 'listo' ? 'success' : undefined} disabled={busy === open.id} onClick={() => void act(open)}>
                      {open.status === 'listo' ? 'Entregar' : ORDER_NEXT_ACTION[open.status]}
                    </IonButton>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </IonModal>

      <CancelOrderModal
        order={problem}
        shortages={problem ? shortages(problem).map((i) => i.productId) : []}
        onClose={() => setProblem(undefined)}
        onShortage={async (missing) => {
          const o = problem!;
          setProblem(undefined);
          const r = await reportShortage(o.id, missing);
          if (!r.ok) return void toast({ message: r.message, duration: 3500, color: 'danger', position: 'top', cssClass: 'toast-app' });
          toast({ message: `Le avisamos a ${o.customer.name} que se agotó un producto de ${o.folio}.`, duration: 3500, color: 'warning', position: 'top', cssClass: 'toast-app' });
        }}
        onCancel={async (note) => {
          const o = problem!;
          setProblem(undefined);
          const r = await cancelOrder(o.id, 'otro', [], note);
          if (!r.ok) return void toast({ message: r.message, duration: 3500, color: 'danger', position: 'top', cssClass: 'toast-app' });
          toast({ message: `${o.folio} cancelado. Le avisamos a ${o.customer.name}.`, duration: 3500, color: 'medium', position: 'top', cssClass: 'toast-app' });
        }}
      />

      <PickupCodeModal
        isOpen={!!verifying}
        order={verifying?.order}
        orders={orders}
        onClose={() => setVerifying(null)}
        onVerified={async (order, code) => {
          if (!isPaidOnline(order)) {
            setVerifying(null);
            setCharging({ order, code });
            return null;
          }
          // Ya pagado en la app: no se cobra. El servidor valida el código (intentos limitados, un solo uso)
          const r = await deliverOrder(order.id, 'en_linea', order.total, code);
          if (!r.ok) return r.message;
          setVerifying(null);
          setView('entregado');
          router.push('/panel/venta-completada', 'forward');
          return null;
        }}
      />

      <CheckoutModal
        isOpen={!!charging}
        onClose={() => setCharging(undefined)}
        order={
          charging && {
            folio: charging.order.folio,
            total: charging.order.total,
            count: pieces(charging.order),
            onConfirm: async (method, paid) => {
              const r = await deliverOrder(charging.order.id, method, paid, charging.code);
              if (!r.ok) return r.shortages?.length ? `${r.message}` : r.message;
              const s = r.value;
              setView('entregado');
              toast({
                message: `${charging.order.folio} entregado · venta #${s.folio}`,
                duration: 4000,
                color: 'success',
                position: 'top',
                cssClass: 'toast-app',
                buttons: [{ text: 'Imprimir ticket', handler: () => printSale(s, store, ticketConfig) }],
              });
              return null;
            },
          }
        }
      />
    </IonPage>
  );
}
