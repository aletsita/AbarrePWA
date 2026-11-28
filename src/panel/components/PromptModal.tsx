import { IonButton, IonIcon } from '@ionic/react';
import { checkmarkOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { MoneyField, TextField } from '../../components/Form';
import { PanelModal, PanelModalCancel } from '../../components/PanelModal';

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
  const dirty = value !== initial;
  const save = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    onSave(value.trim());
    onClose();
  };

  return (
    <PanelModal isOpen={isOpen} onClose={onClose} dirty={dirty} size="form" title={title}>
      <form className="pmodal-body" onSubmit={save}>
        {text && <p className="form-intro">{text}</p>}
        {money ? (
          <MoneyField label={label} hint={hint} value={value} onChange={setValue} autoFocus />
        ) : (
          <TextField label={label} hint={hint} value={value} onChange={setValue} maxLength={40} autoFocus />
        )}
      </form>
      <div className="pmodal-foot">
        <PanelModalCancel className="btn-lg">Cancelar</PanelModalCancel>
        <IonButton className="btn-lg" disabled={!valid} onClick={() => save()}>
          <IonIcon slot="start" icon={checkmarkOutline} />
          {confirmText}
        </IonButton>
      </div>
    </PanelModal>
  );
}
