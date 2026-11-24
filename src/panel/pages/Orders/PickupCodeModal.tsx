import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import { alertCircleOutline, closeOutline, qrCodeOutline } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { cleanPickupCode, isPaidOnline, ORDER_STATUS_LABEL, parsePickupInput, PICKUP_CODE, type PickupOrder } from '../../../data/pickup';
import { useQrCamera } from '../../../lib/qrCamera';

const MAX_FAILS = 5;
const LOCK_MS = 60000;

const CAMERA_TEXT = {
  apagada: '',
  iniciando: 'Encendiendo la cámara…',
  activa: 'Acerca el QR del celular del cliente',
  'sin-permiso': 'El navegador no dio permiso para usar la cámara.',
  'sin-camara': 'No se encontró una cámara.',
};

// En el campo solo entran los 6 caracteres del código (letras y números, en mayúsculas)
const sanitize = cleanPickupCode;

interface Props {
  isOpen: boolean;
  // Pedido que se va a entregar; sin él, el código busca entre los pedidos listos
  order?: PickupOrder;
  orders: PickupOrder[];
  onClose: () => void;
  // Regresa un mensaje si el servidor no aceptó el código (por ejemplo, incorrecto o bloqueado)
  onVerified: (order: PickupOrder, code: string) => Promise<string | null> | void;
}

