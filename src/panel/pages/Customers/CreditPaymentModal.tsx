import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import { cardOutline, cashOutline, checkmarkCircle, checkmarkDone, closeOutline, personOutline, swapHorizontalOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { money, type CashMethod, type Customer } from '../../../data/models';
import '../Register/CheckoutModal.css';
import './CreditPaymentModal.css';

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

  const left = Math.max(0, balance - amount);
  const over = amount > balance + 0.005;

  return (
    <IonModal isOpen={!!customer} onDidDismiss={onClose} className="pmodal is-abono">
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>Registrar abono</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Cerrar"><IonIcon slot="icon-only" icon={closeOutline} /></IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <form
        className="ab-form"
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
      >
        <div className="pmodal-body ab-body">
          <section className="ab-hero">
            <span className="ab-hero-icon"><IonIcon icon={personOutline} aria-hidden="true" /></span>
            <span className="ab-hero-who">
              <small>Cliente</small>
              <strong>{customer?.name}</strong>
            </span>
            <span className="ab-hero-debt">
              <small>Debe</small>
              <strong className="money">{money(balance)}</strong>
            </span>
          </section>

          <div className="ab-field">
            <label htmlFor="ab-amount" className="ab-label">Monto del abono</label>
            <div className={`co-input ab-input ${over ? 'is-error' : ''}`}>
              <span>$</span>
              <input id="ab-amount" inputMode="decimal" placeholder="0.00" value={amountText} autoFocus aria-invalid={over}
                onChange={(e) => setAmountText(e.target.value.replace(/[^\d.]/g, ''))} />
            </div>
            <div className="co-quick ab-quick">
              <button type="button" onClick={() => setAmountText(String(balance))}>Liquidar todo</button>
              {[50, 100, 200].filter((v) => v < balance).map((v) => (
                <button key={v} type="button" onClick={() => setAmountText(String(v))}>{money(v).replace('.00', '')}</button>
              ))}
            </div>
          </div>

          <div className="ab-field">
            <span className="ab-label" id="ab-method">Forma de pago</span>
            <div className="ab-methods" role="radiogroup" aria-labelledby="ab-method">
              {METHODS.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={method === m.id}
                  className={`co-method ab-method ${method === m.id ? 'is-active' : ''}`} onClick={() => setMethod(m.id)}>
                  {method === m.id && <IonIcon className="co-check" icon={checkmarkCircle} />}
                  <IonIcon icon={m.icon} className="co-method-icon" />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={`ab-result ${amount === 0 ? 'is-idle' : over ? 'is-short' : left < 0.005 ? 'is-done' : 'is-ok'}`} aria-live="polite">
            <span>{over ? 'Es más de lo que debe' : left < 0.005 && amount > 0 ? 'Liquida su cuenta' : 'Queda debiendo'}</span>
            <strong className="money">{over ? money(amount - balance) + ' de más' : money(left)}</strong>
          </div>
        </div>
        <div className="pmodal-foot ab-foot">
          <IonButton fill="outline" className="btn-lg" onClick={onClose}>Cancelar</IonButton>
          <IonButton type="submit" className="btn-lg" disabled={!valid}>
            <IonIcon slot="start" icon={checkmarkDone} />
            Registrar abono{valid ? ` · ${money(amount)}` : ''}
          </IonButton>
        </div>
      </form>
    </IonModal>
  );
}
