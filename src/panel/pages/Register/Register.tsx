import {
  IonButton,
  IonContent,
  IonFooter,
  IonIcon,
  IonPage,
  IonToolbar,
  useIonAlert,
  useIonRouter,
  useIonToast,
  useIonViewDidEnter,
  useIonViewWillLeave,
} from '@ionic/react';
import {
  add,
  barcodeOutline,
  cashOutline,
  closeCircleOutline,
  handLeftOutline,
  linkOutline,
  phonePortraitOutline,
  remove,
  trashOutline,
  trendingUpOutline,
} from 'ionicons/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BarcodeSearch, type BarcodeSearchHandle } from '../../../components/BarcodeSearch';
import { ProductThumb } from '../../../components/ProductThumb';
import { useApp, type ProductView } from '../../../context/AppContext';
import { money, type Product } from '../../../data/models';
import { ago, useNow } from '../../../hooks/useNow';
import { PanelHeader } from '../../components/PanelHeader';
import { ProductModal } from '../Inventory/ProductModal';
import { CheckoutModal } from './CheckoutModal';
import './Register.css';

function LiveDevice() {
  const { devices, lastScan, isLive } = useApp();
  const router = useIonRouter();
  const now = useNow(1000);
  const connected = devices.filter((d) => isLive(d.id));
  const scanning = lastScan && now - lastScan.at < 6000;
  const lastName = lastScan && devices.find((d) => d.id === lastScan.deviceId)?.name;

  return (
    <section className={`live-device ${scanning && connected.length ? 'is-live' : ''} ${connected.length ? '' : 'is-off'}`}>
      <div className="live-head">
        <span className="live-icon">
          <IonIcon icon={phonePortraitOutline} />
          {connected.length > 0 && <span className="live-pulse" />}
        </span>
        <div>
          <strong>
            {connected.length === 0 ? 'Ningún celular conectado' : connected.length === 1 ? connected[0].name : `${connected.length} celulares conectados`}
          </strong>
          <span>{connected.length === 0 ? 'Abre Abarré en el celular vinculado' : scanning ? 'Escaneando…' : 'Listo para escanear'}</span>
        </div>
      </div>
      {lastScan && (
        <p className="live-last">
          Último: <strong>{lastScan.name}</strong> · {ago(lastScan.at, now)}
          {lastName && connected.length > 1 ? ` · ${lastName}` : ''}
        </p>
      )}
      {devices.length === 0 && (
        <button type="button" className="live-link" onClick={() => router.push('/panel/dispositivos')}>
          <IonIcon icon={linkOutline} /> Vincular un celular
        </button>
      )}
    </section>
  );
}

