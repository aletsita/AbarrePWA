import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar, useIonRouter } from '@ionic/react';
import {
  cardOutline,
  cashOutline,
  checkmarkCircle,
  checkmarkDone,
  closeOutline,
  informationCircleOutline,
  swapHorizontalOutline,
} from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { money, type PaymentMethod } from '../../../data/models';
import './CheckoutModal.css';

const METHODS: { id: PaymentMethod; label: string; icon: string }[] = [
  { id: 'efectivo', label: 'Efectivo', icon: cashOutline },
  { id: 'tarjeta', label: 'Tarjeta', icon: cardOutline },
  { id: 'transferencia', label: 'Transferencia', icon: swapHorizontalOutline },
];

export function CheckoutModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { ticketTotal, ticketCount, confirmSale } = useApp();
  const router = useIonRouter();
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [paidText, setPaidText] = useState('');

  const paid = Number(paidText) || 0;
  const change = paid - ticketTotal;
  const cashOk = method !== 'efectivo' || paid >= ticketTotal;
  const quick = [50, 100, 200, 500, 1000].filter((v) => v > ticketTotal).slice(0, 3);

  // Atajos: 1, 2, 3 eligen el método; Ctrl+Enter confirma
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      const i = ['1', '2', '3'].indexOf(e.key);
      if (i >= 0 && !typing) {
        e.preventDefault();
        setMethod(METHODS[i].id);
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && cashOk) {
        e.preventDefault();
        confirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const reset = () => {
    setPaidText('');
    setMethod('efectivo');
  };

  const confirm = () => {
    confirmSale(method, method === 'efectivo' ? paid : ticketTotal);
    onClose();
    router.push('/panel/venta-completada', 'forward');
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={() => { onClose(); reset(); }} className="pmodal">
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>Cobrar</IonTitle>
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
                onKeyDown={(e) => e.key === 'Enter' && cashOk && confirm()}
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

        {method !== 'efectivo' && (
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
      </div>

      <div className="pmodal-foot">
        <IonButton fill="outline" className="btn-lg" onClick={onClose}>Volver a la cuenta</IonButton>
        <IonButton color="success" className="btn-lg co-confirm" disabled={!cashOk} onClick={confirm}>
          <IonIcon slot="start" icon={checkmarkDone} />
          Confirmar venta
        </IonButton>
      </div>
    </IonModal>
  );
}
