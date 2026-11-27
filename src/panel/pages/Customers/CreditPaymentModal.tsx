import { IonButton, IonIcon } from '@ionic/react';
import { cardOutline, cashOutline, checkmarkCircle, checkmarkDone, swapHorizontalOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { PanelModal } from '../../../components/PanelModal';
import { useApp } from '../../../context/AppContext';
import { initials, money, type CashMethod, type Customer } from '../../../data/models';
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
  // El aviso de «escribe el monto» sale hasta que el campo pierde el foco o se intenta registrar
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setMethod('efectivo');
    setAmountText('');
    setTouched(false);
  }, [customer?.id]);

  const balance = customer?.balance ?? 0;
  const amount = Number(amountText) || 0;
  const valid = amount > 0 && amount <= balance + 0.005;

  const confirm = () => {
    setTouched(true);
    if (!customer || !valid) return;
    addCreditPayment(customer.id, amount, method, amount >= balance - 0.005 ? 'Liquidó su cuenta' : 'Abono');
    onClose();
  };

  const left = Math.max(0, balance - amount);
  const over = amount > balance + 0.005;
  const settles = amount > 0 && !over && left < 0.005;
  const error = over
    ? `Es más de lo que debe (${money(balance)})`
    : amountText.trim() && amount === 0
      ? 'El abono tiene que ser mayor a $0'
      : touched && !amountText.trim()
        ? 'Escribe el monto del abono'
        : '';
  const quick = [50, 100, 200].filter((v) => v < balance);

  return (
    <PanelModal isOpen={!!customer} onClose={onClose} size="form" title="Registrar abono" className="is-abono">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
      >
        <div className="pmodal-body ab-body">
          {/* Quién y cuánto debe: nombre completo arriba (hasta 2 líneas) y el saldo abajo */}
          <section className="ab-hero">
            <div className="ab-hero-who">
              <span className="ab-avatar" aria-hidden="true">{customer ? initials(customer.name) : ''}</span>
              <strong>{customer?.name}</strong>
            </div>
            <div className="ab-hero-debt">
              <span>Debe</span>
              <strong>{money(balance)}</strong>
            </div>
          </section>

          <div className="ab-field">
            <label htmlFor="ab-amount" className="ab-label">Monto del abono</label>
            <div className={`ab-amount ${error ? 'is-error' : ''}`}>
              <span aria-hidden="true">$</span>
              <input
                id="ab-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amountText}
                autoFocus
                aria-invalid={!!error}
                aria-describedby={error ? 'ab-amount-error' : undefined}
                onBlur={() => setTouched(true)}
                onChange={(e) => setAmountText(e.target.value.replace(/[^\d.]/g, ''))}
              />
            </div>
            {error && <p className="ab-error" id="ab-amount-error" role="alert">{error}</p>}
            <div className="ab-quick" role="group" aria-label="Montos rápidos">
              <button type="button" className={settles ? 'is-active' : ''} aria-pressed={settles} onClick={() => setAmountText(String(balance))}>
                Liquidar todo
              </button>
              {quick.map((v) => (
                <button key={v} type="button" className={amount === v ? 'is-active' : ''} aria-pressed={amount === v} onClick={() => setAmountText(String(v))}>
                  {money(v).replace('.00', '')}
                </button>
              ))}
            </div>
          </div>

          <div className="ab-field">
            <span className="ab-label" id="ab-method">Forma de pago</span>
            <div className="ab-methods" role="radiogroup" aria-labelledby="ab-method">
              {METHODS.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={method === m.id}
                  className={`ab-method ${method === m.id ? 'is-active' : ''}`} onClick={() => setMethod(m.id)}>
                  {method === m.id && <IonIcon className="ab-check" icon={checkmarkCircle} aria-hidden="true" />}
                  <IonIcon icon={m.icon} className="ab-method-icon" aria-hidden="true" />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={`ab-result ${settles ? 'is-done' : ''}`} aria-live="polite">
            {settles ? (
              <span>Quedará liquidado</span>
            ) : (
              <>
                <span>Queda debiendo</span>
                <strong>{money(over ? balance : left)}</strong>
              </>
            )}
          </div>
        </div>
        <div className="pmodal-foot ab-foot">
          <IonButton fill="outline" onClick={onClose}>Cancelar</IonButton>
          <IonButton type="submit" className="ab-submit" disabled={!valid}>
            <IonIcon slot="start" icon={checkmarkDone} />
            Registrar abono{valid ? ` · ${money(amount)}` : ''}
          </IonButton>
        </div>
      </form>
    </PanelModal>
  );
}
