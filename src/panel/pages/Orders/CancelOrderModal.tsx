import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import { alertCircleOutline, closeOutline, cubeOutline, chatbubbleEllipsesOutline, trashOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { AreaField } from '../../../components/Form';
import { CANCEL_REASON_LABEL, type CancelReason, type PickupOrder } from '../../../data/pickup';

interface Props {
  order?: PickupOrder;
  // Productos que hoy no alcanzan: se marcan solos como agotados
  shortages: string[];
  onClose: () => void;
  onConfirm: (reason: CancelReason, missing: string[], note: string) => void;
}

// Cancelar un pedido que aún no se entrega. Si es por falta de existencia, se marcan los productos
// agotados: el cliente los ve en su app y puede quitar el pedido o elegir otros productos.
export function CancelOrderModal({ order, shortages, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState<CancelReason>('sin-existencia');
  const [missing, setMissing] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!order) return;
    setReason('sin-existencia');
    setMissing(shortages);
    setNote('');
    setTried(false);
  }, [order?.id]);

  const toggle = (id: string) => setMissing((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const missingError = tried && reason === 'sin-existencia' && missing.length === 0;
  const noteError = tried && reason === 'otro' && !note.trim();

  const confirm = () => {
    setTried(true);
    if (reason === 'sin-existencia' ? missing.length === 0 : !note.trim()) return;
    onConfirm(reason, reason === 'sin-existencia' ? missing : [], note);
  };

  return (
    <IonModal isOpen={!!order} onDidDismiss={onClose} className="pmodal">
      {order && (
        <>
          <IonHeader className="ion-no-border">
            <IonToolbar>
              <IonTitle>Cancelar {order.folio}</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={onClose} aria-label="Cerrar">
                  <IonIcon slot="icon-only" icon={closeOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <div className="pmodal-body">
            <p className="oc-lead">
              Pedido de <strong>{order.customer.name}</strong>. Le avisaremos en su app; las piezas apartadas vuelven al inventario.
            </p>

            <div className="oc-reasons" role="radiogroup" aria-label="Motivo">
              {(['sin-existencia', 'otro'] as CancelReason[]).map((r) => (
                <button key={r} type="button" role="radio" aria-checked={reason === r} className={`oc-reason ${reason === r ? 'is-active' : ''}`} onClick={() => setReason(r)}>
                  <IonIcon icon={r === 'sin-existencia' ? cubeOutline : chatbubbleEllipsesOutline} />
                  <span>
                    <strong>{CANCEL_REASON_LABEL[r]}</strong>
                    <small>{r === 'sin-existencia' ? 'El cliente podrá elegir otro producto' : 'Explica el motivo al cliente'}</small>
                  </span>
                </button>
              ))}
            </div>

            {reason === 'sin-existencia' ? (
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
              No cancelar
            </IonButton>
            <IonButton color="danger" className="btn-lg" onClick={confirm}>
              <IonIcon slot="start" icon={trashOutline} />
              Cancelar pedido
            </IonButton>
          </div>
        </>
      )}
    </IonModal>
  );
}
