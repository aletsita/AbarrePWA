import { qtyText, roundQty } from '../../../domain/weight';
import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar, useIonRouter } from '@ionic/react';
import {
  bookOutline,
  cardOutline,
  cashOutline,
  checkmarkCircle,
  checkmarkDone,
  closeOutline,
  personAddOutline,
  swapHorizontalOutline,
} from 'ionicons/icons';
import { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { availableCredit, initials, money, type CashMethod, type PaymentMethod } from '../../../data/models';
import { PICKUP_METHODS } from '../../../data/pickup';
import { piecesLabel, shortfallText, type Shortfall } from '../../../domain/stock';
import { useAppAlert } from '../../../components/AppAlert';
import { Notice } from '../../../components/Notice';
import { CustomerPicker } from '../Customers/CustomerPicker';
import './CheckoutModal.css';

const METHODS: { id: PaymentMethod; label: string; hint: string; icon: string }[] = [
  { id: 'efectivo', label: 'Efectivo', hint: 'Calcula el cambio', icon: cashOutline },
  { id: 'tarjeta', label: 'Tarjeta', hint: 'En la terminal', icon: cardOutline },
  { id: 'transferencia', label: 'Transferencia', hint: 'A tu cuenta', icon: swapHorizontalOutline },
  { id: 'credito', label: 'A crédito', hint: 'Se fía al cliente', icon: bookOutline },
];

// Pide y recoge: cobrar un pedido en lugar de la cuenta abierta (sin crédito)
export interface OrderCharge {
  folio: string;
  total: number;
  count: number;
  // Regresa un mensaje si no se pudo (por ejemplo, el servidor dice que ya no alcanza el inventario)
  onConfirm: (method: CashMethod, paid: number) => Promise<string | null>;
}

export function CheckoutModal({ isOpen, onClose, order }: { isOpen: boolean; onClose: () => void; order?: OrderCharge }) {
  const app = useApp();
  const { confirmSale, account, customers, linkCustomer } = app;
  // Un pedido ya tiene sus piezas apartadas; la cuenta de mostrador se revisa contra lo disponible
  const shortages = order ? [] : app.ticketShortages;
  const ticketTotal = order ? order.total : app.ticketTotal;
  const ticketCount = order ? order.count : app.ticketCount;
  const methods = order ? METHODS.filter((m) => (PICKUP_METHODS as PaymentMethod[]).includes(m.id)) : METHODS;
  const router = useIonRouter();
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [paidText, setPaidText] = useState('');
  const [upfrontText, setUpfrontText] = useState('');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const showAlert = useAppAlert();

  const customer = customers.find((c) => c.id === account.customerId);
  const paid = Number(paidText) || 0;
  const change = paid - ticketTotal;
  const quick = [50, 100, 200, 500, 1000].filter((v) => v > ticketTotal).slice(0, 3);

  // A crédito: lo que no se abona ahora se carga a la cuenta del cliente
  const upfront = Math.min(Number(upfrontText) || 0, ticketTotal);
  const charged = ticketTotal - upfront;
  const available = customer ? availableCredit(customer) : 0;
  const creditOk = !!customer && charged <= available + 0.005;

  const canConfirm = shortages.length === 0 && (method === 'efectivo' ? paid >= ticketTotal : method === 'credito' ? creditOk : true);

  // Lo que respondió el servidor si no dejó cobrar (por ejemplo, otra caja se llevó la última pieza)
  const refused = (message: string, shortages?: Shortfall[]) =>
    void showAlert({
      tone: 'error',
      title: 'No se cobró',
      message: shortages?.length ? (
        <>
          <p>{shortfallText(shortages)}</p>
          <p>Quita o ajusta esas piezas y vuelve a cobrar.</p>
        </>
      ) : (
        message
      ),
      primary: 'Entendido',
    });

  const reset = () => {
    setPaidText('');
    setUpfrontText('');
    setMethod('efectivo');
  };

  const confirm = async () => {
    if (!canConfirm || busy) return;
    setBusy(true);
    if (order) {
      if (method === 'credito' || method === 'en_linea') return setBusy(false);
      const fail = await order.onConfirm(method, method === 'efectivo' ? paid : ticketTotal);
      setBusy(false);
      if (fail) return refused(fail);
      onClose();
      return;
    }
    // El servidor vuelve a revisar el inventario: si alguien más se llevó la pieza, no se cobra
    const r = await confirmSale(method, method === 'efectivo' ? paid : method === 'credito' ? upfront : ticketTotal);
    setBusy(false);
    if (!r.ok) return refused(r.message, r.shortages);
    onClose();
    router.push('/panel/venta-completada', 'forward');
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={() => { onClose(); reset(); }} className="pmodal co-modal">
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>{order ? `Cobrar pedido ${order.folio}` : 'Cobrar'}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Cerrar">
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <div className="pmodal-body co-body">
        <section className="co-total" aria-label="Total a cobrar">
          <span className="co-total-label">{order ? `Pedido ${order.folio}` : account.name}</span>
          <strong className="money">{money(ticketTotal)}</strong>
          <span className="co-total-meta">
            {ticketCount} {ticketCount === 1 ? 'artículo' : 'artículos'}
            {customer && !order && <> · {customer.name}</>}
          </span>
        </section>

        {shortages.length > 0 && (
          <Notice tone="error" title="No se puede cobrar: falta inventario">
            <ul>
              {shortages.map((s) => (
                <li key={s.product.id}>
                  {s.product.name}: en la cuenta {qtyText(s.qty, s.product.saleType)}, disponibles {qtyText(s.available, s.product.saleType)} (faltan{' '}
                  {piecesLabel(roundQty(s.qty - s.available), s.product.saleType)})
                </li>
              ))}
            </ul>
            <p>Ajusta las cantidades en la cuenta. Lo demás ya está apartado por pedidos o en otras cuentas.</p>
          </Notice>
        )}

        <h3 className="co-step">¿Cómo paga?</h3>
        <div className={`co-methods ${order ? 'is-three' : ''}`} role="radiogroup" aria-label="Forma de pago">
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={method === m.id}
              className={`co-method ${method === m.id ? 'is-active' : ''}`}
              onClick={() => setMethod(m.id)}
            >
              <span className="co-method-icon">
                <IonIcon icon={m.icon} />
              </span>
              <span className="co-method-text">
                <strong>{m.label}</strong>
                <small>{m.hint}</small>
              </span>
              {method === m.id && <IonIcon className="co-check" icon={checkmarkCircle} />}
            </button>
          ))}
        </div>

        {method === 'efectivo' && (
          <section className="co-cash">
            <label className="co-step" htmlFor="co-paid">¿Con cuánto paga?</label>
            <div className="co-input">
              <span>$</span>
              <input
                id="co-paid"
                inputMode="decimal"
                placeholder="0.00"
                value={paidText}
                autoFocus
                onChange={(e) => setPaidText(e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && void confirm()}
              />
            </div>
            <div className="co-quick">
              <button type="button" className={paid === ticketTotal ? 'is-active' : ''} onClick={() => setPaidText(String(ticketTotal))}>
                Exacto
              </button>
              {quick.map((v) => (
                <button key={v} type="button" className={paid === v ? 'is-active' : ''} onClick={() => setPaidText(String(v))}>
                  {money(v).replace('.00', '')}
                </button>
              ))}
            </div>
            <div className={`co-change ${paid === 0 ? 'is-idle' : change >= 0 ? 'is-ok' : 'is-short'}`} aria-live="polite">
              <span>{paid === 0 ? 'Cambio' : change >= 0 ? 'Entrega de cambio' : 'Le faltan'}</span>
              <strong className="money">{money(Math.abs(paid === 0 ? 0 : change))}</strong>
            </div>
          </section>
        )}

        {(method === 'tarjeta' || method === 'transferencia') && (
          <Notice tone="info" title={method === 'tarjeta' ? 'Cobra en la terminal' : 'Espera la transferencia'} className="co-gap">
            {method === 'tarjeta' ? (
              <>Cobra <strong>{money(ticketTotal)}</strong> en la terminal y confirma cuando el pago sea aprobado.</>
            ) : (
              <>Confirma cuando veas la transferencia de <strong>{money(ticketTotal)}</strong> en tu banca.</>
            )}
          </Notice>
        )}

        {method === 'credito' && (
          <section className="co-cash">
            <h3 className="co-step">¿A quién se le fía?</h3>
            {customer ? (
              <div className="co-customer">
                <span className="cu-avatar">{initials(customer.name)}</span>
                <span className="co-customer-text">
                  <strong>{customer.name}</strong>
                  <small>
                    Debe {money(customer.balance)} · disponible {money(available)} de {money(customer.creditLimit)}
                  </small>
                </span>
                <IonButton fill="clear" size="small" onClick={() => setPicking(true)}>
                  Cambiar
                </IonButton>
              </div>
            ) : (
              <button type="button" className="co-pick" onClick={() => setPicking(true)}>
                <IonIcon icon={personAddOutline} />
                <span>
                  <strong>Elige al cliente</strong>
                  <small>La venta queda en su cuenta y la paga después</small>
                </span>
              </button>
            )}

            <label className="co-step" htmlFor="co-upfront">
              Abona ahora en efectivo <span className="co-optional">(opcional)</span>
            </label>
            <div className="co-input is-small">
              <span>$</span>
              <input
                id="co-upfront"
                inputMode="decimal"
                placeholder="0.00"
                value={upfrontText}
                onChange={(e) => setUpfrontText(e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && void confirm()}
              />
            </div>
            {customer && (
              <div className={`co-change ${creditOk ? 'is-ok' : 'is-short'}`} aria-live="polite">
                <span>{creditOk ? 'Queda a su cuenta' : 'Excede su crédito por'}</span>
                <strong className="money">{money(creditOk ? charged : charged - available)}</strong>
              </div>
            )}
            {customer && creditOk && (
              <p className="co-after">
                Después de esta compra debe {money(customer.balance + charged)} y le quedan {money(available - charged)} de crédito.
              </p>
            )}
            {customer && !creditOk && (
              <Notice tone="warning" title="No le alcanza el crédito">
                Pide un abono mayor, cobra de otra forma o sube su límite en Clientes.
              </Notice>
            )}
          </section>
        )}
      </div>

      <div className="pmodal-foot co-foot">
        <IonButton fill="outline" className="btn-lg" onClick={onClose}>
          {order ? 'Volver al pedido' : 'Volver a la cuenta'}
        </IonButton>
        <IonButton color="success" className="btn-lg co-confirm" disabled={!canConfirm || busy} onClick={() => void confirm()}>
          <IonIcon slot="start" icon={checkmarkDone} />
          {busy
            ? 'Cobrando…'
            : method === 'credito'
              ? `Cargar ${money(charged)} a su cuenta`
              : order
                ? `Entregar y cobrar ${money(ticketTotal)}`
                : `Cobrar ${money(ticketTotal)}`}
        </IonButton>
      </div>

      <CustomerPicker
        isOpen={picking}
        selectedId={account.customerId}
        onClose={() => setPicking(false)}
        onPick={(c) => linkCustomer(account.id, c)}
      />
    </IonModal>
  );
}
