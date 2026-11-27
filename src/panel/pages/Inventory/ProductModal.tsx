import { isWeighed, qtyText, roundQty, type SaleType } from '../../../domain/weight';
import { IonButton, IonIcon, IonSpinner } from '@ionic/react';
import {
  arrowDown,
  arrowForward,
  arrowUp,
  barcodeOutline,
  constructOutline,
  phonePortraitOutline,
  pricetagOutline,
  pricetagsOutline,
  scanOutline,
  swapVerticalOutline,
  saveOutline,
  sparklesOutline,
  trashOutline,
} from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { useAppAlert } from '../../../components/AppAlert';
import { CategoryField } from '../../../components/CategoryField';
import { AreaField, FormSection, MoneyField, SwitchField, TextField } from '../../../components/Form';
import { Notice } from '../../../components/Notice';
import { SaleTypeField } from '../../../components/SaleTypeField';
import { PhotoPicker } from '../../../components/PhotoPicker';
import { useApp, type ProductView } from '../../../context/AppContext';
import { money, shortDate, uid, type MovementType, type Product } from '../../../data/models';
import { generateInternalEan13 } from '../../../domain/ean13';
import { PanelModal } from '../../../components/PanelModal';
import './ProductModal.css';
import { useAviso } from '../../../components/Aviso';

const MOVE_ICON: Record<MovementType, string> = { venta: arrowDown, entrada: arrowUp, ajuste: constructOutline, alta: sparklesOutline };
const MOVE_LABEL: Record<MovementType, string> = { venta: 'Venta', entrada: 'Entrada', ajuste: 'Ajuste', alta: 'Alta' };
// Largo máximo de la descripción (el mismo de antes; el contador lo muestra)
const DESCRIPTION_MAX = 300;

const blank = (barcode = ''): Product => ({
  id: uid(),
  name: '',
  category: 'Abarrotes',
  price: 0,
  cost: 0,
  stock: 0,
  minStock: 3,
  barcode,
});

type Step = 'codigo' | 'form';

interface Props {
  isOpen: boolean;
  product?: ProductView;
  barcode?: string;
  onClose: () => void;
  onSaved?: (p: Product, isNew: boolean) => void;
}

