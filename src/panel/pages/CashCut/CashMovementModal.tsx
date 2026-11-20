import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import { arrowDownCircleOutline, arrowUpCircleOutline, basketOutline, checkmarkCircle, closeOutline, saveOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { MoneyField, TextField } from '../../../components/Form';
import type { CashMovementType } from '../../../data/models';

const TYPES: { id: CashMovementType; label: string; hint: string; icon: string; example: string }[] = [
  { id: 'entrada', label: 'Entrada', hint: 'Dinero que se mete al cajón', icon: arrowDownCircleOutline, example: 'Ej. Cambio adicional' },
  { id: 'retiro', label: 'Retiro', hint: 'Dinero que se saca del cajón', icon: arrowUpCircleOutline, example: 'Ej. Pago al proveedor' },
  { id: 'gasto', label: 'Gasto', hint: 'Compras menores de la tienda', icon: basketOutline, example: 'Ej. Bolsa de hielo' },
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

  const save = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    onSave(type, Number(amount), note.trim());
    onClose();
  };

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
      <form className="pmodal-body form-stack" onSubmit={save}>
        <div className="fld">
          <span className="fld-label">¿Qué tipo de movimiento es?</span>
          <div className="cm-types" role="radiogroup" aria-label="Tipo de movimiento">
            {TYPES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={type === t.id}
                className={`cm-type t-${t.id} ${type === t.id ? 'is-active' : ''}`} onClick={() => setType(t.id)}>
                {type === t.id && <IonIcon className="cm-type-check" icon={checkmarkCircle} />}
                <IonIcon className="cm-type-icon" icon={t.icon} />
                <strong>{t.label}</strong>
                <span>{t.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <MoneyField label="Monto" value={amount} onChange={setAmount} autoFocus />
          <TextField label="Concepto" placeholder={TYPES.find((t) => t.id === type)!.example} value={note} onChange={setNote} />
        </div>
      </form>
      <div className="pmodal-foot">
        <IonButton fill="outline" className="btn-lg" onClick={onClose}>Cancelar</IonButton>
        <IonButton className="btn-lg" disabled={!valid} onClick={() => save()}>
          <IonIcon slot="start" icon={saveOutline} />
          Registrar
        </IonButton>
      </div>
    </IonModal>
  );
}
