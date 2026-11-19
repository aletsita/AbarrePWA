import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonSearchbar, IonTitle, IonToolbar } from '@ionic/react';
import { checkmarkCircle, closeOutline, personAddOutline, personRemoveOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { availableCredit, initials, money, normalize, type Customer } from '../../../data/models';
import { CustomerModal } from './CustomerModal';
import './Customers.css';

interface Props {
  isOpen: boolean;
  selectedId: string | null;
  onClose: () => void;
  onPick: (c: Customer | null) => void;
}

// Lista para vincular un cliente a la cuenta que se está cobrando
export function CustomerPicker({ isOpen, selectedId, onClose, onPick }: Props) {
  const { customers } = useApp();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const q = normalize(query);
  const list = customers
    .filter((c) => !q || normalize(c.name).includes(q) || c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')))
    .sort((a, b) => a.name.localeCompare(b.name));

  const pick = (c: Customer | null) => {
    onPick(c);
    onClose();
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="pmodal">
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>Cliente de la cuenta</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Cerrar"><IonIcon slot="icon-only" icon={closeOutline} /></IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <div className="pmodal-body cp-body">
        <div className="cp-search">
          <IonSearchbar placeholder="Buscar por nombre o teléfono" value={query} onIonInput={(e) => setQuery(e.detail.value ?? '')} />
          <IonButton fill="outline" onClick={() => setAdding(true)}>
            <IonIcon slot="start" icon={personAddOutline} />
            Nuevo
          </IonButton>
        </div>
        <ul className="cp-list">
          {selectedId && (
            <li>
              <button type="button" className="cp-item is-quiet" onClick={() => pick(null)}>
                <span className="cu-avatar"><IonIcon icon={personRemoveOutline} /></span>
                <span className="cp-text"><strong>Quitar cliente</strong><small>La cuenta queda sin cliente</small></span>
              </button>
            </li>
          )}
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" className={`cp-item ${c.id === selectedId ? 'is-active' : ''}`} onClick={() => pick(c)}>
                <span className="cu-avatar">{initials(c.name)}</span>
                <span className="cp-text">
                  <strong>{c.name}</strong>
                  <small>{c.phone || 'Sin teléfono'}</small>
                </span>
                <span className="cp-credit">
                  <strong className="money">{money(availableCredit(c))}</strong>
                  <small>{c.balance > 0 ? `debe ${money(c.balance)}` : 'disponible'}</small>
                </span>
                {c.id === selectedId && <IonIcon className="cp-check" icon={checkmarkCircle} />}
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="cp-empty muted">{customers.length ? 'Nadie coincide con la búsqueda.' : 'Aún no hay clientes.'}</li>}
        </ul>
      </div>
      <CustomerModal isOpen={adding} onClose={() => setAdding(false)} onSaved={(c) => pick(c)} />
    </IonModal>
  );
}
