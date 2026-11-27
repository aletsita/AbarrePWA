import { IonButton, IonButtons, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/react';
import { bagHandleOutline, bookOutline, cardOutline, cashOutline, closeOutline, globeOutline, printOutline, swapHorizontalOutline } from 'ionicons/icons';
import { ProductThumb } from '../../../components/ProductThumb';
import { SyncBadge } from '../../../components/SyncBadge';
import { useApp } from '../../../context/AppContext';
import { money, ORIGIN_LABEL, PAYMENT_LABEL, saleOrigin, shortDate, time, type PaymentMethod, type Sale } from '../../../data/models';
import { itemCount, lineTotal, qtyText } from '../../../domain/weight';
import { printSale } from '../../../lib/print';

export const METHOD_ICON: Record<PaymentMethod, string> = { efectivo: cashOutline, tarjeta: cardOutline, transferencia: swapHorizontalOutline, credito: bookOutline, en_linea: globeOutline };

// Detalle de una venta: folio, fecha y estado arriba; productos; totales; pago y abonos aparte; acciones al pie
export function SaleDetail({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { store, ticketConfig, customers, creditMovements, products } = useApp();
  const subtotal = sale.items.reduce((t, i) => t + lineTotal(i.qty, i.price, i.saleType), 0);
  const discount = Math.max(0, Math.round((subtotal - sale.total) * 100) / 100);
  const credit = sale.method === 'credito';
  // A crédito: lo que se abonó al momento (el abono inicial queda ligado a la venta)
  const abonos = creditMovements.filter((m) => m.saleId === sale.id && m.type === 'abono');
  const paid = credit ? abonos.reduce((t, m) => t + m.amount, 0) || sale.paid || 0 : sale.total;
  const owed = credit ? Math.max(0, Math.round((sale.total - paid) * 100) / 100) : 0;

  return (
    <>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>Detalle de la venta</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Cerrar">
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <div className="pmodal-body sd-body">
        <section className="sd-head">
          <div className="sd-head-top">
            <span className="sd-folio">
              <small>Folio</small>
              <strong>#{sale.folio}</strong>
            </span>
            {sale.pending ? (
              <SyncBadge state="pendiente" />
            ) : (
              <span className={`sd-state ${owed > 0 ? 'is-owed' : ''}`}>{owed > 0 ? 'Con saldo a cuenta' : 'Pagada'}</span>
            )}
          </div>
          <span className="sd-date">
            {new Date(sale.date).toLocaleDateString('es-MX', { dateStyle: 'long' })} · {time(sale.date)}
          </span>
          <strong className="money sd-head-total">{money(sale.total)}</strong>
        </section>

        <section className="sd-section">
          <h3>
            Productos <span>{itemCount(sale.items)}</span>
          </h3>
          <ul className="sd-lines">
            {sale.items.map((i) => {
              const p = products.find((x) => x.id === i.productId);
              return (
                <li key={i.productId}>
                  <ProductThumb product={{ name: i.name, category: p?.category ?? 'Otros', photo: p?.photo }} size={42} />
                  <span className="sd-line-info">
                    <strong>{i.name}</strong>
                    <small>
                      {qtyText(i.qty, i.saleType)} × {money(i.price)}
                    </small>
                  </span>
                  <strong className="money sd-line-sub">{money(lineTotal(i.qty, i.price, i.saleType))}</strong>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="sd-totals" aria-label="Totales">
          <div>
            <span>Subtotal</span>
            <span className="money">{money(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="is-discount">
              <span>Descuentos</span>
              <span className="money">−{money(discount)}</span>
            </div>
          )}
          <div className="is-total">
            <span>Total</span>
            <strong className="money">{money(sale.total)}</strong>
          </div>
          <div>
            <span>Pagado</span>
            <span className="money">{money(paid)}</span>
          </div>
          {owed > 0 && (
            <div className="is-owed">
              <span>Pendiente (a cuenta)</span>
              <strong className="money">{money(owed)}</strong>
            </div>
          )}
        </section>

        <section className="sd-section">
          <h3>Método de pago</h3>
          <dl className="sd-facts">
            <div>
              <dt>Pagó con</dt>
              <dd>
                <span className={`pill is-${sale.method}`}>
                  <IonIcon icon={METHOD_ICON[sale.method]} />
                  {PAYMENT_LABEL[sale.method]}
                </span>
              </dd>
            </div>
            {sale.method === 'efectivo' && sale.paid !== undefined && (
              <div>
                <dt>Recibido · cambio</dt>
                <dd>
                  {money(sale.paid)} · {money(Math.max(0, sale.paid - sale.total))}
                </dd>
              </div>
            )}
            {sale.customerName && (
              <div>
                <dt>Cliente</dt>
                <dd>{sale.customerName}</dd>
              </div>
            )}
          </dl>
        </section>

        {credit && (
          <section className="sd-section">
            <h3>Abonos</h3>
            {abonos.length ? (
              <ul className="sd-abonos">
                {abonos.map((m) => (
                  <li key={m.id}>
                    <span>
                      <strong>{m.note}</strong>
                      <small>
                        {shortDate(m.date)} · {time(m.date)} · {m.employee}
                      </small>
                    </span>
                    <strong className="money">{money(m.amount)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sd-empty">{sale.paid ? `Abonó ${money(sale.paid)} al momento.` : `Sin abono al momento; quedó a cuenta de ${sale.customerName ?? 'el cliente'}.`}</p>
            )}
          </section>
        )}

        <section className="sd-section">
          <h3>Venta</h3>
          <dl className="sd-facts">
            <div>
              <dt>Atendió</dt>
              <dd>{sale.employee}</dd>
            </div>
            <div>
              <dt>Origen</dt>
              <dd>{ORIGIN_LABEL[saleOrigin(sale)]}</dd>
            </div>
            {sale.orderFolio && (
              <div>
                <dt>Pedido</dt>
                <dd>
                  <span className="pill is-pickup">
                    <IonIcon icon={bagHandleOutline} />
                    {sale.orderFolio}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </section>
      </div>
      <div className="pmodal-foot">
        <IonButton fill="outline" className="btn-lg" onClick={onClose}>
          Cerrar
        </IonButton>
        <IonButton className="btn-lg" onClick={() => printSale(sale, store, ticketConfig, customers.find((c) => c.id === sale.customerId))}>
          <IonIcon slot="start" icon={printOutline} />
          Reimprimir ticket
        </IonButton>
      </div>
    </>
  );
}
