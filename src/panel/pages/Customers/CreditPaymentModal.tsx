import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import { cardOutline, cashOutline, checkmarkCircle, checkmarkDone, closeOutline, swapHorizontalOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { money, type CashMethod, type Customer } from '../../../data/models';
import '../Register/CheckoutModal.css';

const METHODS: { id: CashMethod; label: string; icon: string }[] = [
  { id: 'efectivo', label: 'Efectivo', icon: cashOutline },
  { id: 'tarjeta', label: 'Tarjeta', icon: cardOutline },
  { id: 'transferencia', label: 'Transferencia', icon: swapHorizontalOutline },
];

export function CreditPaymentModal({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const { addCreditPayment } = useApp();
  const [method, setMethod] = useState<CashMethod>('efectivo');
  const [amountText, setAmountText] = useState('');

  useEffect(() => {
    if (!customer) return;
    setMethod('efectivo');
    setAmountText('');
  }, [customer?.id]);

  const balance = customer?.balance ?? 0;
  const amount = Number(amountText) || 0;
  const valid = amount > 0 && amount <= balance + 0.005;

  const confirm = () => {
    if (!customer || !valid) return;
    addCreditPayment(customer.id, amount, method, amount >= balance - 0.005 ? 'Liquidó su cuenta' : 'Abono');
    onClose();
  };

  return (
    <IonModal isOpen={!!customer} onDidDismiss={onClose} className="pmodal">
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>Registrar abono</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Cerrar"><IonIcon slot="icon-only" icon={closeOutline} /></IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <div className="pmodal-body">
        <section className="co-total">
          <span>{customer?.name} debe</span>
          <strong className="money">{money(balance)}</strong>
        </section>

        <div className="co-methods" role="radiogroup" aria-label="Forma de pago">
          {METHODS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={method === m.id}
              className={`co-method ${method === m.id ? 'is-active' : ''}`} onClick={() => setMethod(m.id)}>
              {method === m.id && <IonIcon className="co-check" icon={checkmarkCircle} />}
              <IonIcon icon={m.icon} className="co-method-icon" />
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        <section className="co-cash">
          <label htmlFor="ab-amount">Abona</label>
          <div className="co-input">
            <span>$</span>
            <input id="ab-amount" inputMode="decimal" placeholder="0.00" value={amountText} autoFocus
              onChange={(e) => setAmountText(e.target.value.replace(/[^\d.]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && confirm()} />
          </div>
          <div className="co-quick">
            <button type="button" onClick={() => setAmountText(String(balance))}>Liquidar todo</button>
            {[50, 100, 200].filter((v) => v < balance).map((v) => (
              <button key={v} type="button" onClick={() => setAmountText(String(v))}>{money(v).replace('.00', '')}</button>
            ))}
          </div>
          <div className={`co-change ${amount === 0 ? 'is-idle' : valid ? 'is-ok' : 'is-short'}`} aria-live="polite">
            <span>{amount > balance + 0.005 ? 'Es más de lo que debe' : 'Queda debiendo'}</span>
            <strong className="money">{money(Math.max(0, balance - amount))}</strong>
          </div>
        </section>
      </div>
      <div className="pmodal-foot">
        <IonButton fill="outline" className="btn-lg" onClick={onClose}>Cancelar</IonButton>
        <IonButton color="success" className="btn-lg" disabled={!valid} onClick={confirm}>
          <IonIcon slot="start" icon={checkmarkDone} />
          Registrar abono
        </IonButton>
      </div>
    </IonModal>
  );
}
