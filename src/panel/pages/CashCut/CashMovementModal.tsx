import { IonButton, IonButtons, IonHeader, IonIcon, IonInput, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import { closeOutline, saveOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import type { CashMovementType } from '../../../data/models';

const TYPES: { id: CashMovementType; label: string; hint: string }[] = [
  { id: 'entrada', label: 'Entrada', hint: 'Cambio o dinero que se mete al cajón' },
  { id: 'retiro', label: 'Retiro', hint: 'Pago a proveedor o dinero que se saca' },
  { id: 'gasto', label: 'Gasto', hint: 'Compras menores de la tienda' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (type: CashMovementType, amount: number, note: string) => void;
}

export function CashMovementModal({ isOpen, onClose, onSave }: Props) {
  const [type, setType] = useState<CashMovementType>('gasto');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setType('gasto');
    setAmount('');
    setNote('');
  }, [isOpen]);

  const valid = Number(amount) > 0 && note.trim().length > 1;

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="pmodal">
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>Movimiento de efectivo</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Cerrar"><IonIcon slot="icon-only" icon={closeOutline} /></IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <div className="pmodal-body cm-form">
        <div className="cm-types" role="radiogroup" aria-label="Tipo">
          {TYPES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={type === t.id} className={`cm-type t-${t.id} ${type === t.id ? 'is-active' : ''}`} onClick={() => setType(t.id)}>
              <strong>{t.label}</strong>
              <span>{t.hint}</span>
            </button>
          ))}
        </div>
        <IonInput className="field" fill="outline" label="Monto" labelPlacement="stacked" inputmode="decimal" value={amount}
          onIonInput={(e) => setAmount((e.detail.value ?? '').replace(/[^\d.]/g, ''))}>
          <span slot="start" className="muted">$</span>
        </IonInput>
        <IonInput className="field" fill="outline" label="Concepto" labelPlacement="stacked" placeholder="Ej. Pago de hielo" value={note}
          onIonInput={(e) => setNote(e.detail.value ?? '')} />
      </div>
      <div className="pmodal-foot">
        <IonButton fill="outline" className="btn-lg" onClick={onClose}>Cancelar</IonButton>
        <IonButton
          className="btn-lg"
          disabled={!valid}
          onClick={() => {
            onSave(type, Number(amount), note.trim());
            onClose();
          }}
        >
          <IonIcon slot="start" icon={saveOutline} />
          Registrar
        </IonButton>
      </div>
    </IonModal>
  );
}
