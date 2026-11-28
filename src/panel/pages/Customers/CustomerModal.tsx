import { IonButton, IonIcon } from '@ionic/react';
import { callOutline, informationCircleOutline, lockClosedOutline, personOutline, saveOutline, walletOutline } from 'ionicons/icons';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { AreaField, FormSection, MoneyField, TextField } from '../../../components/Form';
import { useApp } from '../../../context/AppContext';
import { money, type Customer } from '../../../data/models';
import { PanelModal, PanelModalCancel } from '../../../components/PanelModal';
import './CustomerModal.css';

// Atajos del límite de crédito (en pesos)
export const CREDIT_LIMIT_SHORTCUTS = [200, 500, 1000, 2000];

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
  const dirty =
    name !== (customer?.name ?? '') ||
    phone !== (customer?.phone ?? '') ||
    limit !== (customer ? String(customer.creditLimit) : '500') ||
    note !== (customer?.note ?? '');

  const save = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    const saved = saveCustomer({ id: customer?.id, name: name.trim(), phone: phone.trim(), creditLimit, note: note.trim() });
    onSaved?.(saved);
    onClose();
  };

  // Enter en un campo de una línea guarda (en Notas sigue siendo salto de línea)
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || (e.target as HTMLElement).tagName !== 'INPUT') return;
    e.preventDefault();
    save();
  };

  // Franja de disponibilidad: lo que podrá deber (nuevo) o lo que le quedaría (al editar)
  const avail = customer
    ? {
        tone: below ? 'is-bad' : creditLimit > 0 ? 'is-ok' : 'is-none',
        title: creditLimit > 0 || below ? 'Le quedarían disponibles' : 'Sin crédito: solo podrá pagar de contado',
        text: below ? 'No podrá comprar a crédito hasta que abone lo suficiente para quedar debajo del límite.' : `Hoy debe ${money(customer.balance)}`,
        amount: Math.max(0, creditLimit - customer.balance),
      }
    : creditLimit > 0
      ? { tone: 'is-ok', title: 'Podrá deber hasta', text: 'Disponible desde su primera compra', amount: creditLimit }
      : { tone: 'is-none', title: 'Sin crédito: solo podrá pagar de contado', text: 'Puedes darle un límite cuando quieras', amount: 0 };

  return (
    <PanelModal
      isOpen={isOpen}
      onClose={onClose}
      dirty={dirty}
      discardTitle={customer ? '¿Descartar cambios?' : '¿Descartar este cliente?'}
      size="form"
      mobile="full"
      className="cf-modal"
      title={customer ? 'Editar cliente' : 'Nuevo cliente'}
      subtitle="Para fiarle y llevar sus abonos"
    >
      <form className="pmodal-body cf-body" onSubmit={save} onKeyDown={onKeyDown}>
        <FormSection title="Datos del cliente" text="Lo básico para reconocerlo" icon={personOutline}>
          <TextField label="Nombre" icon={personOutline} placeholder="Ej. Guadalupe Torres" value={name} onChange={setName}
            autoCapitalize="words" autoComplete="off" autoFocus />
          <TextField label="Teléfono" optional icon={callOutline} type="tel" inputMode="tel" autoComplete="off" placeholder="55 1234 5678" value={phone} onChange={setPhone} />
          <AreaField className="cf-notes" label="Notas" optional rows={3} placeholder="Ej. Paga los viernes" value={note} onChange={setNote} />
        </FormSection>

        <FormSection title="Crédito" text="Lo máximo que puede deber" icon={walletOutline}>
          <MoneyField className="cf-limit" label="Límite de crédito" suffix="MXN" autoComplete="off" value={limit} onChange={setLimit}
            error={below && 'Es menor que lo que ya debe'} />
          <div className="cf-quick" role="group" aria-label="Límites rápidos">
            {CREDIT_LIMIT_SHORTCUTS.map((v) => {
              const on = limit !== '' && creditLimit === v;
              return (
                <button key={v} type="button" className={on ? 'is-active' : ''} aria-pressed={on} onClick={() => setLimit(String(v))}>
                  {money(v).replace('.00', '')}
                </button>
              );
            })}
          </div>
          <div className={`cf-avail ${avail.tone}`} aria-live="polite">
            <span>
              <strong>{avail.title}</strong>
              <small>{avail.text}</small>
            </span>
            <strong className="money">{money(avail.amount)}</strong>
          </div>
          <p className="cf-info">
            <IonIcon icon={informationCircleOutline} aria-hidden="true" />
            Cada compra a crédito descuenta de aquí y cada abono lo libera.
          </p>
        </FormSection>
      </form>
      <div className="pmodal-foot cf-foot">
        {!valid && <span className="cf-why">Escribe el nombre para guardar</span>}
        <PanelModalCancel className="cf-cancel">Cancelar</PanelModalCancel>
        <IonButton className="cf-save" disabled={!valid} onClick={() => save()}>
          <IonIcon slot="start" icon={valid ? saveOutline : lockClosedOutline} />
          Guardar cliente
        </IonButton>
      </div>
    </PanelModal>
  );
}
