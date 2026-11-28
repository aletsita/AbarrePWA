import { qtyText, roundQty } from '../../../domain/weight';
import { IonButton, IonIcon, IonSpinner, useIonRouter } from '@ionic/react';
import {
  alertCircleOutline,
  arrowBackOutline,
  bookOutline,
  cardOutline,
  cartOutline,
  cashOutline,
  checkmarkCircle,
  checkmarkDone,
  lockClosedOutline,
  personAddOutline,
  swapHorizontalOutline,
} from 'ionicons/icons';
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useApp } from '../../../context/AppContext';
import { availableCredit, initials, money, type CashMethod, type PaymentMethod } from '../../../data/models';
import { PICKUP_METHODS } from '../../../data/pickup';
import { piecesLabel, shortfallText, type Shortfall } from '../../../domain/stock';
import { IsotipoMark } from '../../../components/IsotipoMark';
import { CustomerPicker } from '../Customers/CustomerPicker';
import './CheckoutModal.css';
import { PanelModal } from '../../../components/PanelModal';

const METHODS: { id: PaymentMethod; label: string; hint: string; icon: string }[] = [
  { id: 'efectivo', label: 'Efectivo', hint: 'Calcula el cambio', icon: cashOutline },
  { id: 'tarjeta', label: 'Tarjeta', hint: 'En la terminal', icon: cardOutline },
  { id: 'transferencia', label: 'Transferencia', hint: 'A tu cuenta', icon: swapHorizontalOutline },
  { id: 'credito', label: 'A crédito', hint: 'Se fía al cliente', icon: bookOutline },
];

// Texto de apoyo de los métodos sin monto que capturar
const METHOD_HELP: Partial<Record<PaymentMethod, string>> = {
  tarjeta: 'Cobra en la terminal y confirma',
  transferencia: 'Confirma que recibiste la transferencia',
  credito: 'Se registrará como saldo a crédito del cliente',
};

// Atajos de billete: los primeros tres que cubren la cuenta, entre billetes comunes y el total redondeado hacia arriba
const BILLS = [50, 100, 200, 500, 1000];
function quickAmounts(total: number) {
  const up = (step: number) => Math.ceil(total / step) * step;
  const options = new Set([...BILLS, up(100), up(500), up(1000), up(1000) + 1000]);
  return [...options].filter((v) => v > total + 0.005).sort((a, b) => a - b).slice(0, 3);
}

