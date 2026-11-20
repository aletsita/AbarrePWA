import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonModal, IonPage, IonTitle, IonToolbar, useIonToast } from '@ionic/react';
import {
  alertCircleOutline,
  bagCheckOutline,
  callOutline,
  checkmarkDoneOutline,
  closeOutline,
  flameOutline,
  printOutline,
  qrCodeOutline,
  timeOutline,
} from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { StatCard } from '../../../components/StatCard';
import { useApp } from '../../../context/AppContext';
import { isToday, money, PAYMENT_LABEL, time } from '../../../data/models';
import { ACTIVE_STATUSES, ORDER_NEXT_ACTION, ORDER_STATUS_LABEL, reservedStock, type OrderStatus, type PickupOrder } from '../../../data/pickup';
import { printSale } from '../../../lib/print';
import { PanelHeader } from '../../components/PanelHeader';
import { CheckoutModal } from '../Register/CheckoutModal';
import { PickupCodeModal } from './PickupCodeModal';
import './Orders.css';

const NEW_MS = 2 * 60000;
const TABS: { id: OrderStatus; label: string }[] = [
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'preparando', label: 'Preparando' },
  { id: 'listo', label: 'Listos' },
  { id: 'entregado', label: 'Entregados' },
];

function ago(iso: string, now: number) {
  const min = Math.floor((now - Date.parse(iso)) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

const pieces = (o: PickupOrder) => o.items.reduce((n, i) => n + i.qty, 0);

export default function Orders() {
  const { orders, products, sales, store, ticketConfig, advanceOrder, deliverOrder } = useApp();
  const [tab, setTab] = useState<OrderStatus>(() => ACTIVE_STATUSES.find((st) => orders.some((o) => o.status === st)) ?? 'pendiente');
  const [openId, setOpenId] = useState<string>();
  // Entrega en dos pasos: primero el código del cliente, después el cobro
  const [verifying, setVerifying] = useState<{ order?: PickupOrder } | null>(null);
  const [charging, setCharging] = useState<{ order: PickupOrder; code: string }>();
  const [now, setNow] = useState(Date.now());
  const [toast] = useIonToast();

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const byStatus = (st: OrderStatus) =>
    orders
      .filter((o) => o.status === st)
      .sort((a, b) =>
        st === 'entregado'
          ? Date.parse(b.deliveredAt ?? b.updatedAt) - Date.parse(a.deliveredAt ?? a.updatedAt)
          : Date.parse(a.createdAt) - Date.parse(b.createdAt),
      );
  const list = byStatus(tab).filter((o) => tab !== 'entregado' || isToday(o.deliveredAt ?? o.updatedAt));
  const sumOf = (l: PickupOrder[]) => l.reduce((n, o) => n + o.total, 0);
  const deliveredToday = byStatus('entregado').filter((o) => isToday(o.deliveredAt ?? o.updatedAt));
  const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
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

  const act = (o: PickupOrder) => {
    if (o.status !== 'listo') return advanceOrder(o.id);
    setOpenId(undefined);
    // Pedidos guardados antes del código para recoger pasan directo al cobro
    if (!o.pickupCode) setCharging({ order: o, code: '' });
    else setVerifying({ order: o });
  };

  const sale = open?.saleId ? sales.find((s) => s.id === open.saleId) : undefined;
  const openMissing = open ? shortages(open) : [];

  return (
    <IonPage>
      <PanelHeader title="Pedidos" />
      <IonContent>
        <div className="ppage">
          <div className="ppage-head">
            <div>
              <h1>Pedidos</h1>
              <p>{active.length ? `${active.length} por entregar · ${money(active.reduce((n, o) => n + o.total, 0))}` : 'Nada por entregar'}</p>
            </div>
            <div className="ppage-actions">
              <IonButton className="btn-lg" onClick={() => setVerifying({})}>
                <IonIcon slot="start" icon={qrCodeOutline} />
                Entregar con código
              </IonButton>
            </div>
          </div>

          <div className="kpis">
            <StatCard tone="danger" icon={timeOutline} label="Pendientes" value={String(byStatus('pendiente').length)} hint="Por empezar a preparar"
              active={tab === 'pendiente'} onClick={() => setTab('pendiente')} />
            <StatCard tone="primary" icon={flameOutline} label="Preparando" value={String(byStatus('preparando').length)} hint={money(sumOf(byStatus('preparando')))}
              active={tab === 'preparando'} onClick={() => setTab('preparando')} />
            <StatCard tone="warning" icon={bagCheckOutline} label="Listos para recoger" value={String(byStatus('listo').length)} hint={`${money(sumOf(byStatus('listo')))} por cobrar`}
              active={tab === 'listo'} onClick={() => setTab('listo')} />
            <StatCard tone="success" icon={checkmarkDoneOutline} label="Entregados hoy" value={String(deliveredToday.length)} hint={money(sumOf(deliveredToday))}
              active={tab === 'entregado'} onClick={() => setTab('entregado')} />
          </div>

          <div className="filters">
            <div className="fchips" role="group" aria-label="Estado">
              {TABS.map((t) => (
                <button key={t.id} type="button" className={`fchip ${tab === t.id ? 'is-active' : ''}`} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <section className="pcard">
            {list.length === 0 ? (
              <EmptyState
                art="cart"
                title={tab === 'entregado' ? 'Aún no entregas pedidos hoy' : `Sin pedidos ${TABS.find((t) => t.id === tab)!.label.toLowerCase()}`}
                text="Los pedidos que hagan tus clientes desde la app aparecen aquí."
              />
            ) : (
              <>
                <div className="pcard-head"><h2>{list.length} {list.length === 1 ? 'pedido' : 'pedidos'} · {money(sumOf(list))}</h2></div>
                <ul className="ord-list">
                  {list.map((o) => {
                    const fresh = o.status === 'pendiente' && now - Date.parse(o.createdAt) < NEW_MS;
                    const missing = shortages(o).length > 0;
                    return (
                      <li key={o.id} className="ord-row">
                        <button type="button" className="ord-row-main" onClick={() => setOpenId(o.id)}>
                          <span className="ord-row-folio">
                            {fresh && <span className="ord-dot" aria-label="Nuevo" />}
                            {o.folio}
                          </span>
                          <span className="ord-row-who">
                            <strong>{o.customer.name}</strong>
                            <small>
                              {pieces(o)} {pieces(o) === 1 ? 'pieza' : 'piezas'} · {o.status === 'entregado' ? time(o.deliveredAt ?? o.updatedAt) : ago(o.createdAt, now)}
                              {missing && <em> · falta existencia</em>}
                            </small>
                          </span>
                          <span className="ord-row-total money">{money(o.total)}</span>
                        </button>
                        {o.status !== 'entregado' && (
                          <IonButton fill={o.status === 'listo' ? 'solid' : 'outline'} color={o.status === 'listo' ? 'success' : undefined} className="ord-row-act" onClick={() => act(o)}>
                            {o.status === 'listo' ? 'Entregar' : ORDER_NEXT_ACTION[o.status]}
                          </IonButton>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
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
              </dl>

              {open.note && <p className="ord-note">“{open.note}”</p>}
              {openMissing.length > 0 && (
                <p className="ord-warn">
                  <IonIcon icon={alertCircleOutline} />
                  Ya no alcanza: {openMissing.map((i) => i.name).join(', ')}.
                </p>
              )}

              <ul className="ord-items">
                {open.items.map((i) => (
                  <li key={i.productId}>
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
              ) : (
                <IonButton className="btn-lg" color={open.status === 'listo' ? 'success' : undefined} onClick={() => act(open)}>
                  {open.status === 'listo' ? 'Entregar' : ORDER_NEXT_ACTION[open.status]}
                </IonButton>
              )}
            </div>
          </>
        )}
      </IonModal>

      <PickupCodeModal
        isOpen={!!verifying}
        order={verifying?.order}
        orders={orders}
        onClose={() => setVerifying(null)}
        onVerified={(order, code) => {
          setVerifying(null);
          setCharging({ order, code });
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
            onConfirm: (method, paid) => {
              const s = deliverOrder(charging.order.id, method, paid, charging.code);
              if (!s) return;
              setTab('entregado');
              toast({
                message: `${charging.order.folio} entregado · venta #${s.folio}`,
                duration: 4000,
                color: 'success',
                position: 'top',
                cssClass: 'toast-app',
                buttons: [{ text: 'Imprimir ticket', handler: () => printSale(s, store, ticketConfig) }],
              });
            },
          }
        }
      />
    </IonPage>
  );
}
