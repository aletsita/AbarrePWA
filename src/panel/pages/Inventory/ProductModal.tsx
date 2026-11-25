import { isWeighed, qtyText, roundQty, type SaleType } from '../../../domain/weight';
import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar, useIonToast } from '@ionic/react';
import {
  arrowDown,
  arrowForward,
  arrowUp,
  barcodeOutline,
  closeOutline,
  constructOutline,
  cubeOutline,
  phonePortraitOutline,
  pricetagOutline,
  pricetagsOutline,
  saveOutline,
  sparklesOutline,
  trashOutline,
} from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { useAppAlert } from '../../../components/AppAlert';
import { AreaField, FormSection, MoneyField, SelectField, SwitchField, TextField } from '../../../components/Form';
import { Notice } from '../../../components/Notice';
import { SaleTypeField } from '../../../components/SaleTypeField';
import { PhotoPicker } from '../../../components/PhotoPicker';
import { SyncBadge } from '../../../components/SyncBadge';
import { useApp, type ProductView } from '../../../context/AppContext';
import { CATEGORIES, money, shortDate, uid, type MovementType, type Product } from '../../../data/models';
import { generateInternalEan13 } from '../../../domain/ean13';
import './ProductModal.css';

const MOVE_ICON: Record<MovementType, string> = { venta: arrowDown, entrada: arrowUp, ajuste: constructOutline, alta: sparklesOutline };
const MOVE_LABEL: Record<MovementType, string> = { venta: 'Venta', entrada: 'Entrada', ajuste: 'Ajuste', alta: 'Alta' };

