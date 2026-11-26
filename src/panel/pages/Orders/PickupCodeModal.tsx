import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import { cameraOutline, checkmarkDone, closeOutline, globeOutline, cashOutline, keypadOutline, qrCodeOutline } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { Notice } from '../../../components/Notice';
import { money } from '../../../data/models';
import { cleanPickupCode, isPaidOnline, ORDER_STATUS_LABEL, parsePickupInput, PICKUP_CODE, type PickupOrder } from '../../../data/pickup';
import { useQrCamera } from '../../../lib/qrCamera';
import { useApp } from '../../../context/AppContext';

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
  // Pedido que se va a entregar; sin él, el servidor busca entre los pedidos listos
  order?: PickupOrder;
  orders?: PickupOrder[];
  onClose: () => void;
  // Regresa un mensaje si el servidor no aceptó el código (por ejemplo, incorrecto o bloqueado)
  onVerified: (order: PickupOrder, code: string) => Promise<string | null> | void;
}

// Entregar un pedido exige el código que muestra la app del cliente (QR o 6 dígitos).
// La caja nunca muestra el código: solo lo compara.
export function PickupCodeModal({ isOpen, order, onClose, onVerified }: Props) {
  const { verifyPickupCode } = useApp();
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
    if (order && parsed.orderId && parsed.orderId !== order.id) return fail(`Ese código es de otro pedido, no del ${order.folio}.`);
    // El servidor busca el pedido listo con ese código (limita los intentos y bloquea tras varios errores)
    setChecking(true);
    const r = await verifyPickupCode(raw.trim());
    setChecking(false);
    if (!r.ok) return r.code === 'sin-conexion' ? setError(r.message) : fail(r.message);
    const found = r.value;
    if (order && found.id !== order.id) {
      return fail(`Ese código es del pedido ${found.folio} (${found.customer.name}), no del ${order.folio}. Ciérralo y entrega el ${found.folio}.`);
    }
    if (found.issue) {
      setError(`El pedido ${found.folio} está esperando a que el cliente cambie un producto agotado.`);
      return;
    }
    if (found.status !== 'listo') {
      setError(`El pedido ${found.folio} todavía está en "${ORDER_STATUS_LABEL[found.status]}". Márcalo como listo antes de entregarlo.`);
      return;
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
        {order ? (
          <section className="pc-order">
            <span className="pc-order-icon">
              <IonIcon icon={qrCodeOutline} aria-hidden="true" />
            </span>
            <span className="pc-order-text">
              <strong>{order.customer.name}</strong>
              <small>
                Pedido {order.folio} · {order.items.length} {order.items.length === 1 ? 'producto' : 'productos'}
              </small>
            </span>
            <span className="pc-order-total">
              <strong className="money">{money(order.total)}</strong>
              <span className={`pc-chip ${paid ? 'is-paid' : 'is-cash'}`}>
                <IonIcon icon={paid ? globeOutline : cashOutline} aria-hidden="true" />
                {paid ? 'Pagado' : 'Cobrar al entregar'}
              </span>
            </span>
          </section>
        ) : (
          <section className="pc-order is-generic">
            <span className="pc-order-icon">
              <IonIcon icon={qrCodeOutline} aria-hidden="true" />
            </span>
            <span className="pc-order-text">
              <strong>Pide el código al cliente</strong>
              <small>Está en su app, en el pedido listo para recoger.</small>
            </span>
          </section>
        )}

        <label className="pc-label" htmlFor="pc-code">
          <IonIcon icon={keypadOutline} aria-hidden="true" />
          Código para recoger
        </label>
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
        {error ? (
          <div id="pc-help" role="alert">
            <Notice tone="error" title={locked ? 'Bloqueado un minuto' : 'El código no sirve'}>
              {error}
            </Notice>
          </div>
        ) : (
          <p id="pc-help" className="pc-help">
            Escríbelo, o escanéalo con el lector o la cámara. Al completar los 6 caracteres se revisa solo.
          </p>
        )}

        {/* La acción principal va junto al código, no hasta el pie del modal */}
        <IonButton type="submit" expand="block" color="success" className="btn-lg pc-verify" disabled={locked || checking || !text.trim()}>
          <IonIcon slot="start" icon={checkmarkDone} />
          {checking ? 'Revisando…' : paid ? 'Verificar y entregar' : 'Verificar y cobrar'}
        </IonButton>

        <div className="pc-or">
          <span>o</span>
        </div>

        {camera ? (
          <div className="pc-camera">
            <video ref={videoRef} muted playsInline />
            <span className="pc-camera-text">{CAMERA_TEXT[status]}</span>
            <button type="button" className="pc-camera-close" onClick={() => setCamera(false)} aria-label="Apagar cámara">
              <IonIcon icon={closeOutline} />
            </button>
          </div>
        ) : (
          <button type="button" className="pc-camera-btn" disabled={locked} onClick={() => setCamera(true)}>
            <IonIcon icon={cameraOutline} />
            Escanear el QR con la cámara
          </button>
        )}
      </form>
    </IonModal>
  );
}
