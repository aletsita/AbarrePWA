import { IonButton, IonIcon } from '@ionic/react';
import {
  alertCircleOutline,
  bagCheckOutline,
  callOutline,
  checkmark,
  checkmarkDoneOutline,
  closeCircleOutline,
  createOutline,
  flameOutline,
  globeOutline,
  hourglassOutline,
  lockClosedOutline,
  printOutline,
  storefrontOutline,
  timeOutline,
} from 'ionicons/icons';
import { PanelModalCancel } from '../../../components/PanelModal';
import { initials, money, PAYMENT_LABEL, time, type Sale, type SaleItem } from '../../../data/models';
import { CANCEL_REASON_LABEL, isPaidOnline, ORDER_NEXT_ACTION, ORDER_STATUS_LABEL, ORDER_STATUSES, type OrderStatus, type PickupOrder } from '../../../data/pickup';
import { qtyText } from '../../../domain/weight';
import './OrderDetail.css';

const STATUS_ICON: Record<OrderStatus, string> = {
  pendiente: timeOutline,
  preparando: flameOutline,
  listo: bagCheckOutline,
  entregado: checkmarkDoneOutline,
  cancelado: closeCircleOutline,
};

const lineAmount = (i: SaleItem) => i.qty * i.price;
const qtyLabel = (i: SaleItem) => (i.saleType === 'peso' ? qtyText(i.qty, 'peso') : `${i.qty}×`);
const names = (o: PickupOrder, ids: string[]) => o.items.filter((i) => ids.includes(i.productId)).map((i) => i.name).join(', ');