const blank = (barcode = ''): Product => ({
  id: `p${uid()}`,
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
  const { saveProduct, deleteProduct, findByBarcode, movementsFor } = useApp();
  const [toast] = useIonToast();
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
    if (product) {
      const { sync: _sync, ...p } = product;
      setDraft(p);
      setIsNew(false);
      setStep('form');
    } else if (barcode) {
      setDraft(blank(barcode));
      setIsNew(true);
      setStep('form');
    } else {
      setDraft(blank());
      setIsNew(true);
      setStep('codigo');
    }
  }, [isOpen, product, barcode]);

  const lookup = (value: string) => {
    const c = value.trim();
    if (!c) return;
    const found = findByBarcode(c);
    if (found) {
      const { sync: _sync, ...p } = found;
      setDraft(p);
      setIsNew(false);
      setNotice(`El código ${c} ya está registrado. Puedes actualizar sus datos o su existencia.`);
    } else {
      setDraft(blank(c));
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
    onClose();
  };

  const moves = !isNew ? movementsFor(draft.id) : [];

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onClose}
      onDidPresent={() => step === 'codigo' && codeInput.current?.focus()}
      className={`pmodal ${step === 'form' && !isNew ? 'is-wide' : ''}`}
    >
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>{step === 'codigo' ? 'Agregar producto' : isNew ? 'Producto nuevo' : 'Editar producto'}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Cerrar">
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

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
            <IonButton fill="outline" className="btn-lg" onClick={onClose}>Cancelar</IonButton>
            <IonButton className="btn-lg" disabled={!code.trim()} onClick={() => lookup(code)}>
              Continuar
              <IonIcon slot="end" icon={arrowForward} />
            </IonButton>
          </div>
        </>
      ) : (
        <>
          <div className="pmodal-body pm-grid">
            <section className="pm-form">
              {notice && <Notice tone="info" title="Este producto ya existe">{notice}</Notice>}
              {tried && !valid && (
                <Notice tone="error" title="Faltan datos">
                  Revisa los campos marcados en rojo.
                </Notice>
              )}

              <div className="pm-head">
                <PhotoPicker value={draft.photo} onChange={(photo) => set('photo', photo)} />
                <div className="pm-head-fields">
                  <TextField
                    label="Nombre del producto"
                    placeholder="Ej. Café Legal 200 g"
                    value={draft.name}
                    error={tried && errors.name}
                    onChange={(v) => set('name', v)}
                  />
                  <div className="pm-preview">
                    <strong className="money">{draft.price > 0 ? money(draft.price) : '$—'}</strong>
                    <span>{weighed ? 'por kg' : 'por pieza'}</span>
                    <span className="pm-chip">{draft.category}</span>
                    {product?.sync && <SyncBadge state={product.sync} />}
                  </div>
                </div>
              </div>

              <FormSection title="Datos del producto" icon={pricetagsOutline}>
                <TextField
                  label="Código de barras"
                  icon={barcodeOutline}
                  inputMode="numeric"
                  value={draft.barcode}
                  error={tried || dupOther ? errors.barcode : undefined}
                  onChange={(v) => set('barcode', v.replace(/\s/g, ''))}
                />
                <SelectField label="Categoría" value={draft.category} onChange={(v) => set('category', v)}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </SelectField>
                <div className="is-wide pm-saletype">
                  <span className="pm-label">Se vende por</span>
                  <SaleTypeField value={draft.saleType} onChange={setSaleType} />
                </div>
              </FormSection>

              <FormSection title="Precio" icon={pricetagOutline}>
                <MoneyField label="Precio de compra" hint="Lo que te cuesta" value={nums.cost} onChange={(v) => setNum('cost', v)} />
                <MoneyField
                  label={weighed ? 'Precio de venta por kg' : 'Precio de venta'}
                  hint="Lo que cobras"
                  value={nums.price}
                  error={tried && errors.price}
                  onChange={(v) => setNum('price', v)}
                />
                {draft.price > 0 && draft.cost > 0 && (
                  <p className={`form-note ${margin > 0 ? 'is-ok' : 'is-bad'}`}>
                    {margin > 0
                      ? <>Ganas <strong>{money(margin)}</strong> por {weighed ? 'kilo' : 'pieza'} ({Math.round((margin / draft.price) * 100)} %)</>
                      : 'El precio de venta es menor o igual al de compra'}
                  </p>
                )}
              </FormSection>

              <FormSection title="Existencia" icon={cubeOutline}>
                <TextField label={weighed ? 'Kilos en tienda' : 'Piezas en tienda'} inputMode={weighed ? 'decimal' : 'numeric'} value={nums.stock} suffix={weighed ? 'kg' : 'pzas'}
                  onChange={(v) => setQtyNum('stock', v)} />
                <TextField label="Avisar cuando queden" hint="Se marca como poco stock" inputMode={weighed ? 'decimal' : 'numeric'} value={nums.minStock} suffix={weighed ? 'kg' : 'pzas'}
                  onChange={(v) => setQtyNum('minStock', v)} />
              </FormSection>

              <FormSection title="Pide y recoge" icon={phonePortraitOutline} text="Lo que ven tus clientes en su app">
                <AreaField
                  label="Descripción"
                  optional
                  hint="La ven tus clientes en el detalle del producto"
                  placeholder="Ej. Café soluble clásico, frasco de 200 g."
                  maxLength={300}
                  value={draft.description ?? ''}
                  onChange={(v) => set('description', v)}
                />
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
              </FormSection>
            </section>

            {!isNew && (
              <section className="pm-history">
                <h3>Movimientos</h3>
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

          <div className="pmodal-foot">
            {!isNew && (
              <IonButton fill="clear" color="danger" className="btn-lg pmodal-delete" disabled={deleting} onClick={() => void askDelete()}>
                <IonIcon slot="start" icon={trashOutline} />
                Borrar
              </IonButton>
            )}
            <IonButton fill="outline" className="btn-lg" onClick={onClose}>Cancelar</IonButton>
            <IonButton className="btn-lg pm-save" onClick={() => save()}>
              <IonIcon slot="start" icon={saveOutline} />
              {isNew ? 'Agregar producto' : 'Guardar cambios'}
            </IonButton>
          </div>
        </>
      )}
    </IonModal>
  );
}
