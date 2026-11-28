import { IonButton, IonIcon } from '@ionic/react';
import { alertCircleOutline, callOutline, cardOutline, cashOutline, checkmarkCircle, checkmarkDone, lockClosedOutline, swapHorizontalOutline } from 'ionicons/icons';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { IsotipoMark } from '../../../components/IsotipoMark';
import { PanelModal, PanelModalCancel } from '../../../components/PanelModal';
import { useApp } from '../../../context/AppContext';
import { initials, money, type CashMethod, type Customer } from '../../../data/models';
import './CreditPaymentModal.css';

const METHODS: { id: CashMethod; label: string; icon: string }[] = [
  { id: 'efectivo', label: 'Efectivo', icon: cashOutline },
  { id: 'tarjeta', label: 'Tarjeta', icon: cardOutline },
  { id: 'transferencia', label: 'Transferencia', icon: swapHorizontalOutline },
];

// Atajos de abono (en pesos); solo se ofrecen los menores a lo que debe
export const CREDIT_PAYMENT_SHORTCUTS = [50, 100, 200];

// Solo números y un punto decimal
const decimalText = (v: string) => {
  const clean = v.replace(/[^\d.]/g, '');
  const dot = clean.indexOf('.');
  return dot < 0 ? clean : clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '');
};

export function CreditPaymentModal({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const { addCreditPayment } = useApp();
  const [method, setMethod] = useState<CashMethod>('efectivo');
  const [amountText, setAmountText] = useState('');
  // El aviso en rojo sale hasta que el campo pierde el foco o se intenta registrar
  const [touched, setTouched] = useState(false);
  const methodRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!customer) return;
    setMethod('efectivo');
    setAmountText('');
    setTouched(false);
  }, [customer?.id]);

  const balance = customer?.balance ?? 0;
  const amount = Number(amountText) || 0;
  const valid = amount > 0 && amount <= balance + 0.005;
  const dirty = amountText !== '' || method !== 'efectivo';

  const confirm = () => {
    setTouched(true);
    if (!customer || !valid) return;
    addCreditPayment(customer.id, amount, method, amount >= balance - 0.005 ? 'Liquidó su cuenta' : 'Abono');
    onClose();
  };

  const left = Math.max(0, balance - amount);
  const over = amount > balance + 0.005;
  const settles = amount > 0 && !over && left < 0.005;
  const error = !touched ? '' : over ? `El abono no puede ser mayor a lo que debe (${money(balance)})` : amount === 0 ? 'Escribe el monto del abono' : '';
  const quick = CREDIT_PAYMENT_SHORTCUTS.filter((v) => v < balance);

  // Forma de pago como grupo de radio: las flechas cambian la selección y mueven el foco
  const onMethodKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
    if (!step) return;
    e.preventDefault();
    const i = (METHODS.findIndex((m) => m.id === method) + step + METHODS.length) % METHODS.length;
    setMethod(METHODS[i].id);
    methodRefs.current[i]?.focus();
  };

  // Resultado: gris sin monto, azul con la cuenta y verde si liquida
  const resultTone = settles ? 'is-done' : valid ? 'is-calc' : 'is-idle';

  return (
    <PanelModal isOpen={!!customer} onClose={onClose} dirty={dirty} discardTitle="¿Descartar este abono?" size="form" title="Registrar abono" className="is-abono">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
      >
        <div className="pmodal-body ab-body">
          <div className="ab-col">
            {/* Quién y cuánto debe: nombre completo arriba (hasta 2 líneas) y el saldo abajo */}
            <section className="ab-hero">
              <IsotipoMark className="ab-hero-mark" />
              <div className="ab-hero-who">
                <span className="ab-avatar" aria-hidden="true">{customer ? initials(customer.name) : ''}</span>
                <span className="ab-hero-name">
                  <strong>{customer?.name}</strong>
                  {customer?.phone && (
                    <small><IonIcon icon={callOutline} aria-hidden="true" />{customer.phone}</small>
                  )}
                </span>
              </div>
              <div className="ab-hero-debt">
                <span>Debe</span>
                <strong>{money(balance)}</strong>
              </div>
            </section>

            <div className={`ab-result ${resultTone}`} aria-live="polite">
              {resultTone === 'is-idle' ? (
                <>
                  <div className="ab-result-total">
                    <span>Queda debiendo</span>
                    <strong>{money(balance)}</strong>
                  </div>
                  <small>Aquí verás cuánto le queda después del abono</small>
                </>
              ) : (
                <>
                  <div className="ab-result-row">
                    <span>Debe</span>
                    <span>{money(balance)}</span>
                  </div>
                  <div className="ab-result-row is-pay">
                    <span>Abono</span>
                    <span>− {money(amount)}</span>
                  </div>
                  <div className="ab-result-total is-split">
                    <span>{settles ? 'Quedará liquidado' : 'Queda debiendo'}</span>
                    <strong>{money(left)}</strong>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="ab-col">
            <div className="ab-field">
              <label htmlFor="ab-amount" className="ab-label">Monto del abono</label>
              <div className={`ab-amount ${error ? 'is-error' : ''} ${amountText ? 'has-value' : ''}`}>
                <span aria-hidden="true">$</span>
                <input
                  id="ab-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  autoComplete="off"
                  value={amountText}
                  autoFocus
                  aria-invalid={!!error}
                  aria-describedby="ab-amount-error"
                  onBlur={() => setTouched(true)}
                  onChange={(e) => setAmountText(decimalText(e.target.value))}
                />
              </div>
              <p className="ab-error" id="ab-amount-error" aria-live="polite">
                {error && <><IonIcon icon={alertCircleOutline} aria-hidden="true" />{error}</>}
              </p>
            </div>

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

            <div className="ab-field">
              <span className="ab-label" id="ab-method">Forma de pago</span>
              <div className="ab-methods" role="radiogroup" aria-labelledby="ab-method" onKeyDown={onMethodKey}>
                {METHODS.map((m, i) => (
                  <button key={m.id} ref={(el) => { methodRefs.current[i] = el; }} type="button" role="radio" aria-checked={method === m.id}
                    tabIndex={method === m.id ? 0 : -1} className={`ab-method ${method === m.id ? 'is-active' : ''}`} onClick={() => setMethod(m.id)}>
                    {method === m.id && <IonIcon className="ab-check" icon={checkmarkCircle} aria-hidden="true" />}
                    <IonIcon icon={m.icon} className="ab-method-icon" aria-hidden="true" />
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="pmodal-foot ab-foot">
          <PanelModalCancel className="ab-cancel">Cancelar</PanelModalCancel>
          <IonButton type="submit" className="ab-submit" disabled={!valid}>
            <IonIcon slot="start" icon={valid ? checkmarkDone : lockClosedOutline} />
            Registrar abono{valid ? ` · ${money(amount)}` : ''}
          </IonButton>
        </div>
      </form>
    </PanelModal>
  );
}
