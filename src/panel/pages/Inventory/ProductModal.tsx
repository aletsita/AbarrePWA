import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar, useIonToast } from '@ionic/react';
import {
  arrowDown,
  arrowForward,
  arrowUp,
  barcodeOutline,
  closeOutline,
  constructOutline,
  informationCircleOutline,
  saveOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { AreaField, FormSection, MoneyField, SelectField, SwitchField, TextField } from '../../../components/Form';
import { PhotoPicker } from '../../../components/PhotoPicker';
import { SyncBadge } from '../../../components/SyncBadge';
import { useApp, type ProductView } from '../../../context/AppContext';
import { CATEGORIES, money, shortDate, uid, type MovementType, type Product } from '../../../data/models';
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
  const { saveProduct, findByBarcode, movementsFor } = useApp();
  const [toast] = useIonToast();
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
  const dup = draft.barcode ? findByBarcode(draft.barcode) : undefined;
  const dupOther = dup && dup.id !== draft.id;
  const valid = draft.name.trim() && draft.price > 0 && draft.barcode.trim() && !dupOther;
  const margin = draft.price - draft.cost;

  const save = () => {
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
            <p className="form-intro">Empieza por el código de barras: si el producto ya existe te llevamos a sus datos.</p>
            <TextField
              className="pm-code"
              label="Código de barras"
              hint="Escanéalo con el lector o escríbelo."
              icon={barcodeOutline}
              inputRef={codeInput}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ej. 7501234567890"
              value={code}
              onChange={(v) => setCode(v.replace(/\s/g, ''))}
            />
            <button type="button" className="pm-internal" onClick={() => lookup(`2${String(Date.now()).slice(-11)}`)}>
              El producto no tiene código · generar uno interno
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
              {notice && (
                <p className="pm-notice">
                  <IonIcon icon={informationCircleOutline} />
                  {notice}
                </p>
              )}
              <div className="pm-head">
                <PhotoPicker value={draft.photo} onChange={(photo) => set('photo', photo)} />
                <div className="pm-head-fields">
                  <TextField label="Nombre del producto" placeholder="Ej. Café Legal 200 g" value={draft.name} onChange={(v) => set('name', v)} />
                  {product?.sync && <SyncBadge state={product.sync} />}
                </div>
              </div>

              <FormSection title="Identificación">
                <TextField
                  label="Código de barras"
                  icon={barcodeOutline}
                  inputMode="numeric"
                  value={draft.barcode}
                  error={dupOther && `Ya lo usa ${dup?.name}`}
                  onChange={(v) => set('barcode', v.replace(/\s/g, ''))}
                />
                <SelectField label="Categoría" value={draft.category} onChange={(v) => set('category', v)}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </SelectField>
              </FormSection>

              <FormSection title="Precio">
                <MoneyField label="Precio de compra" hint="Lo que te cuesta" value={nums.cost} onChange={(v) => setNum('cost', v)} />
                <MoneyField label="Precio de venta" hint="Lo que cobras" value={nums.price} onChange={(v) => setNum('price', v)} />
                {draft.price > 0 && draft.cost > 0 && (
                  <p className={`form-note ${margin > 0 ? 'is-ok' : 'is-bad'}`}>
                    {margin > 0
                      ? <>Ganas <strong>{money(margin)}</strong> por pieza ({Math.round((margin / draft.price) * 100)} %)</>
                      : 'El precio de venta es menor o igual al de compra'}
                  </p>
                )}
              </FormSection>

              <FormSection title="Existencia">
                <TextField label="Piezas en tienda" inputMode="numeric" value={nums.stock} suffix="pzas"
                  onChange={(v) => setNum('stock', v.replace(/\D/g, ''))} />
                <TextField label="Avisar cuando queden" hint="Se marca como poco stock" inputMode="numeric" value={nums.minStock} suffix="pzas"
                  onChange={(v) => setNum('minStock', v.replace(/\D/g, ''))} />
              </FormSection>

              <FormSection title="Pide y recoge">
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
                  hint={draft.showInApp === false ? 'Tus clientes no lo ven en el catálogo' : draft.stock > 0 ? 'Tus clientes pueden pedirlo desde su celular' : 'Aparece como agotado hasta que haya existencia'}
                  checked={draft.showInApp !== false}
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
                        <span className={`pm-move-qty ${m.qty > 0 ? 'is-in' : 'is-out'}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>

          <div className="pmodal-foot">
            <IonButton fill="outline" className="btn-lg" onClick={onClose}>Cancelar</IonButton>
            <IonButton className="btn-lg" disabled={!valid} onClick={() => save()}>
              <IonIcon slot="start" icon={saveOutline} />
              {isNew ? 'Agregar producto' : 'Guardar cambios'}
            </IonButton>
          </div>
        </>
      )}
    </IonModal>
  );
}
