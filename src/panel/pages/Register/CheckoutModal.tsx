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
import { useEffect, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { availableCredit, initials, money, type PaymentMethod } from '../../../data/models';
import { CustomerPicker } from '../Customers/CustomerPicker';
import './CheckoutModal.css';

const METHODS: { id: PaymentMethod; label: string; icon: string }[] = [
  { id: 'efectivo', label: 'Efectivo', icon: cashOutline },
  { id: 'tarjeta', label: 'Tarjeta', icon: cardOutline },
  { id: 'transferencia', label: 'Transferencia', icon: swapHorizontalOutline },
  { id: 'credito', label: 'A crédito', icon: bookOutline },
];

export function CheckoutModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { ticketTotal, ticketCount, confirmSale, account, customers, linkCustomer } = useApp();
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

  const canConfirm = method === 'efectivo' ? paid >= ticketTotal : method === 'credito' ? creditOk : true;

  // Atajos: 1 a 4 eligen el método; Ctrl+Enter confirma
  useEffect(() => {
    if (!isOpen || picking) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0 && !typing) {
        e.preventDefault();
        setMethod(METHODS[i].id);
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canConfirm) {
        e.preventDefault();
        confirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const reset = () => {
    setPaidText('');
    setUpfrontText('');
    setMethod('efectivo');
  };

  const confirm = () => {
    if (!canConfirm) return;
    confirmSale(method, method === 'efectivo' ? paid : method === 'credito' ? upfront : ticketTotal);
    onClose();
    router.push('/panel/venta-completada', 'forward');
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={() => { onClose(); reset(); }} className="pmodal">
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>Cobrar · {account.name}</IonTitle>
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

        <div className="co-methods" role="radiogroup" aria-label="Método de pago">
          {METHODS.map((m, i) => (
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
              <kbd aria-hidden="true">{i + 1}</kbd>
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
        <IonButton fill="outline" className="btn-lg" onClick={onClose}>Volver a la cuenta</IonButton>
        <IonButton color="success" className="btn-lg co-confirm" disabled={!canConfirm} onClick={confirm}>
          <IonIcon slot="start" icon={checkmarkDone} />
          {method === 'credito' ? 'Cargar a su cuenta' : 'Confirmar venta'}
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