export function ProductModal({ isOpen, product, barcode, onClose, onSaved }: Props) {
  const { saveProduct, deleteProduct, findByBarcode, movementsFor, user } = useApp();
  // Según la API, solo Dueño e Inventario dan de alta, editan y borran productos
  const canEdit = user?.role !== 'Cajero';
  // Mientras sube el cambio anterior no se guarda otro encima
  const uploading = product?.sync === 'subiendo';
  const toast = useAviso();
  const showAlert = useAppAlert();
  const [deleting, setDeleting] = useState(false);
  // Los errores de los campos se muestran después del primer intento de guardar
  const [tried, setTried] = useState(false);
  const [step, setStep] = useState<Step>('codigo');
  const [draft, setDraft] = useState<Product>(blank());
  const [isNew, setIsNew] = useState(true);
  const [notice, setNotice] = useState('');
  const [code, setCode] = useState('');
  const codeInput = useRef<HTMLInputElement>(null);
  const barcodeInput = useRef<HTMLInputElement>(null);
  const modal = useRef<HTMLIonModalElement>(null);
  // Cómo estaba el producto al abrirlo: si cambió, cerrar pide confirmación
  const initial = useRef('');
  // Ya se guardó o se borró: se cierra sin preguntar
  const leaving = useRef(false);
  // Texto de los campos numéricos tal como se escribe ("14." no debe volverse 14 a medio teclear)
  const [nums, setNums] = useState({ cost: '', price: '', stock: '', minStock: '' });

  useEffect(() => {
    setNums({
      cost: draft.cost ? String(draft.cost) : '',
      price: draft.price ? String(draft.price) : '',
      stock: String(draft.stock),
      minStock: String(draft.minStock),
    });
  }, [draft.id]);

  useEffect(() => {
    if (!isOpen) return;
    setTried(false);
    setNotice('');
    setCode('');
    leaving.current = false;
    if (product) {
      const { sync: _sync, ...p } = product;
      start(p);
      setIsNew(false);
      setStep('form');
    } else if (barcode) {
      start(blank(barcode));
      setIsNew(true);
      setStep('form');
    } else {
      start(blank());
      setIsNew(true);
      setStep('codigo');
    }
  }, [isOpen, product, barcode]);

  const start = (p: Product) => {
    initial.current = JSON.stringify(p);
    setDraft(p);
  };

  const lookup = (value: string) => {
    const c = value.trim();
    if (!c) return;
    const found = findByBarcode(c);
    if (found) {
      const { sync: _sync, ...p } = found;
      start(p);
      setIsNew(false);
      setNotice(`El código ${c} ya está registrado. Puedes actualizar sus datos o su existencia.`);
    } else {
      start(blank(c));
      setIsNew(true);
    }
    setStep('form');
  };

  const set = <K extends keyof Product>(k: K, v: Product[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setNum = (k: keyof typeof nums, text: string) => {
    setNums((n) => ({ ...n, [k]: text }));
    set(k, Number(text) || 0);
  };
  const weighed = isWeighed(draft);
  // Existencia: piezas enteras, o kilos con hasta 3 decimales
  const qtyInput = (text: string) => (weighed ? (/^\d*[.,]?\d{0,3}$/.test(text) ? text.replace(',', '.') : null) : text.replace(/\D/g, ''));
  const setQtyNum = (k: 'stock' | 'minStock', text: string) => {
    const clean = qtyInput(text);
    if (clean === null) return;
    setNums((n) => ({ ...n, [k]: clean }));
    set(k, roundQty(Number(clean) || 0));
  };
  // Al cambiar de peso a pieza, la existencia se queda en piezas enteras
  const setSaleType = (v: SaleType) =>
    setDraft((d) => {
      const next = { ...d, saleType: v === 'peso' ? ('peso' as const) : undefined };
      if (v !== 'peso') {
        next.stock = Math.floor(d.stock);
        next.minStock = Math.floor(d.minStock);
        setNums((n) => ({ ...n, stock: String(next.stock), minStock: String(next.minStock) }));
      }
      return next;
    });
  const dup = draft.barcode ? findByBarcode(draft.barcode) : undefined;
  const dupOther = dup && dup.id !== draft.id;
  const errors: Record<'name' | 'price' | 'barcode', string | false> = {
    name: !draft.name.trim() && 'Escribe el nombre del producto',
    price: !(draft.price > 0) && 'Pon un precio mayor a $0',
    barcode: !draft.barcode.trim() ? 'Escribe o genera un código' : dupOther ? `Ya lo usa ${dup?.name}` : false,
  };
  const valid = !errors.name && !errors.price && !errors.barcode;
  const margin = draft.price - draft.cost;
  const dirty = step === 'form' && canEdit && JSON.stringify(draft) !== initial.current;

  // Cerrar (X, Cancelar, Esc o tocar fuera) pasa por aquí: con cambios sin guardar, pregunta antes
  const confirmClose = async () => {
    if (leaving.current || !dirty) return true;
    return showAlert({
      tone: 'warning',
      title: '¿Salir sin guardar?',
      message: 'Los cambios que hiciste en este producto se van a perder.',
      primary: { text: 'Salir sin guardar', danger: true },
      secondary: 'Seguir editando',
    });
  };
  const close = () => void modal.current?.dismiss();

  const save = () => {
    setTried(true);
    if (!valid) {
      // Lleva la vista al primer campo con error
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.pm-form [aria-invalid="true"]')?.focus());
      return;
    }
    const p = { ...draft, name: draft.name.trim(), barcode: draft.barcode.trim() };
    const r = saveProduct(p, isNew);
    toast({
      message:
        r === 'pendiente'
          ? 'Sin conexión: el producto quedó guardado en este equipo y se subirá solo.'
          : isNew
            ? `${p.name} agregado al inventario`
            : 'Cambios guardados',
      duration: r === 'pendiente' ? 3000 : 1600,
      color: r === 'pendiente' ? 'warning' : 'success',
      position: 'top',
      cssClass: 'toast-app',
    });
    leaving.current = true;
    onSaved?.(p, isNew);
    onClose();
  };

  // Borrado lógico: deja de venderse y de verse, pero las ventas y cortes que lo nombran no cambian
  const askDelete = async () => {
    const yes = await showAlert({
      tone: 'warning',
      title: `¿Borrar ${draft.name}?`,
      message: 'Deja de aparecer en el inventario, en la caja y en la app de clientes. Las ventas y cortes que ya lo incluyen no cambian.',
      primary: { text: 'Borrar producto', danger: true },
      secondary: 'Cancelar',
    });
    if (!yes) return;
    setDeleting(true);
    const r = await deleteProduct(draft.id);
    setDeleting(false);
    if (!r.ok) {
      await showAlert({ tone: 'error', title: 'No se pudo borrar', message: r.message, primary: 'Entendido' });
      return;
    }
    void toast({ message: `${draft.name} se borró del inventario`, duration: 2000, color: 'success', position: 'top', cssClass: 'toast-app' });
    leaving.current = true;
    onClose();
  };

  const moves = !isNew ? movementsFor(draft.id) : [];

  const title = step === 'codigo' ? 'Agregar producto' : isNew ? 'Producto nuevo' : 'Editar producto';
  const unit = weighed ? 'kg' : 'pzas';
  const description = draft.description ?? '';

  return (
    <PanelModal
      modalRef={modal}
      isOpen={isOpen}
      onClose={onClose}
      canDismiss={confirmClose}
      onDidPresent={() => step === 'codigo' && codeInput.current?.focus()}
      size={step === 'form' ? 'wide' : 'form'}
      title={title}
      subtitle={step === 'form' ? 'Los cambios se ven al instante en la tienda y en la app' : undefined}
      className="pm-modal"
    >
      {step === 'codigo' ? (
        <>
          <form
            className="pmodal-body pm-lookup"
            onSubmit={(e) => {
              e.preventDefault();
              lookup(code);
            }}
          >
            <div className="pm-hero">
              <span className="pm-hero-icon">
                <IonIcon icon={barcodeOutline} aria-hidden="true" />
              </span>
              <h2>¿Qué código tiene?</h2>
              <p>Escanéalo con el lector o escríbelo. Si el producto ya existe, te llevamos a sus datos.</p>
            </div>
            <TextField
              className="pm-code"
              label="Código de barras"
              icon={barcodeOutline}
              inputRef={codeInput}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ej. 7501234567890"
              value={code}
              onChange={(v) => setCode(v.replace(/\s/g, ''))}
            />
            <div className="pm-or">
              <span>o</span>
            </div>
            <button type="button" className="pm-internal" onClick={() => lookup(generateInternalEan13((c) => !!findByBarcode(c)))}>
              <IonIcon icon={sparklesOutline} aria-hidden="true" />
              <span>
                <strong>No tiene código</strong>
                <small>Generamos uno interno para imprimirlo o escribirlo en caja</small>
              </span>
            </button>
          </form>
          <div className="pmodal-foot">
            <IonButton fill="outline" className="btn-lg" onClick={close}>Cancelar</IonButton>
            <IonButton className="btn-lg" disabled={!code.trim()} onClick={() => lookup(code)}>
              Continuar
              <IonIcon slot="end" icon={arrowForward} />
            </IonButton>
          </div>
        </>
      ) : (
        <>
          <div className="pmodal-body pm-body">
            {(notice || (tried && !valid) || product?.sync === 'pendiente') && (
              <div className="pm-notices">
                {notice && <Notice tone="info" title="Este producto ya existe">{notice}</Notice>}
                {tried && !valid && (
                  <Notice tone="error" title="Faltan datos">
                    Revisa los campos marcados en rojo.
                  </Notice>
                )}
                {product?.sync === 'pendiente' && (
                  <p className="pm-sync is-pendiente" role="status">
                    Cambios guardados en este equipo; se suben solos al volver la conexión.
                  </p>
                )}
              </div>
            )}

            <div className="pm-grid pm-form">
              {/* Columna izquierda: datos del producto */}
              <div className="pm-col">
                <FormSection title="Datos del producto" icon={pricetagsOutline}>
                  <div className="pm-top is-wide">
                    <PhotoPicker value={draft.photo} onChange={(photo) => set('photo', photo)} busy={uploading ? 'Subiendo…' : undefined} withButton />
                    <div className="pm-top-fields">
                      <TextField
                        label="Nombre del producto"
                        placeholder="Ej. Café Legal 200 g"
                        value={draft.name}
                        error={tried && errors.name}
                        onChange={(v) => set('name', v)}
                      />
                      <p className="pm-price">
                        <strong>{draft.price > 0 ? money(draft.price) : '$—'}</strong>
                        <span>{weighed ? 'por kg' : 'por pieza'}</span>
                      </p>
                    </div>
                  </div>

                  <TextField
                    className="is-wide pm-barcode"
                    label="Código de barras"
                    icon={barcodeOutline}
                    inputMode="numeric"
                    inputRef={barcodeInput}
                    value={draft.barcode}
                    error={tried || dupOther ? errors.barcode : undefined}
                    onChange={(v) => set('barcode', v.replace(/\s/g, ''))}
                    suffix={
                      // El lector de códigos escribe donde está el cursor: «Escanear» deja el campo listo para leer
                      <button
                        type="button"
                        className="pm-scan"
                        onClick={() => barcodeInput.current?.select()}
                        title="Pasa el producto por el lector de códigos"
                      >
                        <IonIcon icon={scanOutline} aria-hidden="true" />
                        Escanear
                      </button>
                    }
                  />

                  <div className="is-wide pm-saletype">
                    <span className="fld-label">Se vende por</span>
                    <SaleTypeField value={draft.saleType} onChange={setSaleType} />
                  </div>

                  <CategoryField className="is-wide" value={draft.category} onChange={(v) => set('category', v)} />
                </FormSection>
              </div>

              {/* Columna derecha: precio e inventario, y lo que ve el cliente */}
              <div className="pm-col">
                <FormSection title="Precio e inventario" icon={pricetagOutline}>
                  <MoneyField label="Precio de compra" hint="Lo que te cuesta" value={nums.cost} onChange={(v) => setNum('cost', v)} />
                  <MoneyField
                    label={weighed ? 'Precio de venta por kg' : 'Precio de venta'}
                    hint="Lo que cobras"
                    value={nums.price}
                    error={tried && errors.price}
                    onChange={(v) => setNum('price', v)}
                  />
                  {draft.price > 0 && draft.cost > 0 && (
                    <p className={`form-note pm-margin ${margin > 0 ? 'is-ok' : 'is-bad'}`} role="status">
                      {margin > 0 ? (
                        <>
                          Ganas <strong>{money(margin)}</strong> por {weighed ? 'kilo' : 'pieza'} · {Math.round((margin / draft.price) * 100)} % de margen
                        </>
                      ) : margin < 0 ? (
                        'Estás vendiendo por debajo de tu costo'
                      ) : (
                        'Vendes al mismo precio que te cuesta'
                      )}
                    </p>
                  )}
                  <TextField
                    label={weighed ? 'Kilos en tienda' : 'Piezas en tienda'}
                    inputMode={weighed ? 'decimal' : 'numeric'}
                    value={nums.stock}
                    suffix={unit}
                    onChange={(v) => setQtyNum('stock', v)}
                  />
                  <TextField
                    label="Avisar cuando queden"
                    hint="Se marca como poco stock"
                    inputMode={weighed ? 'decimal' : 'numeric'}
                    value={nums.minStock}
                    suffix={unit}
                    onChange={(v) => setQtyNum('minStock', v)}
                  />
                </FormSection>

                <FormSection title="Pide y recoge" icon={phonePortraitOutline} text="Lo que ven tus clientes en su app">
                  <SwitchField
                    label="Mostrar en la app"
                    hint={
                      weighed
                        ? 'Los productos por peso no se piden desde la app: se venden en caja'
                        : draft.showInApp === false
                          ? 'Tus clientes no lo ven en el catálogo'
                          : draft.stock > 0
                            ? 'Tus clientes pueden pedirlo desde su celular'
                            : 'Aparece como agotado hasta que haya existencia'
                    }
                    disabled={weighed}
                    checked={!weighed && draft.showInApp !== false}
                    onChange={(v) => set('showInApp', v)}
                  />
                  <AreaField
                    className="is-wide pm-description"
                    label="Descripción"
                    optional
                    hint={
                      <>
                        <span>La ven tus clientes en el detalle del producto</span>
                        <span className="pm-count">
                          {description.length}/{DESCRIPTION_MAX}
                        </span>
                      </>
                    }
                    placeholder="Ej. Café soluble clásico, frasco de 200 g."
                    maxLength={DESCRIPTION_MAX}
                    value={description}
                    onChange={(v) => set('description', v)}
                  />
                </FormSection>
              </div>

              {!isNew && (
                <section className="form-section is-card pm-wide pm-history">
                  <header>
                    <span className="form-section-icon">
                      <IonIcon icon={swapVerticalOutline} aria-hidden="true" />
                    </span>
                    <span>
                      <h3>Movimientos</h3>
                    </span>
                  </header>
                  {moves.length === 0 ? (
                    <p className="muted">Sin movimientos todavía.</p>
                  ) : (
                    <ul>
                      {moves.map((m) => (
                        <li key={m.id}>
                          <span className={`pm-move-icon type-${m.type}`}><IonIcon icon={MOVE_ICON[m.type]} /></span>
                          <span className="pm-move-text">
                            <strong>{MOVE_LABEL[m.type]}</strong>
                            <span className="muted">{m.note} · {shortDate(m.date)}</span>
                          </span>
                          <span className={`pm-move-qty ${m.qty > 0 ? 'is-in' : 'is-out'}`}>{m.qty > 0 ? '+' : ''}{qtyText(m.qty, draft.saleType)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          </div>

          <div className="pmodal-foot pm-foot">
            {!canEdit && <span className="muted">Solo el dueño o Inventario pueden cambiar productos.</span>}
            {!isNew && canEdit && (
              <IonButton fill="clear" color="danger" className="pmodal-delete" disabled={deleting} onClick={() => void askDelete()}>
                <IonIcon slot="start" icon={trashOutline} />
                Borrar
              </IonButton>
            )}
            <IonButton fill="outline" onClick={close}>Cancelar</IonButton>
            <IonButton className="pm-save" disabled={!canEdit || uploading} onClick={() => save()}>
              {uploading ? <IonSpinner slot="start" name="crescent" /> : <IonIcon slot="start" icon={saveOutline} />}
              {uploading ? 'Guardando…' : isNew ? 'Agregar producto' : 'Guardar cambios'}
            </IonButton>
          </div>
        </>
      )}
    </PanelModal>
  );
}
