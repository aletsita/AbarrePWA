import { IonButton, IonButtons, IonHeader, IonIcon, IonInput, IonModal, IonTitle, IonToolbar, useIonToast } from '@ionic/react';
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
          <div className="pmodal-body pm-lookup">
            <label htmlFor="pm-code">Escanea el producto con el lector o escribe su código de barras</label>
            <div className="pm-code-box">
              <IonIcon icon={barcodeOutline} />
              <input
                id="pm-code"
                ref={codeInput}
                inputMode="numeric"
                autoComplete="off"
                placeholder="7501234567890"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && lookup(code)}
              />
            </div>
            <button type="button" className="pm-internal" onClick={() => lookup(`2${String(Date.now()).slice(-11)}`)}>
              El producto no tiene código · generar uno interno
            </button>
          </div>
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
                  <IonInput className="field" fill="outline" label="Nombre" labelPlacement="stacked" value={draft.name}
                    onIonInput={(e) => set('name', e.detail.value ?? '')} placeholder="Ej. Café Legal 200 g" />
                  {product?.sync && <SyncBadge state={product.sync} />}
                </div>
              </div>
              <div className="pm-two">
                <IonInput
                  className={`field ${dupOther ? 'ion-invalid ion-touched' : ''}`}
                  fill="outline"
                  label="Código de barras"
                  labelPlacement="stacked"
                  inputmode="numeric"
                  value={draft.barcode}
                  errorText={dupOther ? `Ya lo usa: ${dup?.name}` : undefined}
                  onIonInput={(e) => set('barcode', (e.detail.value ?? '').replace(/\s/g, ''))}
                />
                <label className="pm-select">
                  <span>Categoría</span>
                  <select className="fselect" value={draft.category} onChange={(e) => set('category', e.target.value)}>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <div className="pm-two">
                <IonInput className="field" fill="outline" label="Precio de compra" labelPlacement="stacked" inputmode="decimal"
                  value={draft.cost ? String(draft.cost) : ''} onIonInput={(e) => set('cost', Number(e.detail.value) || 0)}>
                  <span slot="start" className="muted">$</span>
                </IonInput>
                <IonInput className="field" fill="outline" label="Precio de venta" labelPlacement="stacked" inputmode="decimal"
                  value={draft.price ? String(draft.price) : ''} onIonInput={(e) => set('price', Number(e.detail.value) || 0)}>
                  <span slot="start" className="muted">$</span>
                </IonInput>
              </div>
              {draft.price > 0 && draft.cost > 0 && (
                <p className={`pm-margin ${margin > 0 ? 'is-ok' : 'is-bad'}`}>
                  {margin > 0
                    ? <>Ganancia de <strong>{money(margin)}</strong> por pieza ({Math.round((margin / draft.price) * 100)} %)</>
                    : 'El precio de venta es menor o igual al de compra'}
                </p>
              )}
              <div className="pm-two">
                <IonInput className="field" fill="outline" label="Existencia" labelPlacement="stacked" inputmode="numeric"
                  value={String(draft.stock)} onIonInput={(e) => set('stock', Number(e.detail.value) || 0)} />
                <IonInput className="field" fill="outline" label="Avisar cuando queden" labelPlacement="stacked" inputmode="numeric"
                  value={String(draft.minStock)} onIonInput={(e) => set('minStock', Number(e.detail.value) || 0)} />
              </div>
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
            <IonButton className="btn-lg" disabled={!valid} onClick={save}>
              <IonIcon slot="start" icon={saveOutline} />
              {isNew ? 'Agregar producto' : 'Guardar cambios'}
            </IonButton>
          </div>
        </>
      )}
    </IonModal>
  );
}
