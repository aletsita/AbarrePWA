import { IonButton, IonIcon } from '@ionic/react';
import { callOutline, personOutline, saveOutline, walletOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { AreaField, FormSection, MoneyField, TextField } from '../../../components/Form';
import { useApp } from '../../../context/AppContext';
import { money, type Customer } from '../../../data/models';
import { PanelModal } from '../../../components/PanelModal';

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

  const save = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    const saved = saveCustomer({ id: customer?.id, name: name.trim(), phone: phone.trim(), creditLimit, note: note.trim() });
    onSaved?.(saved);
    onClose();
  };

  return (
    <PanelModal isOpen={isOpen} onClose={onClose} size="form" title={customer ? 'Editar cliente' : 'Nuevo cliente'}>
      <form className="pmodal-body" onSubmit={save}>
        <FormSection title="Datos del cliente" icon={personOutline}>
          <TextField className="is-wide" label="Nombre" icon={personOutline} placeholder="Ej. Guadalupe Torres" value={name} onChange={setName}
            autoCapitalize="words" autoFocus />
          <TextField className="is-wide" label="Teléfono" optional icon={callOutline} inputMode="tel" placeholder="55 1234 5678" value={phone} onChange={setPhone} />
          <AreaField className="is-wide" label="Notas" optional rows={2} placeholder="Ej. Paga los viernes" value={note} onChange={setNote} />
        </FormSection>

        <FormSection title="Crédito" icon={walletOutline} text="Lo máximo que puede deber. Cada compra a crédito descuenta de aquí y cada abono lo libera.">
          <MoneyField label="Límite de crédito" value={limit} onChange={setLimit} error={below && 'Es menor que lo que ya debe'} />
          {customer ? (
            <div className="fld">
              <span className="fld-label">Le quedarían disponibles</span>
              <strong className={`cu-avail money ${below ? 'is-bad' : ''}`}>{money(Math.max(0, creditLimit - customer.balance))}</strong>
              <span className="fld-hint">Hoy debe {money(customer.balance)}</span>
            </div>
          ) : (
            <div className="fld">
              <span className="fld-label">Para empezar</span>
              <strong className="cu-avail money">{money(creditLimit)}</strong>
              <span className="fld-hint">Disponible desde su primera compra</span>
            </div>
          )}
          {below && <p className="form-note is-bad">No podrá comprar a crédito hasta que abone lo suficiente para quedar debajo del límite.</p>}
        </FormSection>
      </form>
      <div className="pmodal-foot">
        <IonButton fill="outline" className="btn-lg" onClick={onClose}>Cancelar</IonButton>
        <IonButton className="btn-lg" disabled={!valid} onClick={() => save()}>
          <IonIcon slot="start" icon={saveOutline} />
          Guardar cliente
        </IonButton>
      </div>
    </PanelModal>
  );
}
