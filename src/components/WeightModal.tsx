import { IonButton, IonIcon } from '@ionic/react';
import { scaleOutline } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { money, type Product } from '../data/models';
import { lineTotal, parseKg, qtyLabel } from '../domain/weight';
import { PanelModal, PanelModalCancel } from './PanelModal';
import './WeightModal.css';

// Captura del peso de un producto que se vende por kilo: se escribe lo que marca la báscula
// y se ve el importe antes de agregarlo
export function WeightModal({
  product,
  initialKg,
  max,
  onConfirm,
  onClose,
}: {
  product: Product | null;
  initialKg?: number;
  // Lo disponible (existencia − apartado − otras cuentas); null = sin tope
  max: number | null;
  onConfirm: (kg: number) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!product) return;
    setText(initialKg ? String(initialKg) : '');
    setTried(false);
  }, [product?.id, initialKg]);

  const kg = parseKg(text);
  const over = kg !== null && max !== null && kg > max;
  const error = !text.trim() ? 'Escribe el peso en kilos.' : kg === null ? 'Usa kilos con hasta 3 decimales, por ejemplo 0.350.' : over ? `Solo hay ${qtyLabel(max, 'peso')} disponibles.` : null;

  const confirm = () => {
    setTried(true);
    if (error || kg === null) return input.current?.focus();
    onConfirm(kg);
  };

  return (
    <PanelModal
      isOpen={!!product}
      onClose={onClose}
      onDidPresent={() => input.current?.select()}
      size="form"
      className="weight-modal"
      title={product?.name ?? ''}
      subtitle={product && <><span className="money">{money(product.price)}</span> por kg</>}
    >
      {product && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <div className="pmodal-body weight">
            <span className="weight-icon">
              <IonIcon icon={scaleOutline} aria-hidden="true" />
            </span>
            <label className="weight-field">
              <span>Peso</span>
              <span className={`weight-input ${tried && error ? 'is-error' : ''}`}>
                <input
                  ref={input}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.000"
                  value={text}
                  aria-invalid={tried && !!error}
                  aria-describedby="weight-msg"
                  onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ''))}
                />
                <b>kg</b>
              </span>
            </label>
            <p id="weight-msg" className={`weight-msg ${tried && error ? 'is-error' : ''}`} role={tried && error ? 'alert' : undefined}>
              {tried && error ? error : kg !== null && !over ? (
                <>
                  {qtyLabel(kg, 'peso')} × {money(product.price)}/kg = <strong className="money">{money(lineTotal(kg, product.price, 'peso'))}</strong>
                </>
              ) : (
                'Escribe lo que marca la báscula.'
              )}
            </p>
          </div>
          <div className="pmodal-foot">
            <PanelModalCancel>Cancelar</PanelModalCancel>
            <IonButton type="submit">{initialKg ? 'Cambiar peso' : 'Agregar'}</IonButton>
          </div>
        </form>
      )}
    </PanelModal>
  );
}