// Solo números y un punto decimal
const decimalText = (raw: string) => raw.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');

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
  // Por qué no se cobró (lo dice el servidor); se muestra dentro del modal
  const [error, setError] = useState<ReactNode>();

  const customer = customers.find((c) => c.id === account.customerId);
  const paid = Number(paidText) || 0;
  const change = paid - ticketTotal;
  const quick = quickAmounts(ticketTotal);

  // A crédito: lo que no se abona ahora se carga a la cuenta del cliente
  const upfront = Math.min(Number(upfrontText) || 0, ticketTotal);
  const charged = ticketTotal - upfront;
  const available = customer ? availableCredit(customer) : 0;
  const creditOk = !!customer && charged <= available + 0.005;

  const canConfirm = shortages.length === 0 && (method === 'efectivo' ? paid >= ticketTotal : method === 'credito' ? creditOk : true);

  // Al cambiar el pago, el error del intento anterior ya no aplica
  useEffect(() => setError(undefined), [method, paidText, upfrontText, account.customerId]);

  // Lo que respondió el servidor si no dejó cobrar (por ejemplo, otra caja se llevó la última pieza)
  const refused = (message: string, shortages?: Shortfall[]) =>
    setError(shortages?.length ? <>{shortfallText(shortages)}. Quita o ajusta esas piezas y vuelve a cobrar.</> : message);

  const reset = () => {
    setPaidText('');
    setUpfrontText('');
    setMethod('efectivo');
    setError(undefined);
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

  // Enter cobra desde los campos y desde la forma de pago; los demás botones conservan su Enter
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    if ((e.target as HTMLElement).closest('button:not([role=radio]), a, ion-button')) return;
    e.preventDefault();
    void confirm();
  };

  // Por qué el botón de cobrar está apagado
  const why =
    shortages.length > 0
      ? 'Falta inventario'
      : method === 'efectivo' && paid < ticketTotal
        ? `El monto debe cubrir ${money(ticketTotal)}`
        : method === 'credito' && !customer
          ? 'Elige el cliente'
          : method === 'credito' && !creditOk
            ? 'No le alcanza el crédito'
            : '';

  const cashState = paid === 0 ? 'is-idle' : change < 0 ? 'is-short' : 'is-ok';
  const methodInfo = METHODS.find((m) => m.id === method)!;

  return (
    <PanelModal
      isOpen={isOpen}
      onClose={() => { onClose(); reset(); }}
      busy={busy}
      size="wide"
      className="co-modal"
      title={
        <>
          Cobrar
          <span className="co-chip">{order ? `Pedido ${order.folio}` : customer ? `${account.name} · ${customer.name}` : account.name}</span>
        </>
      }
    >
      <form className="co-form" onSubmit={(e) => e.preventDefault()} onKeyDown={onKeyDown}>
        <div className="pmodal-body co-body">
          <div className="co-col">
            <section className="co-total" aria-label="Total a cobrar">
              <IsotipoMark className="co-total-mark" />
              <span className="co-total-top">
                <span>Total a cobrar</span>
                <span className="co-count">
                  <IonIcon icon={cartOutline} aria-hidden="true" />
                  {ticketCount} {ticketCount === 1 ? 'artículo' : 'artículos'}
                </span>
              </span>
              <strong className="money">{money(ticketTotal)}</strong>
            </section>

            <div>
              <h3 className="co-step" id="co-how">¿Cómo paga?</h3>
              <div className="co-methods" role="radiogroup" aria-labelledby="co-how">
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
                      <IonIcon icon={m.icon} aria-hidden="true" />
                    </span>
                    <span className="co-method-text">
                      <strong>{m.label}</strong>
                      <small>{m.hint}</small>
                    </span>
                    {method === m.id && <IonIcon className="co-check" icon={checkmarkCircle} aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="co-col">
            {method === 'efectivo' ? (
              <>
                <div>
                  <label className="co-step" htmlFor="co-paid">¿Con cuánto paga?</label>
                  <div className={`co-input ${paidText ? 'has-value' : ''}`}>
                    <span aria-hidden="true">$</span>
                    <input
                      id="co-paid"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      value={paidText}
                      autoFocus
                      onChange={(e) => setPaidText(decimalText(e.target.value))}
                    />
                  </div>
                </div>
                <div className="co-quick" role="group" aria-label="Montos rápidos">
                  <button type="button" className={paidText && paid === ticketTotal ? 'is-active' : ''} aria-pressed={!!paidText && paid === ticketTotal} onClick={() => setPaidText(String(ticketTotal))}>
                    Exacto
                  </button>
                  {quick.map((v) => (
                    <button key={v} type="button" className={paid === v ? 'is-active' : ''} aria-pressed={paid === v} onClick={() => setPaidText(String(v))}>
                      {money(v).replace('.00', '')}
                    </button>
                  ))}
                </div>
                <div className={`co-change ${cashState}`} aria-live="polite">
                  <span className="co-change-text">
                    <strong>{cashState === 'is-short' ? 'Falta' : cashState === 'is-ok' && Math.abs(change) < 0.005 ? 'Pago exacto' : 'Cambio'}</strong>
                    <small>
                      {cashState === 'is-idle' ? 'Escribe lo que te da el cliente' : cashState === 'is-short' ? 'Aún no alcanza para cubrir la cuenta' : 'Entrega al cliente'}
                    </small>
                  </span>
                  <strong className="money">{money(cashState === 'is-idle' ? 0 : Math.abs(change))}</strong>
                </div>
              </>
            ) : (
              <section className="co-other">
                <span className="co-other-icon"><IonIcon icon={methodInfo.icon} aria-hidden="true" /></span>
                <strong className="co-other-title">{methodInfo.label} · <span className="money">{money(ticketTotal)}</span></strong>
                <p>{METHOD_HELP[method]}</p>

                {method === 'credito' && (
                  <div className="co-credit">
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
                        <IonIcon icon={personAddOutline} aria-hidden="true" />
                        <span>
                          <strong>Elige al cliente</strong>
                          <small>Obligatorio: la venta queda en su cuenta y la paga después</small>
                        </span>
                      </button>
                    )}

                    <label className="co-upfront" htmlFor="co-upfront">
                      <span>Abona ahora en efectivo <small>(opcional)</small></span>
                      <span className={`co-input is-small ${upfrontText ? 'has-value' : ''}`}>
                        <span aria-hidden="true">$</span>
                        <input
                          id="co-upfront"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0.00"
                          value={upfrontText}
                          onChange={(e) => setUpfrontText(decimalText(e.target.value))}
                        />
                      </span>
                    </label>
                    {customer && (
                      <div className={`co-credit-sum ${creditOk ? 'is-ok' : 'is-short'}`} aria-live="polite">
                        <span>
                          <strong>{creditOk ? 'Queda a su cuenta' : 'Excede su crédito por'}</strong>
                          <small>
                            {creditOk
                              ? `Después debe ${money(customer.balance + charged)} y le quedan ${money(available - charged)} de crédito.`
                              : 'Pide un abono mayor, cobra de otra forma o sube su límite en Clientes.'}
                          </small>
                        </span>
                        <strong className="money">{money(creditOk ? charged : charged - available)}</strong>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>

        {(error || shortages.length > 0) && (
          <div className="co-error" role="alert">
            <IonIcon icon={alertCircleOutline} aria-hidden="true" />
            {error ? (
              <span><strong>No se cobró.</strong> {error}</span>
            ) : (
              <span>
                <strong>No se puede cobrar: falta inventario.</strong>{' '}
                {shortages
                  .map((s) => `${s.product.name}: en la cuenta ${qtyText(s.qty, s.product.saleType)}, disponibles ${qtyText(s.available, s.product.saleType)} (faltan ${piecesLabel(roundQty(s.qty - s.available), s.product.saleType)}).`)
                  .join(' ')}{' '}
                Ajusta las cantidades en la cuenta; lo demás ya está apartado por pedidos o en otras cuentas.
              </span>
            )}
          </div>
        )}

        <div className="pmodal-foot co-foot">
          <IonButton fill="outline" className="co-back" disabled={busy} onClick={onClose}>
            <IonIcon slot="start" icon={arrowBackOutline} />
            {order ? 'Volver al pedido' : 'Volver a la cuenta'}
          </IonButton>
          <span className="co-foot-end">
            {why && !busy && <span className="co-why">{why}</span>}
            <IonButton className="co-confirm" disabled={!canConfirm || busy} onClick={() => void confirm()}>
              {busy ? <IonSpinner slot="start" name="crescent" /> : <IonIcon slot="start" icon={canConfirm ? checkmarkDone : lockClosedOutline} />}
              {busy
                ? 'Cobrando…'
                : method === 'credito'
                  ? `Cargar ${money(charged)} a su cuenta`
                  : order
                    ? `Entregar y cobrar ${money(ticketTotal)}`
                    : `Cobrar ${money(ticketTotal)}`}
            </IonButton>
          </span>
        </div>
      </form>

      <CustomerPicker
        isOpen={picking}
        selectedId={account.customerId}
        onClose={() => setPicking(false)}
        onPick={(c) => linkCustomer(account.id, c)}
      />
    </PanelModal>
  );
}