// Entregar un pedido exige el código que muestra la app del cliente (QR o 6 dígitos).
// La caja nunca muestra el código: solo lo compara.
export function PickupCodeModal({ isOpen, order, orders, onClose, onVerified }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [camera, setCamera] = useState(false);
  const [checking, setChecking] = useState(false);
  const fails = useRef(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Un lector USB "teclea" el contenido del QR (abarre:recoger:…) y Enter. Como empieza con una letra, se
  // junta aparte y nunca entra al campo
  const reader = useRef('');
  const locked = lockedUntil > Date.now();

  useEffect(() => {
    if (!locked) return;
    const t = window.setTimeout(() => setLockedUntil(0), lockedUntil - Date.now());
    return () => window.clearTimeout(t);
  }, [lockedUntil]);

  const reset = () => {
    reader.current = '';
    setText('');
    setError('');
    setCamera(false);
  };

  const fail = (msg: string) => {
    fails.current += 1;
    if (fails.current >= MAX_FAILS) {
      fails.current = 0;
      setLockedUntil(Date.now() + LOCK_MS);
      setError('Demasiados intentos. Espera un minuto y vuelve a intentarlo.');
    } else setError(msg);
    // Los números se quedan a la vista (seleccionados) para revisarlos o escribir encima
    window.setTimeout(() => inputRef.current?.select());
  };

  const check = async (raw: string) => {
    if (locked || checking) return;
    const parsed = parsePickupInput(raw);
    if (!parsed) {
      setError('Escribe los 6 caracteres del código o escanea el QR del cliente.');
      return;
    }
    let found: PickupOrder | undefined;
    if (order) {
      if (parsed.orderId && parsed.orderId !== order.id) return fail(`Ese código es de otro pedido, no del ${order.folio}.`);
      if (order.pickupCode !== parsed.code) {
        const other = orders.find((o) => o.id !== order.id && o.pickupCode === parsed.code);
        return fail(
          other
            ? `Ese código es del pedido ${other.folio} (${other.customer.name}), no del ${order.folio}. Ciérralo y entrega el ${other.folio}.`
            : `El código no coincide con el del ${order.folio}. Pídele al cliente que lo revise en su app.`,
        );
      }
      found = order;
    } else {
      const match = orders.find((o) => o.pickupCode === parsed.code && (!parsed.orderId || o.id === parsed.orderId));
      if (!match) return fail('No hay ningún pedido con ese código.');
      if (match.status === 'entregado') return fail(`El pedido ${match.folio} ya se entregó.`);
      if (match.status === 'cancelado') return fail(`El pedido ${match.folio} está cancelado.`);
      if (match.issue) {
        setError(`El pedido ${match.folio} está esperando a que el cliente cambie un producto agotado.`);
        return;
      }
      if (match.status !== 'listo') {
        setError(`El pedido ${match.folio} todavía está en "${ORDER_STATUS_LABEL[match.status]}". Márcalo como listo antes de entregarlo.`);
        return;
      }
      found = match;
    }
    setChecking(true);
    const refused = await onVerified(found, parsed.code);
    setChecking(false);
    if (refused) {
      setError(refused);
      window.setTimeout(() => inputRef.current?.select());
      return;
    }
    fails.current = 0;
    reset();
  };

  const paid = order ? isPaidOnline(order) : false;

  const { videoRef, status } = useQrCamera(isOpen && camera && !locked, check);

  return (
    <IonModal
      isOpen={isOpen}
      onDidPresent={() => inputRef.current?.focus()}
      onDidDismiss={() => {
        reset();
        onClose();
      }}
      className="pmodal pc-modal"
    >
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>{order ? `Entregar ${order.folio}` : 'Entregar pedido'}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Cerrar">
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <form
        className="pmodal-body pc-body"
        onSubmit={(e) => {
          e.preventDefault();
          void check(text);
        }}
      >
        <p className="pc-lead">
          {order ? <><strong>{order.customer.name}</strong> debe mostrarte el código de su app.</> : 'Pide al cliente el código de su app.'}
        </p>
        {paid && <p className="pc-paid">Pagado en línea: no se cobra, solo se valida el código.</p>}

        <label className="pc-label" htmlFor="pc-code">Código para recoger</label>
        <input
          id="pc-code"
          ref={inputRef}
          className="pc-input"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABC234"
          maxLength={6}
          value={text}
          disabled={locked}
          aria-invalid={!!error}
          aria-describedby="pc-help"
          onKeyDown={(e) => {
            // El código ahora lleva letras: todo lo tecleado se junta aparte, y al Enter se decide si fue
            // el QR de un lector USB (abarre:recoger:…) o el código escrito a mano
            if (e.key === 'Enter') {
              e.preventDefault();
              const raw = reader.current;
              reader.current = '';
              void check(/^abarre:/i.test(raw) ? raw : text);
              return;
            }
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) reader.current = (reader.current + e.key).slice(-120);
          }}
          onPaste={(e) => {
            // Pegar el texto del QR también funciona; cualquier otra cosa se reduce a sus dígitos
            const raw = e.clipboardData.getData('text');
            if (/^abarre:/i.test(raw.trim())) {
              e.preventDefault();
              void check(raw);
            }
          }}
          onChange={(e) => {
            const next = sanitize(e.target.value);
            setText(next);
            setError('');
            // Mientras un lector teclea "abarre:recoger:…" no se revisa a medias
            if (PICKUP_CODE.test(next) && !/^abarre/i.test(reader.current)) void check(next);
          }}
        />
        <p id="pc-help" className={`pc-help ${error ? 'is-error' : ''}`} role={error ? 'alert' : undefined}>
          {error ? <><IonIcon icon={alertCircleOutline} />{error}</> : 'Escríbelo o escanéalo con el lector o la cámara.'}
        </p>

        {camera ? (
          <div className="pc-camera">
            <video ref={videoRef} muted playsInline />
            <span className="pc-camera-text">{CAMERA_TEXT[status]}</span>
          </div>
        ) : (
          <button type="button" className="pc-camera-btn" disabled={locked} onClick={() => setCamera(true)}>
            <IonIcon icon={qrCodeOutline} />
            Escanear QR con la cámara
          </button>
        )}

        <button type="submit" hidden />
      </form>

      <div className="pmodal-foot">
        <IonButton fill="outline" className="btn-lg" onClick={onClose}>Cancelar</IonButton>
        <IonButton color="success" className="btn-lg" disabled={locked || checking || !text.trim()} onClick={() => void check(text)}>
          {paid ? 'Verificar y entregar' : 'Verificar y cobrar'}
        </IonButton>
      </div>
    </IonModal>
  );
}