// Los productos que más salen, para agregarlos con un toque (pan, tortillas, refrescos…)
function QuickPicks({ onPick }: { onPick: (p: ProductView) => void }) {
  const { products, sales, ticket } = useApp();
  const picks = useMemo(() => {
    const sold = new Map<string, number>();
    sales.forEach((s) => s.items.forEach((i) => sold.set(i.productId, (sold.get(i.productId) ?? 0) + i.qty)));
    return [...products].sort((a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0)).slice(0, 10);
  }, [products, sales]);
  if (!picks.length) return null;

  return (
    <div className="quick">
      <span className="quick-label"><IonIcon icon={trendingUpOutline} /> Más vendidos</span>
      <div className="quick-row" role="list">
        {picks.map((p) => {
          const inTicket = ticket.find((l) => l.product.id === p.id)?.qty;
          return (
            <button key={p.id} type="button" role="listitem" className="quick-item" onClick={() => onPick(p)} title={`Agregar ${p.name}`}>
              <ProductThumb product={p} size={34} />
              <span className="quick-text">
                <strong>{p.name}</strong>
                <span className="money">{money(p.price)}</span>
              </span>
              {inTicket && <span className="quick-count">{inTicket}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Register() {
  const { ticket, ticketTotal, ticketCount, ticketAdd, ticketQty, ticketRemove, ticketClear, products } = useApp();
  const [alert] = useIonAlert();
  const [toast] = useIonToast();
  const [payOpen, setPayOpen] = useState(false);
  const [newCode, setNewCode] = useState<string>();
  const search = useRef<BarcodeSearchHandle>(null);

  const active = useRef(false);

  useIonViewDidEnter(() => {
    active.current = true;
    search.current?.focus();
  });
  useIonViewWillLeave(() => {
    active.current = false;
  });

  // Atajos de teclado de la caja: F2 buscar, F12 cobrar
  const hasItems = ticket.length > 0;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!active.current || payOpen || newCode) return;
      if (e.key === 'F2') {
        e.preventDefault();
        search.current?.focus();
      } else if (e.key === 'F12' && hasItems) {
        e.preventDefault();
        setPayOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payOpen, newCode, hasItems]);

  const addProduct = (p: Product, qty: number) => {
    ticketAdd(p, qty);
    if (p.stock < qty) {
      toast({
        message: `${p.name}: el inventario marca ${p.stock} ${p.stock === 1 ? 'pieza' : 'piezas'}`,
        duration: 2200,
        color: 'warning',
        position: 'top',
        cssClass: 'toast-app',
      });
    }
  };

  const cancel = () =>
    alert({
      header: '¿Cancelar la venta?',
      message: 'Se quitarán todos los productos de la cuenta.',
      buttons: [
        { text: 'No', role: 'cancel' },
        { text: 'Cancelar venta', role: 'destructive', handler: ticketClear },
      ],
    });

  const iva = ticketTotal - ticketTotal / 1.16;

  return (
    <IonPage>
      <PanelHeader title="Caja" />
      <IonContent>
        <div className="ppage reg-grid">
          <section className="pcard reg-ticket">
            <div className="reg-search">
              <BarcodeSearch
                ref={search}
                products={products}
                onPick={addProduct}
                onMissing={setNewCode}
                placeholder="Escanea o escribe el código de barras"
                autoFocus
                allowQty
                size="lg"
              />
              <p className="reg-hint">
                <span><kbd>Enter</kbd> agrega</span>
                <span><kbd>3*</kbd> antes del código para varias piezas</span>
                <span><kbd>F2</kbd> buscar</span>
                <span><kbd>F12</kbd> cobrar</span>
              </p>
              <QuickPicks onPick={(p) => addProduct(p, 1)} />
            </div>

            <div className="pcard-head reg-head">
              <h2>Cuenta actual</h2>
              <span className="reg-count">{ticketCount} {ticketCount === 1 ? 'artículo' : 'artículos'}</span>
            </div>

            {ticket.length === 0 ? (
              <div className="reg-empty">
                <span className="reg-empty-icon"><IonIcon icon={barcodeOutline} /></span>
                <h3>La cuenta está vacía</h3>
                <p>Escanea con el lector o con el celular vinculado, escribe el código arriba o toca uno de los más vendidos.</p>
              </div>
            ) : (
              <div className="reg-table" role="table" aria-label="Productos de la cuenta">
                <div className="reg-row reg-th" role="row">
                  <span role="columnheader">Producto</span>
                  <span role="columnheader" className="c-qty">Cantidad</span>
                  <span role="columnheader" className="num">Importe</span>
                  <span role="columnheader" className="sr-only">Quitar</span>
                </div>
                {ticket.map((l) => (
                  <div key={`${l.product.id}-${l.flashAt}`} className={`reg-row is-${l.source}`} role="row">
                    <span className="cell-product" role="cell">
                      <ProductThumb product={l.product} size={40} />
                      <span>
                        <strong>{l.product.name}</strong>
                        <span className="unit">{money(l.product.price)} c/u · {l.product.barcode}</span>
                        {l.source === 'movil' ? (
                          <span className="src-tag is-movil"><IonIcon icon={phonePortraitOutline} /> Escaneado desde el celular</span>
                        ) : (
                          <span className="src-tag"><IonIcon icon={handLeftOutline} /> Agregado en caja</span>
                        )}
                      </span>
                    </span>
                    <span className="c-qty" role="cell">
                      <span className="qty-mini">
                        <button type="button" onClick={() => ticketQty(l.product.id, -1)} aria-label="Uno menos">
                          <IonIcon icon={remove} />
                        </button>
                        <span>{l.qty}</span>
                        <button type="button" onClick={() => ticketQty(l.product.id, 1)} aria-label="Uno más">
                          <IonIcon icon={add} />
                        </button>
                      </span>
                    </span>
                    <span className="num c-sub money" role="cell">{money(l.qty * l.product.price)}</span>
                    <span className="c-del" role="cell">
                      <button type="button" onClick={() => ticketRemove(l.product.id)} aria-label={`Quitar ${l.product.name}`}>
                        <IonIcon icon={trashOutline} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="reg-side">
            <section className="pcard reg-summary">
              <dl>
                <div><dt>Artículos</dt><dd>{ticketCount}</dd></div>
                <div><dt>Subtotal</dt><dd className="money">{money(ticketTotal - iva)}</dd></div>
                <div><dt>IVA 16 % incluido</dt><dd className="money">{money(iva)}</dd></div>
              </dl>
              <div className="reg-total">
                <span>Total</span>
                <strong className="money" key={ticketTotal}>{money(ticketTotal)}</strong>
              </div>
              <IonButton expand="block" color="secondary" className="btn-xl reg-pay" disabled={!ticket.length} onClick={() => setPayOpen(true)}>
                <IonIcon slot="start" icon={cashOutline} />
                Cobrar
                <kbd slot="end" className="kbd-on-color">F12</kbd>
              </IonButton>
              <IonButton expand="block" fill="clear" color="danger" className="btn-lg" disabled={!ticket.length} onClick={cancel}>
                <IonIcon slot="start" icon={closeCircleOutline} />
                Cancelar venta
              </IonButton>
            </section>
            <LiveDevice />
          </aside>
        </div>
      </IonContent>

      <IonFooter className="action-footer reg-footer ion-no-border">
        <IonToolbar>
          <div className="reg-foot">
            <div>
              <span>Total · {ticketCount} art.</span>
              <strong className="money">{money(ticketTotal)}</strong>
            </div>
            <IonButton color="secondary" className="btn-xl" disabled={!ticket.length} onClick={() => setPayOpen(true)}>
              Cobrar
            </IonButton>
          </div>
        </IonToolbar>
      </IonFooter>

      <CheckoutModal isOpen={payOpen} onClose={() => { setPayOpen(false); search.current?.focus(); }} />
      <ProductModal
        isOpen={!!newCode}
        barcode={newCode}
        onClose={() => setNewCode(undefined)}
        onSaved={(p, isNew) => isNew && ticketAdd(p, 1)}
      />
    </IonPage>
  );
}
