import { IonButton, IonContent, IonIcon, IonPage, IonSkeletonText, useIonRouter } from '@ionic/react';
import { useAppAlert } from '../../../components/AppAlert';
import {
  alertCircleOutline,
  bagCheckOutline,
  createOutline,
  globeOutline,
  flameOutline,
  fileTrayOutline,
  hourglassOutline,
  qrCodeOutline,
  storefrontOutline,
  timeOutline,
  warningOutline,
} from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { useApp } from '../../../context/AppContext';
import { initials, isToday, money, time } from '../../../data/models';
import { ACTIVE_STATUSES, CANCEL_REASON_LABEL, isPaidOnline, ORDER_NEXT_ACTION, reservedStock, type OrderStatus, type PickupOrder } from '../../../data/pickup';
import { shortfallText } from '../../../domain/stock';
import { fromCents, itemCount, lineTotal, qtyText, sumCents } from '../../../domain/weight';
import { printSale } from '../../../lib/print';
import { PanelHeader } from '../../components/PanelHeader';
import { CheckoutModal } from '../Register/CheckoutModal';
import { CancelOrderModal } from './CancelOrderModal';
import { OrderDetail, OrderStatusChip } from './OrderDetail';
import { PickupCodeModal } from './PickupCodeModal';
import './Orders.css';
import { useAviso } from '../../../components/Aviso';
import { PanelModal } from '../../../components/PanelModal';

const NEW_MS = 2 * 60000;
const PREVIEW_ITEMS = 3;

type View = 'curso' | 'entregado' | 'cancelado';

