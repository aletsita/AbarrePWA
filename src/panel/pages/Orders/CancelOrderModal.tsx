import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import { alertCircleOutline, chatbubbleEllipsesOutline, closeOutline, cubeOutline, notificationsOutline, trashOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { AreaField } from '../../../components/Form';
import type { PickupOrder } from '../../../data/pickup';

type Choice = 'agotado' | 'cancelar';

interface Props {
  order?: PickupOrder;
  // Productos que hoy no alcanzan: se marcan solos como agotados
  shortages: string[];
  onClose: () => void;
  // Se agotó algo: el pedido NO se cancela, el cliente cambia ese producto por otro, lo quita o cancela
  onShortage: (missing: string[]) => void;
  onCancel: (note: string) => void;
}

// Problema con un pedido que aún no se entrega: avisar que se agotó un producto o cancelarlo por otro motivo
export function CancelOrderModal({ order, shortages, onClose, onShortage, onCancel }: Props) {
  const [choice, setChoice] = useState<Choice>('agotado');
  const [missing, setMissing] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!order) return;
    setChoice(order.issue ? 'cancelar' : 'agotado');
    setMissing(order.issue?.missing ?? shortages);
    setNote('');
    setTried(false);
  }, [order?.id]);

  const toggle = (id: string) => setMissing((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const missingError = tried && choice === 'agotado' && missing.length === 0;
  const noteError = tried && choice === 'cancelar' && !note.trim();

  const confirm = () => {
    setTried(true);
    if (choice === 'agotado') {
      if (missing.length) onShortage(missing);
    } else if (note.trim()) onCancel(note);
  };

  return (
    <IonModal isOpen={!!order} onDidDismiss={onClose} className="pmodal">
      {order && (
        <>
          <IonHeader className="ion-no-border">
            <IonToolbar>
              <IonTitle>Problema con {order.folio}</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={onClose} aria-label="Cerrar">
                  <IonIcon slot="icon-only" icon={closeOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <div className="pmodal-body">
            <p className="oc-lead">
              Pedido de <strong>{order.customer.name}</strong>. Le avisaremos en su app.
            </p>

            <div className="oc-reasons" role="radiogroup" aria-label="Qué pasó">
              <button type="button" role="radio" aria-checked={choice === 'agotado'} className={`oc-reason is-warn ${choice === 'agotado' ? 'is-active' : ''}`} onClick={() => setChoice('agotado')}>
                <IonIcon icon={cubeOutline} />
                <span>
                  <strong>Se agotó un producto</strong>
                  <small>El pedido sigue. El cliente elige otro producto o lo quita</small>
                </span>
              </button>
              <button type="button" role="radio" aria-checked={choice === 'cancelar'} className={`oc-reason ${choice === 'cancelar' ? 'is-active' : ''}`} onClick={() => setChoice('cancelar')}>
                <IonIcon icon={chatbubbleEllipsesOutline} />
                <span>
                  <strong>Cancelar el pedido</strong>
                  <small>Por otro motivo. Las piezas apartadas vuelven al inventario</small>
                </span>
              </button>
            </div>

            {choice === 'agotado' ? (
              <fieldset className="oc-items">
                <legend>¿Qué se agotó?</legend>
                {order.items.map((i) => (
                  <label key={i.productId} className={missing.includes(i.productId) ? 'is-on' : ''}>
                    <input type="checkbox" checked={missing.includes(i.productId)} onChange={() => toggle(i.productId)} />
                    <span><strong>{i.qty}</strong> {i.name}</span>
                    {shortages.includes(i.productId) && <em>No alcanza</em>}
                  </label>
                ))}
                {missingError && (
                  <p className="oc-error"><IonIcon icon={alertCircleOutline} />Marca al menos un producto agotado.</p>
                )}
              </fieldset>
            ) : (
              <AreaField
                label="Motivo para el cliente"
                placeholder="Ej. Hoy cerramos temprano por inventario."
                maxLength={200}
                value={note}
                onChange={setNote}
                error={noteError && 'Escribe el motivo.'}
              />
            )}
          </div>
          <div className="pmodal-foot">
            <IonButton fill="clear" className="btn-lg" onClick={onClose}>
              Volver
            </IonButton>
            {choice === 'agotado' ? (
              <IonButton color="warning" className="btn-lg" onClick={confirm}>
                <IonIcon slot="start" icon={notificationsOutline} />
                {order.issue ? 'Actualizar aviso' : 'Avisar al cliente'}
              </IonButton>
            ) : (
              <IonButton color="danger" className="btn-lg" onClick={confirm}>
                <IonIcon slot="start" icon={trashOutline} />
                Cancelar pedido
              </IonButton>
            )}
          </div>
        </>
      )}
    </IonModal>
  );
}