// Etiqueta del estado del pedido (encabezado del detalle)
export function OrderStatusChip({ status }: { status: OrderStatus }) {
  return (
    <span className={`od-status is-${status}`}>
      <IonIcon icon={STATUS_ICON[status]} aria-hidden="true" />
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

// Avance: Pendiente → Haciendo → Pedido listo → Entregado
function Progress({ status }: { status: OrderStatus }) {
  const current = ORDER_STATUSES.indexOf(status);
  return (
    <ol className="od-steps" aria-label="Avance del pedido">
      {ORDER_STATUSES.map((s, i) => {
        const state = i < current ? 'is-done' : i === current ? 'is-current' : 'is-todo';
        return (
          <li key={s} className={`od-step ${state}`} aria-current={i === current ? 'step' : undefined}>
            <span className="od-step-dot">
              <IonIcon icon={i < current ? checkmark : STATUS_ICON[s]} aria-hidden="true" />
            </span>
            <span className="od-step-label">{ORDER_STATUS_LABEL[s]}</span>
          </li>
        );
      })}
    </ol>
  );
}

interface Props {
  order: PickupOrder;
  sale?: Sale;
  // Productos que hoy ya no alcanzan (sin aviso al cliente todavía)
  missingNow: SaleItem[];
  busy: boolean;
  onAct: () => void;
  onProblem: () => void;
  onPrint: () => void;
}

// Cuerpo y pie del modal «Detalle del pedido»; las acciones y sus reglas vienen de Orders.tsx
export function OrderDetail({ order: o, sale, missingNow, busy, onAct, onProblem, onPrint }: Props) {
  const out = o.issue?.missing ?? [];
  const count = o.items.reduce((n, i) => n + i.qty, 0);
  const available = o.items.filter((i) => !out.includes(i.productId)).reduce((n, i) => n + lineAmount(i), 0);
  const paidOnline = isPaidOnline(o);
  const open = o.status !== 'entregado' && o.status !== 'cancelado';
  const action = o.status === 'listo' ? 'Entregar' : open ? ORDER_NEXT_ACTION[o.status as keyof typeof ORDER_NEXT_ACTION] : '';

  return (
    <>
      <div className="pmodal-body od-body">
        {o.cancel ? (
          <div className="od-cancelled" role="status">
            <IonIcon icon={closeCircleOutline} aria-hidden="true" />
            <span>
              <strong>Pedido cancelado</strong> · {time(o.cancel.at)}
              <small>
                {o.cancel.reason === 'cliente' ? 'Lo canceló el cliente' : `Por ${CANCEL_REASON_LABEL[o.cancel.reason].toLowerCase()}`}
                {o.cancel.missing.length > 0 && <> · Se agotó: {names(o, o.cancel.missing)}</>}
                {o.cancel.note && <> · “{o.cancel.note}”</>}
              </small>
            </span>
          </div>
        ) : (
          <Progress status={o.status} />
        )}

        <section className="od-customer" aria-label="Cliente">
          <div className="od-who">
            <span className="od-avatar" aria-hidden="true">{initials(o.customer.name)}</span>
            <span className="od-who-text">
              <strong>{o.customer.name}</strong>
              {o.customer.phone && (
                <a className="od-phone" href={`tel:${o.customer.phone.replace(/\s/g, '')}`}>
                  <IonIcon icon={callOutline} aria-hidden="true" />
                  {o.customer.phone}
                </a>
              )}
            </span>
          </div>
          <div className="od-pay">
            <span className="od-when">Pidió a las {time(o.createdAt)}</span>
            {paidOnline ? (
              <span className="od-chip is-online"><IonIcon icon={globeOutline} aria-hidden="true" />Pagado en línea</span>
            ) : o.payment ? (
              <span className="od-chip is-store">
                <IonIcon icon={storefrontOutline} aria-hidden="true" />
                Pagó con {PAYMENT_LABEL[o.payment.method].toLowerCase()}{sale ? ` · venta #${sale.folio}` : ''}
              </span>
            ) : (
              <span className="od-chip is-store"><IonIcon icon={storefrontOutline} aria-hidden="true" />Pago en tienda</span>
            )}
            {paidOnline && open && <small className="od-pay-note">Al entregar solo pide el código</small>}
          </div>
        </section>

        {o.note && <p className="od-note">“{o.note}”</p>}

        {o.issue && (
          <div className="od-attn" role="status">
            <span className="od-attn-icon"><IonIcon icon={hourglassOutline} aria-hidden="true" /></span>
            <span>
              <strong>Esperando al cliente</strong>
              Le avisaste a las {time(o.issue.at)} que se agotó <b>{names(o, o.issue.missing)}</b>. Puede elegir otro producto, quitarlo o cancelar.
            </span>
          </div>
        )}
        {o.editedAt && !o.issue && o.status !== 'cancelado' && (
          <p className="od-flag is-edited">
            <IonIcon icon={createOutline} aria-hidden="true" />
            El cliente cambió los productos a las {time(o.editedAt)}.
          </p>
        )}
        {!o.issue && missingNow.length > 0 && (
          <p className="od-flag is-warn">
            <IonIcon icon={alertCircleOutline} aria-hidden="true" />
            Ya no alcanza: {missingNow.map((i) => i.name).join(', ')}.
          </p>
        )}

        <section aria-labelledby="od-items-title">
          <h3 className="od-items-title" id="od-items-title">
            Productos <span>{count} {count === 1 ? 'pieza' : 'piezas'}</span>
          </h3>
          <ul className="od-items">
            {o.items.map((i) => {
              const isOut = out.includes(i.productId);
              return (
                <li key={i.productId} className={isOut ? 'is-out' : ''}>
                  <span className="od-qty">{qtyLabel(i)}</span>
                  <span className="od-name">
                    <span>{i.name}</span>
                    {isOut && <span className="od-out">Agotado</span>}
                  </span>
                  <span className="money od-line">{money(lineAmount(i))}</span>
                </li>
              );
            })}
          </ul>
          <div className="od-totals">
            {out.length > 0 && (
              <div className="od-total is-partial">
                <span>Si recibe solo lo disponible</span>
                <strong className="money">{money(available)}</strong>
              </div>
            )}
            <div className="od-total">
              <span>Total del pedido</span>
              <strong className="money">{money(o.total)}</strong>
            </div>
          </div>
        </section>
      </div>

      <div className="pmodal-foot od-foot">
        {open && (
          <IonButton fill="outline" className="od-problem" onClick={onProblem}>
            <IonIcon slot="start" icon={alertCircleOutline} />
            Producto agotado o cancelar
          </IonButton>
        )}
        <span className="od-foot-end">
          <PanelModalCancel className="od-close">Cerrar</PanelModalCancel>
          {o.status === 'entregado' && sale && (
            <IonButton fill="outline" onClick={onPrint}>
              <IonIcon slot="start" icon={printOutline} />
              Imprimir ticket
            </IonButton>
          )}
          {open &&
            (o.issue ? (
              // Un botón deshabilitado no muestra su title: el aviso va en el contenedor
              <span className="od-locked" title="Esperando respuesta del cliente">
                <IonButton disabled aria-describedby="od-locked-why">
                  <IonIcon slot="start" icon={lockClosedOutline} />
                  {action}
                </IonButton>
                <span id="od-locked-why" className="ion-hide">Esperando respuesta del cliente</span>
              </span>
            ) : (
              <IonButton disabled={busy} onClick={onAct}>{action}</IonButton>
            ))}
        </span>
      </div>
    </>
  );
}
