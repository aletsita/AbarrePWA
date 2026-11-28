import { IonButton, IonIcon, IonSpinner } from '@ionic/react';
import {
  alertCircle,
  barcodeOutline,
  cameraOutline,
  checkmark,
  checkmarkDone,
  chevronDown,
  closeOutline,
  lockClosedOutline,
  qrCodeOutline,
} from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { IsotipoMark } from '../../../components/IsotipoMark';
import { initials, money } from '../../../data/models';
import { cleanPickupCode, isPaidOnline, ORDER_STATUS_LABEL, parsePickupInput, PICKUP_CODE, type PickupOrder } from '../../../data/pickup';
import { itemCount, lineTotal, qtyText } from '../../../domain/weight';
import { useQrCamera } from '../../../lib/qrCamera';
import { useApp } from '../../../context/AppContext';
import { PanelModal, PanelModalCancel } from '../../../components/PanelModal';
import './PickupCodeModal.css';

const MAX_FAILS = 5;
const LOCK_MS = 60000;
const CODE_LENGTH = 6;
// Ejemplo que se ve en las casillas vacías, uno por casilla
const PLACEHOLDER = 'ABC234';

const CAMERA_TEXT = {
  apagada: '',
  iniciando: 'Encendiendo la cámara…',
  activa: 'Acerca el QR del celular del cliente',
  'sin-permiso': 'El navegador no dio permiso para usar la cámara.',
  'sin-camara': 'No se encontró una cámara.',
};

// En el campo solo entran los 6 caracteres del código (letras y números, en mayúsculas)
const sanitize = cleanPickupCode;

const qtyLabel = (i: PickupOrder['items'][number]) => (i.saleType === 'peso' ? qtyText(i.qty, 'peso') : `${i.qty}×`);
const countLabel = (o: PickupOrder) => {
  const n = itemCount(o.items);
  return `${n} ${n === 1 ? 'artículo' : 'artículos'}`;
};