// Tablero: una columna por etapa, del pedido que lleva más tiempo esperando al más nuevo
const COLUMNS: { status: Exclude<OrderStatus, 'entregado' | 'cancelado'>; title: string; empty: string; help: string; icon: string }[] = [
  { status: 'pendiente', title: 'Pendientes', empty: 'Sin pedidos nuevos', help: 'Cuando un cliente pida, aparece aquí.', icon: timeOutline },
  { status: 'preparando', title: 'Haciendo', empty: 'Nada en preparación', help: 'Los pedidos que empieces a preparar aparecen aquí.', icon: flameOutline },
  { status: 'listo', title: 'Pedido listo', empty: 'Nada esperando al cliente', help: 'Los pedidos listos para recoger aparecen aquí.', icon: bagCheckOutline },
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
  const { ready, orders, products, sales, store, ticketConfig, advanceOrder, deliverOrder, cancelOrder, reportShortage } = useApp();
  const [view, setView] = useState<View>('curso');
  const [openId, setOpenId] = useState<string>();
  // Entrega en dos pasos: primero el código del cliente, después el cobro
  const [verifying, setVerifying] = useState<{ order?: PickupOrder } | null>(null);
  const [charging, setCharging] = useState<{ order: PickupOrder; code: string }>();
  const [problem, setProblem] = useState<PickupOrder>();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string>();
  const toast = useAviso();
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
    const out = (id: string) => !!o.issue?.missing.includes(id);
    const rest = o.items.length - PREVIEW_ITEMS;
    const n = itemCount(o.items);
    // Lo que recibiría el cliente si acepta solo lo disponible
    const available = o.issue ? fromCents(sumCents(o.items.filter((i) => !out(i.productId)))) : 0;
    return (
      <li key={o.id} className={`ob-card ${o.issue || missing ? 'is-attention' : ''} ${fresh ? 'is-new' : ''}`}>
        <button type="button" className="ob-card-main" onClick={() => setOpenId(o.id)} aria-label={`${o.folio}, ${o.customer.name}, ${money(o.total)}`}>
          <span className="ob-card-top">
            <strong className="ob-folio">
              {fresh && <span className="ord-dot" aria-hidden="true" />}
              {o.folio}
            </strong>
            <span className="ob-ago"><IonIcon icon={timeOutline} aria-hidden="true" />{ago(o.createdAt, now)}</span>
          </span>
          <span className="ob-who">
            <span className="ob-avatar" aria-hidden="true">{initials(o.customer.name)}</span>
            <span className="ob-name">{o.customer.name}</span>
          </span>
          <ul className="ob-items">
            {o.items.slice(0, PREVIEW_ITEMS).map((i) => (
              <li key={i.productId} className={out(i.productId) ? 'is-out' : ''}>
                <b>{i.saleType === 'peso' ? qtyText(i.qty, i.saleType) : `${i.qty}×`}</b>
                <span className="ob-item-name">{i.name}</span>
                {out(i.productId) ? <span className="ob-out">Agotado</span> : <span className="ob-item-price">{money(lineTotal(i.qty, i.price, i.saleType))}</span>}
              </li>
            ))}
            {rest > 0 && <li className="ob-more">y {rest} {rest === 1 ? 'producto más' : 'productos más'}</li>}
          </ul>
          {o.issue && (
            <span className="ob-notice">
              <IonIcon icon={hourglassOutline} aria-hidden="true" />
              <span><strong>Esperando al cliente.</strong> Debe elegir si cancela el pedido o recibe lo disponible por {money(available)}.</span>
            </span>
          )}
          {(missing || (o.editedAt && !o.issue)) && (
            <span className="ob-flags">
              {missing && <span className="ob-flag is-warn"><IonIcon icon={warningOutline} />Falta existencia</span>}
              {o.editedAt && !o.issue && <span className="ob-flag is-edited"><IonIcon icon={createOutline} />El cliente cambió productos</span>}
            </span>
          )}
          <span className="ob-card-foot">
            <span className="ob-card-meta">
              <span>{n} {n === 1 ? 'pieza' : 'piezas'}</span>
              {isPaidOnline(o) ? (
                <span className="ob-pay is-paid"><IonIcon icon={globeOutline} aria-hidden="true" />Pagado en línea</span>
              ) : (
                <span className="ob-pay"><IonIcon icon={storefrontOutline} aria-hidden="true" />Pago en tienda</span>
              )}
            </span>
            <span className="ob-card-total">
              <small>Total</small>
              <strong className="money">{money(o.total)}</strong>
            </span>
          </span>
        </button>
        <div className="ob-card-actions">
          {o.issue ? (
            <IonButton fill="outline" className="ob-act is-waiting" disabled>
              <IonIcon slot="start" icon={hourglassOutline} />
              Esperando respuesta
            </IonButton>
          ) : (
            <IonButton fill={o.status === 'listo' ? 'solid' : 'outline'} color={o.status === 'listo' ? 'success' : undefined} className="ob-act" disabled={busy === o.id} onClick={() => void act(o)}>
              {o.status === 'listo' ? 'Entregar' : ORDER_NEXT_ACTION[o.status as keyof typeof ORDER_NEXT_ACTION]}
            </IonButton>
          )}
          <IonButton fill="outline" className="ob-problem" onClick={() => askProblem(o)} aria-label={`Problema con el pedido ${o.folio}`} title="Producto agotado o cancelar">
            <IonIcon slot="icon-only" icon={alertCircleOutline} />
          </IonButton>
        </div>
      </li>
    );
  };

  // Mientras llegan los datos: dos tarjetas de la misma altura por columna
  const skeleton = (
    <ul className="ob-cards" aria-hidden="true">
      {[0, 1].map((k) => (
        <li key={k} className="ob-card is-skeleton">
          <IonSkeletonText animated className="sk-row" />
          <IonSkeletonText animated className="sk-who" />
          <IonSkeletonText animated className="sk-items" />
          <IonSkeletonText animated className="sk-row" />
          <IonSkeletonText animated className="sk-act" />
        </li>
      ))}
    </ul>
  );

  return (
    <IonPage>
      <PanelHeader title="Pedidos" />
      <IonContent>
        <div className="ppage ob-page">
          <div className="ppage-head">
            <div>
              <h1>Pedidos</h1>
              <p>
                {active.length ? `${active.length} por entregar · ${money(sumOf(active))}` : 'Nada por entregar'}
                {waiting.length > 0 && ` · ${waiting.length} esperando al cliente`}
              </p>
            </div>
            <div className="ppage-actions">
              <IonButton className="ob-code" onClick={() => setVerifying({})}>
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
                      <span className="ob-col-icon"><IonIcon icon={c.icon} aria-hidden="true" /></span>
                      <h2>{c.title}</h2>
                      <span className="ob-col-count">{ready ? list.length : '–'}</span>
                      {ready && list.length > 0 && <span className="ob-col-sum money">{money(sumOf(list))}</span>}
                    </header>
                    {!ready ? (
                      skeleton
                    ) : list.length === 0 ? (
                      <div className="ob-empty">
                        <span className="ob-empty-icon"><IonIcon icon={fileTrayOutline} aria-hidden="true" /></span>
                        <strong>{c.empty}</strong>
                        <small>{c.help}</small>
                      </div>
                    ) : (
                      <ul className="ob-cards">{list.map(card)}</ul>
                    )}
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

      <PanelModal
        isOpen={!!open}
        onClose={() => setOpenId(undefined)}
        busy={!!open && busy === open.id}
        size="detail"
        className="od-modal"
        title={open ? <>{open.folio}<OrderStatusChip status={open.status} /></> : ''}
      >
        {open && (
          <OrderDetail
            order={open}
            sale={sale}
            missingNow={openMissing}
            busy={busy === open.id}
            onAct={() => void act(open)}
            onProblem={() => askProblem(open)}
            onPrint={() => sale && printSale(sale, store, ticketConfig)}
          />
        )}
      </PanelModal>

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
