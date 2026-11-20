import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import { checkmarkOutline, closeOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { MoneyField, TextField } from '../../components/Form';

interface Props {
  isOpen: boolean;
  title: string;
  text?: string;
  label: string;
  hint?: string;
  initial: string;
  money?: boolean;
  confirmText: string;
  onClose: () => void;
  onSave: (value: string) => void;
}

// Formulario de un solo dato (nombre de la cuenta, fondo del turno…)
export function PromptModal({ isOpen, title, text, label, hint, initial, money, confirmText, onClose, onSave }: Props) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    if (isOpen) setValue(initial);
  }, [isOpen, initial]);

  const valid = value.trim().length > 0;
  const save = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    onSave(value.trim());
    onClose();
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="pmodal is-narrow">
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>{title}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Cerrar"><IonIcon slot="icon-only" icon={closeOutline} /></IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <form className="pmodal-body" onSubmit={save}>
        {text && <p className="form-intro">{text}</p>}
        {money ? (
          <MoneyField label={label} hint={hint} value={value} onChange={setValue} autoFocus />
        ) : (
          <TextField label={label} hint={hint} value={value} onChange={setValue} maxLength={40} autoFocus />
        )}
      </form>
      <div className="pmodal-foot">
        <IonButton fill="outline" className="btn-lg" onClick={onClose}>Cancelar</IonButton>
        <IonButton className="btn-lg" disabled={!valid} onClick={() => save()}>
          <IonIcon slot="start" icon={checkmarkOutline} />
          {confirmText}
        </IonButton>
      </div>
    </IonModal>
  );
}
