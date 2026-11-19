import { IonButton, IonButtons, IonHeader, IonIcon, IonInput, IonModal, IonTextarea, IonTitle, IonToolbar } from '@ionic/react';
import { closeOutline, saveOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { money, type Customer } from '../../../data/models';

interface Props {
  isOpen: boolean;
  customer?: Customer;
  onClose: () => void;
  onSaved?: (c: Customer) => void;
}

export function CustomerModal({ isOpen, customer, onClose, onSaved }: Props) {
  const { saveCustomer } = useApp();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [limit, setLimit] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName(customer?.name ?? '');
    setPhone(customer?.phone ?? '');
    setLimit(customer ? String(customer.creditLimit) : '500');
    setNote(customer?.note ?? '');
  }, [isOpen, customer]);

  const creditLimit = Number(limit) || 0;
  const valid = name.trim().length > 1;
  const below = customer && creditLimit < customer.balance;

  const save = () => {
    const saved = saveCustomer({ id: customer?.id, name: name.trim(), phone: phone.trim(), creditLimit, note: note.trim() });
    onSaved?.(saved);
    onClose();
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="pmodal">
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>{customer ? 'Editar cliente' : 'Nuevo cliente'}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Cerrar"><IonIcon slot="icon-only" icon={closeOutline} /></IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <div className="pmodal-body cu-form">
        <IonInput className="field" fill="outline" label="Nombre" labelPlacement="stacked" placeholder="Ej. Guadalupe Torres" value={name} autofocus
          onIonInput={(e) => setName(e.detail.value ?? '')} />
        <IonInput className="field" fill="outline" label="Teléfono (opcional)" labelPlacement="stacked" inputmode="tel" value={phone}
          onIonInput={(e) => setPhone(e.detail.value ?? '')} />
        <IonInput className="field" fill="outline" label="Límite de crédito" labelPlacement="stacked" inputmode="decimal" value={limit}
          helperText="Lo máximo que puede deber. Cada compra a crédito descuenta de aquí y cada abono lo libera."
          onIonInput={(e) => setLimit((e.detail.value ?? '').replace(/[^\d.]/g, ''))}>
          <span slot="start" className="muted">$</span>
        </IonInput>
        {customer && (
          <p className={`cu-limit-note ${below ? 'is-bad' : ''}`}>
            Debe {money(customer.balance)} · le quedarían {money(Math.max(0, creditLimit - customer.balance))} disponibles
            {below && '. El límite es menor que lo que ya debe: no podrá comprar a crédito hasta que abone.'}
          </p>
        )}
        <IonTextarea className="field" fill="outline" label="Notas (opcional)" labelPlacement="stacked" autoGrow rows={2} value={note}
          placeholder="Ej. Paga los viernes" onIonInput={(e) => setNote(e.detail.value ?? '')} />
      </div>
      <div className="pmodal-foot">
        <IonButton fill="outline" className="btn-lg" onClick={onClose}>Cancelar</IonButton>
        <IonButton className="btn-lg" disabled={!valid} onClick={save}>
          <IonIcon slot="start" icon={saveOutline} />
          Guardar cliente
        </IonButton>
      </div>
    </IonModal>
  );
}
