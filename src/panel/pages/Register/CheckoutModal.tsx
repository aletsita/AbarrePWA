import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar, useIonRouter } from '@ionic/react';
import {
  alertCircleOutline,
  bookOutline,
  cardOutline,
  cashOutline,
  checkmarkCircle,
  checkmarkDone,
  closeOutline,
  informationCircleOutline,
  personAddOutline,
  swapHorizontalOutline,
} from 'ionicons/icons';
import { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { availableCredit, initials, money, type CashMethod, type PaymentMethod } from '../../../data/models';
import { PICKUP_METHODS } from '../../../data/pickup';
import { piecesLabel } from '../../../domain/stock';
import { CustomerPicker } from '../Customers/CustomerPicker';
import './CheckoutModal.css';

const METHODS: { id: PaymentMethod; label: string; icon: string }[] = [
  { id: 'efectivo', label: 'Efectivo', icon: cashOutline },
  { id: 'tarjeta', label: 'Tarjeta', icon: cardOutline },
  { id: 'transferencia', label: 'Transferencia', icon: swapHorizontalOutline },
  { id: 'credito', label: 'A crédito', icon: bookOutline },
];

// Pide y recoge: cobrar un pedido en lugar de la cuenta abierta (sin crédito)
export interface OrderCharge {
  folio: string;
  total: number;
  count: number;
  onConfirm: (method: CashMethod, paid: number) => void;
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

  const reset = () => {
    setPaidText('');
    setUpfrontText('');
    setMethod('efectivo');
  };

  const confirm = () => {
    if (!canConfirm) return;
    if (order) {
      if (method === 'credito') return;
      order.onConfirm(method, method === 'efectivo' ? paid : ticketTotal);
      onClose();
      return;
    }
    confirmSale(method, method === 'efectivo' ? paid : method === 'credito' ? upfront : ticketTotal);
    onClose();
    router.push('/panel/venta-completada', 'forward');
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={() => { onClose(); reset(); }} className="pmodal">
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>{order ? `Cobrar pedido ${order.folio}` : `Cobrar · ${account.name}`}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Cerrar">
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <div className="pmodal-body">
        <section className="co-total">
          <span>Total a cobrar · {ticketCount} {ticketCount === 1 ? 'artículo' : 'artículos'}</span>
          <strong className="money">{money(ticketTotal)}</strong>
        </section>

        {shortages.length > 0 && (
          <section className="co-short" role="alert">
            <IonIcon icon={alertCircleOutline} />
            <div>
              <strong>No se puede cobrar: falta inventario</strong>
              <ul>
                {shortages.map((s) => (
                  <li key={s.product.id}>
                    {s.product.name}: en la cuenta {s.qty}, disponibles {s.available}
                    {' '}(faltan {piecesLabel(s.qty - s.available)})
                  </li>
                ))}
              </ul>
              <p>Ajusta las cantidades en la cuenta. Lo demás ya está apartado por pedidos o en otras cuentas.</p>
            </div>
          </section>
        )}

        <div className={`co-methods ${order ? 'is-three' : ''}`} role="radiogroup" aria-label="Método de pago">
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={method === m.id}
              className={`co-method ${method === m.id ? 'is-active' : ''}`}
              onClick={() => setMethod(m.id)}
            >
              {method === m.id && <IonIcon className="co-check" icon={checkmarkCircle} />}
              <IonIcon icon={m.icon} className="co-method-icon" />
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {method === 'efectivo' && (
          <section className="co-cash">
            <label htmlFor="co-paid">Paga con</label>
            <div className="co-input">
              <span>$</span>
              <input
                id="co-paid"
                inputMode="decimal"
                placeholder="0.00"
                value={paidText}
                autoFocus
                onChange={(e) => setPaidText(e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && confirm()}
              />
            </div>
            <div className="co-quick">
              <button type="button" onClick={() => setPaidText(String(ticketTotal))}>Exacto</button>
              {quick.map((v) => (
                <button key={v} type="button" onClick={() => setPaidText(String(v))}>
                  {money(v).replace('.00', '')}
                </button>
              ))}
            </div>
            <div className={`co-change ${paid === 0 ? 'is-idle' : change >= 0 ? 'is-ok' : 'is-short'}`} aria-live="polite">
              <span>{paid === 0 || change >= 0 ? 'Cambio' : 'Faltan'}</span>
              <strong className="money">{money(Math.abs(paid === 0 ? 0 : change))}</strong>
            </div>
          </section>
        )}

        {(method === 'tarjeta' || method === 'transferencia') && (
          <section className="co-info">
            <IonIcon icon={informationCircleOutline} />
            <p>
              {method === 'tarjeta' ? (
                <>Cobra <strong>{money(ticketTotal)}</strong> en la terminal y confirma cuando el pago sea aprobado.</>
              ) : (
                <>Confirma cuando veas la transferencia de <strong>{money(ticketTotal)}</strong> en tu banca.</>
              )}
            </p>
          </section>
        )}

        {method === 'credito' && (
          <section className="co-cash">
            {customer ? (
              <div className="co-customer">
                <span className="cu-avatar">{initials(customer.name)}</span>
                <span className="co-customer-text">
                  <strong>{customer.name}</strong>
                  <small>Debe {money(customer.balance)} · disponible {money(available)} de {money(customer.creditLimit)}</small>
                </span>
                <IonButton fill="clear" size="small" onClick={() => setPicking(true)}>Cambiar</IonButton>
              </div>
            ) : (
              <button type="button" className="co-pick" onClick={() => setPicking(true)}>
                <IonIcon icon={personAddOutline} />
                <span>
                  <strong>Elige a qué cliente se le fía</strong>
                  <small>La venta queda en su cuenta y la paga después</small>
                </span>
              </button>
            )}

            <label htmlFor="co-upfront">Abona ahora en efectivo (opcional)</label>
            <div className="co-input">
              <span>$</span>
              <input
                id="co-upfront"
                inputMode="decimal"
                placeholder="0.00"
                value={upfrontText}
                onChange={(e) => setUpfrontText(e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && confirm()}
              />
            </div>
            {customer && (
              <div className={`co-change ${creditOk ? 'is-ok' : 'is-short'}`} aria-live="polite">
                <span>{creditOk ? 'Queda a su cuenta' : 'Excede su crédito por'}</span>
                <strong className="money">{money(creditOk ? charged : charged - available)}</strong>
              </div>
            )}
            {customer && creditOk && (
              <p className="co-after">Después de esta compra debe {money(customer.balance + charged)} y le quedan {money(available - charged)} de crédito.</p>
            )}
            {customer && !creditOk && (
              <p className="co-after is-bad">
                <IonIcon icon={alertCircleOutline} /> Pide un abono mayor, cobra de otra forma o sube su límite en Clientes.
              </p>
            )}
          </section>
        )}
      </div>

      <div className="pmodal-foot">
        <IonButton fill="outline" className="btn-lg" onClick={onClose}>{order ? 'Volver al pedido' : 'Volver a la cuenta'}</IonButton>
        <IonButton color="success" className="btn-lg co-confirm" disabled={!canConfirm} onClick={confirm}>
          <IonIcon slot="start" icon={checkmarkDone} />
          {method === 'credito' ? 'Cargar a su cuenta' : order ? 'Entregar y cobrar' : 'Confirmar venta'}
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