// Resumen del pedido: panel azul a la izquierda en escritorio, tarjeta compacta arriba del código en celular.
// Sin pedido todavía (se abrió desde «Entregar con código»), solo la instrucción; los datos llegan al revisar el código.
function OrderSummary({ order, paid, compact }: { order?: PickupOrder; paid: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const total = order && (
    <div className="pc-sum-total">
      <span>{paid ? 'Pagado en la app' : 'Total a cobrar'}</span>
      <strong className="money">{money(order.total)}</strong>
    </div>
  );
  const items = order && order.items.length > 0 && (
    <ul className="pc-sum-items" id={compact ? 'pc-mini-items' : undefined}>
      {order.items.map((i) => (
        <li key={i.productId}>
          <span className="pc-sum-qty">{qtyLabel(i)}</span>
          <span className="pc-sum-name">{i.name}</span>
          <span className="pc-sum-price money">{money(lineTotal(i.qty, i.price, i.saleType))}</span>
        </li>
      ))}
    </ul>
  );

  if (!order) {
    return (
      <div className={`pc-sum is-empty ${compact ? 'is-compact' : ''}`}>
        <IsotipoMark className="pc-sum-mark" />
        <span className="pc-sum-label">Pedido a entregar</span>
        <span className="pc-sum-wait">
          <span className="pc-sum-wait-icon"><IonIcon icon={qrCodeOutline} aria-hidden="true" /></span>
          <span>Pide el código al cliente. El pedido aparece aquí al revisarlo.</span>
        </span>
      </div>
    );
  }

  return (
    <div className={`pc-sum ${compact ? 'is-compact' : ''}`}>
      <IsotipoMark className="pc-sum-mark" />
      {!compact && <span className="pc-sum-label">Pedido a entregar</span>}
      <div className="pc-sum-top">
        <div className="pc-sum-id">
          <span className="pc-sum-folio">
            <strong>{order.folio}</strong>
            {order.status === 'listo' && (
              <span className="pc-sum-pill"><IonIcon icon={checkmark} aria-hidden="true" />Listo</span>
            )}
          </span>
          {compact && order.customer.name && <span className="pc-sum-who">{order.customer.name}</span>}
        </div>
        {compact && total}
      </div>
      {!compact && order.customer.name && (
        <div className="pc-sum-customer">
          <span className="pc-sum-avatar" aria-hidden="true">{initials(order.customer.name)}</span>
          <span>
            <strong>{order.customer.name}</strong>
            <small>Recoge en tienda</small>
          </span>
        </div>
      )}
      {compact ? (
        items && (
          <>
            <button type="button" className="pc-sum-toggle" aria-expanded={open} aria-controls="pc-mini-items" onClick={() => setOpen((v) => !v)}>
              {countLabel(order)}
              <IonIcon icon={chevronDown} aria-hidden="true" />
            </button>
            {open && items}
          </>
        )
      ) : (
        <>
          {items}
          {total}
        </>
      )}
    </div>
  );
}

interface Props {
  isOpen: boolean;
  // Pedido que se va a entregar; sin él, el servidor busca entre los pedidos listos
  order?: PickupOrder;
  orders?: PickupOrder[];
  onClose: () => void;
  // Regresa un mensaje si el servidor no aceptó el código (por ejemplo, incorrecto o bloqueado)
  onVerified: (order: PickupOrder, code: string) => Promise<string | null> | void;
}

// Entregar un pedido exige el código que muestra la app del cliente (QR o 6 caracteres).
// La caja nunca muestra el código: solo lo compara.
export function PickupCodeModal({ isOpen, order, onClose, onVerified }: Props) {
  const { verifyPickupCode } = useApp();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [camera, setCamera] = useState(false);
  const [checking, setChecking] = useState(false);
  // Solo para mostrarlo: el pedido que el servidor encontró mientras se entrega o se pasa a cobrar
  const [verified, setVerified] = useState<PickupOrder | null>(null);
  // Solo para mostrarlo: se tocó «Lector» y el campo espera el escaneo
  const [readerReady, setReaderReady] = useState(false);
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
    setVerified(null);
    setReaderReady(false);
  };

  const fail = (msg: string) => {
    fails.current += 1;
    if (fails.current >= MAX_FAILS) {
      fails.current = 0;
      setLockedUntil(Date.now() + LOCK_MS);
      setError('Demasiados intentos. Espera un minuto y vuelve a intentarlo.');
    } else setError(msg);
    // Los caracteres se quedan a la vista (seleccionados) para revisarlos o escribir encima
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
    setVerified(found);
    setChecking(true);
    const refused = await onVerified(found, parsed.code);
    setChecking(false);
    if (refused) {
      setVerified(null);
      setError(refused);
      window.setTimeout(() => inputRef.current?.select());
      return;
    }
    fails.current = 0;
    reset();
  };

  // Lo escrito, pegado o tecleado por el lector pasa por aquí: mayúsculas, sin espacios ni guiones, máximo 6
  const type = (value: string) => {
    const next = sanitize(value);
    setText(next);
    setError('');
    // Mientras un lector teclea "abarre:recoger:…" no se revisa a medias
    if (PICKUP_CODE.test(next) && !/^abarre/i.test(reader.current)) void check(next);
  };

  const shown = verified ?? order;
  const paid = shown ? isPaidOnline(shown) : false;
  const complete = PICKUP_CODE.test(text);
  const state = verified ? 'ok' : error && text ? 'bad' : 'idle';
  const ready = complete && !error && !locked;

  const { videoRef, status } = useQrCamera(isOpen && camera && !locked, check);

  return (
    <PanelModal
      isOpen={isOpen}
      size="form"
      title="Entregar pedido"
      subtitle="Pide el código al cliente: está en su app, en el pedido listo para recoger."
      className="pc-modal"
      aside={<OrderSummary order={shown} paid={paid} />}
      busy={checking}
      onDidPresent={() => inputRef.current?.focus()}
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <form
        className="pc-form"
        onSubmit={(e) => {
          e.preventDefault();
          void check(text);
        }}
      >
        <div className="pmodal-body pc-body">
          {/* Celular: el resumen del pedido va aquí, arriba del código */}
          <div className="pc-mini">
            <OrderSummary order={shown} paid={paid} compact />
          </div>

          <div className="pc-code">
            <div className="pc-label-row">
              <label className="pc-label" htmlFor="pc-code">Código para recoger</label>
              <span className={`pc-count is-${state}`}>
                {checking && !verified && <IonSpinner name="crescent" aria-hidden="true" />}
                {text.length} de {CODE_LENGTH}
              </span>
            </div>

            {/* Un solo campo real (pegar, lector, autocompletar y lectores de pantalla) sobre 6 casillas dibujadas */}
            <div className={`pc-boxes-wrap is-${state} ${checking && !verified ? 'is-checking' : ''}`} onClick={() => inputRef.current?.focus()}>
              <input
                id="pc-code"
                ref={inputRef}
                className="pc-input"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="one-time-code"
                spellCheck={false}
                maxLength={CODE_LENGTH}
                value={text}
                disabled={locked}
                aria-label="Código para recoger, 6 caracteres"
                aria-invalid={!!error}
                aria-describedby="pc-help"
                onBlur={() => setReaderReady(false)}
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
                  // Pegar el texto del QR también funciona; cualquier otra cosa se limpia antes de recortar a 6
                  const raw = e.clipboardData.getData('text');
                  e.preventDefault();
                  if (/^abarre:/i.test(raw.trim())) void check(raw);
                  else type(raw);
                }}
                onChange={(e) => type(e.target.value)}
              />
              <div className="pc-boxes" aria-hidden="true">
                {Array.from({ length: CODE_LENGTH }, (_, i) => (
                  <span key={i} className={`pc-box ${text[i] ? 'is-filled' : ''} ${i === text.length ? 'is-next' : ''}`}>
                    {text[i] ?? (text ? '' : PLACEHOLDER[i])}
                  </span>
                ))}
              </div>
            </div>

            <span className="sr-only" aria-live="polite">
              {state === 'ok' ? 'Código correcto' : state === 'bad' ? 'Código incorrecto' : ''}
            </span>

            {verified ? (
              <section className="pc-ok" id="pc-help">
                <span className="pc-ok-icon">
                  <IonIcon icon={checkmark} aria-hidden="true" />
                </span>
                <span className="pc-ok-text">
                  <strong>Código correcto</strong>
                  <small>
                    Es el pedido {verified.folio}
                    {verified.customer.name && ` de ${verified.customer.name}`}. {paid ? 'Ya está pagado en la app.' : 'Listo para cobrar.'}
                  </small>
                </span>
              </section>
            ) : error ? (
              <p className="pc-error" id="pc-help" role="alert">
                <IonIcon icon={alertCircle} aria-hidden="true" />
                <span>
                  {locked && <strong>Bloqueado un minuto. </strong>}
                  {error}
                </span>
              </p>
            ) : (
              <p id="pc-help" className={`pc-help ${readerReady ? 'is-reader' : ''}`}>
                {readerReady ? 'Lector listo: escanea el QR del cliente.' : 'Escríbelo o escanéalo. Al completar los 6 caracteres se revisa solo.'}
              </p>
            )}
          </div>

          {!verified && (
            <section className="pc-scan" aria-labelledby="pc-scan-title">
              <h3 id="pc-scan-title">O escanéalo</h3>
              {camera ? (
                <div className="pc-camera">
                  <video ref={videoRef} muted playsInline />
                  <span className="pc-camera-text">{CAMERA_TEXT[status]}</span>
                  <button type="button" className="pc-camera-close" onClick={() => setCamera(false)} aria-label="Apagar cámara">
                    <IonIcon icon={closeOutline} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="pc-scan-grid">
                  <button
                    type="button"
                    className={`pc-scan-btn ${readerReady ? 'is-on' : ''}`}
                    disabled={locked}
                    onClick={() => {
                      inputRef.current?.focus();
                      setReaderReady(true);
                    }}
                  >
                    <span className="pc-scan-icon"><IonIcon icon={barcodeOutline} aria-hidden="true" /></span>
                    <span className="pc-scan-text">
                      <strong>Lector</strong>
                      <small>Apunta el lector al QR</small>
                    </span>
                  </button>
                  <button type="button" className="pc-scan-btn" disabled={locked} onClick={() => setCamera(true)}>
                    <span className="pc-scan-icon"><IonIcon icon={cameraOutline} aria-hidden="true" /></span>
                    <span className="pc-scan-text">
                      <strong>Cámara</strong>
                      <small>Usa la cámara del equipo</small>
                    </span>
                  </button>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="pmodal-foot pc-foot">
          <PanelModalCancel className="pc-cancel" disabled={checking}>Cancelar</PanelModalCancel>
          <IonButton type="submit" className={`pc-verify ${ready || checking ? 'is-ready' : ''}`} disabled={checking || !ready}>
            {checking ? (
              <>
                <IonSpinner slot="start" name="crescent" aria-hidden="true" />
                {verified ? (paid ? 'Entregando…' : 'Cobrando…') : 'Revisando…'}
              </>
            ) : (
              <>
                <IonIcon slot="start" icon={ready ? checkmarkDone : lockClosedOutline} aria-hidden="true" />
                {paid ? 'Verificar y entregar' : ready && shown ? `Verificar y cobrar · ${money(shown.total)}` : 'Verificar y cobrar'}
              </>
            )}
          </IonButton>
        </div>
      </form>
    </PanelModal>
  );
}
