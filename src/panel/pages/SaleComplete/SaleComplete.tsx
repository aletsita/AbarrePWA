import { IonButton, IonContent, IonIcon, IonPage, useIonViewDidEnter } from '@ionic/react';
import { calculatorOutline, printOutline } from 'ionicons/icons';
import { useRef } from 'react';
import { SyncBadge } from '../../../components/SyncBadge';
import { useApp } from '../../../context/AppContext';
import { money, PAYMENT_LABEL, time } from '../../../data/models';
import { printSale } from '../../../lib/print';
import { PanelHeader } from '../../components/PanelHeader';
import './SaleComplete.css';

export default function SaleComplete() {
  const { sales, lastSaleId, store, ticketConfig, customers, accounts } = useApp();
  const next = useRef<HTMLIonButtonElement>(null);
  const sale = sales.find((s) => s.id === lastSaleId);
  const change = sale?.method === 'efectivo' && sale.paid ? sale.paid - sale.total : 0;
  const customer = customers.find((c) => c.id === sale?.customerId);
  const waiting = accounts.filter((a) => a.count > 0);
  const [first, ...rest] = ticketConfig.header.split('\n');

  useIonViewDidEnter(() => next.current?.focus());

  return (
    <IonPage>
      <PanelHeader title="Venta registrada" />
      <IonContent className="done">
        <div className="ppage done-grid">
          <section className="done-main">
            <div className="done-check" aria-hidden="true">
              <svg viewBox="0 0 120 120">
                <circle className="done-ring" cx="60" cy="60" r="52" />
                <path className="done-tick" d="M38 62l15 15 30-32" />
              </svg>
            </div>
            <h1>{sale?.method === 'en_linea' ? `Venta exitosa · #${sale.folio}` : `Venta #${sale?.folio} registrada`}</h1>
            {sale?.method === 'en_linea' && (
              <p className="done-change">
                Pedido <strong>{sale.orderFolio}</strong> pagado en línea · no se cobró en caja
              </p>
            )}
            <p className="done-total money">{money(sale?.total ?? 0)}</p>
            {sale?.method === 'efectivo' && (
              <p className="done-change">
                Cambio: <strong className="money">{money(change)}</strong>
              </p>
            )}
            {sale?.method === 'credito' && (
              <p className="done-change">
                {sale.paid ? <>Abonó <strong className="money">{money(sale.paid)}</strong> · </> : null}
                Quedó a cuenta de <strong>{sale.customerName}</strong>
                {customer && <> · ahora debe <strong className="money">{money(customer.balance)}</strong></>}
              </p>
            )}
            {waiting.length > 0 && (
              <p className="done-waiting">
                {waiting.length === 1 ? 'Hay 1 cuenta abierta en espera' : `Hay ${waiting.length} cuentas abiertas en espera`}:{' '}
                {waiting.map((a) => a.name).join(', ')}
              </p>
            )}
            {sale?.pending && (
              <p className="done-pending">
                <SyncBadge state="pendiente" /> Sin conexión: la venta se guardó en este equipo y se subirá sola.
              </p>
            )}
            <div className="done-actions">
              <IonButton ref={next} color="secondary" className="btn-xl" routerLink="/panel/caja" routerDirection="root">
                <IonIcon slot="start" icon={calculatorOutline} />
                Nueva venta
              </IonButton>
              <IonButton fill="outline" className="btn-xl" disabled={!sale} onClick={() => sale && printSale(sale, store, ticketConfig, customer)}>
                <IonIcon slot="start" icon={printOutline} />
                Imprimir ticket
              </IonButton>
            </div>
          </section>

          {sale && (
            <aside className="ticket" aria-label="Ticket">
              <header>
                {ticketConfig.showLogo && <img src="/icons/icon.svg" alt="" width="32" height="32" />}
                <strong>{first}</strong>
                {rest.map((l, i) => <span key={i}>{l}</span>)}
                <span>RFC {store.rfc}</span>
              </header>
              <p className="ticket-meta">
                Folio {sale.folio} · {new Date(sale.date).toLocaleDateString('es-MX')} {time(sale.date)}
              </p>
              <ul>
                {sale.items.map((i) => (
                  <li key={i.productId}>
                    <span>{i.qty} × {i.name}</span>
                    <span>{money(i.qty * i.price)}</span>
                  </li>
                ))}
              </ul>
              <div className="ticket-total"><span>TOTAL</span><span>{money(sale.total)}</span></div>
              {sale.method === 'credito' ? (
                <>
                  {!!sale.paid && <div className="ticket-row"><span>Abono en efectivo</span><span>{money(sale.paid)}</span></div>}
                  <div className="ticket-row"><span>A crédito</span><span>{money(sale.total - (sale.paid ?? 0))}</span></div>
                  {customer && <div className="ticket-row"><span>Saldo pendiente</span><span>{money(customer.balance)}</span></div>}
                </>
              ) : sale.method === 'en_linea' ? (
                <div className="ticket-row"><span>Pagado en línea</span><span>{money(sale.total)}</span></div>
              ) : (
                <div className="ticket-row"><span>{PAYMENT_LABEL[sale.method]}</span><span>{money(sale.paid ?? sale.total)}</span></div>
              )}
              {sale.method === 'efectivo' && <div className="ticket-row"><span>Cambio</span><span>{money(change)}</span></div>}
              {sale.customerName && <div className="ticket-row"><span>Cliente</span><span>{sale.customerName}</span></div>}
              <footer>
                {ticketConfig.footer}
                {ticketConfig.showEmployee && <><br />Atendió: {sale.employee}</>}
              </footer>
            </aside>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
