import {
  IonButton,
  IonContent,
  IonFooter,
  IonIcon,
  IonPage,
  IonToolbar,
  useIonRouter,
  useIonViewDidEnter,
  useIonViewWillLeave,
} from '@ionic/react';
import {
  add,
  alertCircleOutline,
  barcodeOutline,
  cashOutline,
  closeCircleOutline,
  createOutline,
  handLeftOutline,
  linkOutline,
  personAddOutline,
  personOutline,
  phonePortraitOutline,
  remove,
  scaleOutline,
  trashOutline,
  trendingUpOutline,
} from 'ionicons/icons';
import { useMemo, useRef, useState } from 'react';
import { useAppAlert } from '../../../components/AppAlert';
import { BarcodeSearch, type BarcodeSearchHandle } from '../../../components/BarcodeSearch';
import { ProductThumb } from '../../../components/ProductThumb';
import { useApp, type ProductView } from '../../../context/AppContext';
import { availableCredit, money, type Product } from '../../../data/models';
import { availableLabel, clampToAvailable, piecesLabel } from '../../../domain/stock';
import { isWeighed, lineTotal, qtyText, roundQty } from '../../../domain/weight';
import { WeightModal } from '../../../components/WeightModal';
import { ago, useNow } from '../../../hooks/useNow';
import { PanelHeader } from '../../components/PanelHeader';
import { PromptModal } from '../../components/PromptModal';
import { CustomerPicker } from '../Customers/CustomerPicker';
import { ProductModal } from '../Inventory/ProductModal';
import { CheckoutModal } from './CheckoutModal';
import './Register.css';
import { useAviso } from '../../../components/Aviso';

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
  const { products, sales, ticket, availableFor } = useApp();
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
          const out = availableFor(p.id) <= 0;
          return (
            <button
              key={p.id}
              type="button"
              role="listitem"
              className={`quick-item ${out ? 'is-out' : ''}`}
              onClick={() => onPick(p)}
              title={out ? `${p.name}: sin stock` : `Agregar ${p.name}`}
            >
              <ProductThumb product={p} size={34} />
              <span className="quick-text">
                <strong>{p.name}</strong>
                {out ? <span className="stock-out">Sin stock</span> : <span className="money">{money(p.price)}</span>}
              </span>
              {inTicket && <span className="quick-count">{isWeighed(p) ? qtyText(inTicket, 'peso') : inTicket}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Varias cuentas abiertas a la vez: se atiende a otro cliente sin perder lo que ya se escaneó
function AccountTabs({ canAdd }: { canAdd: boolean }) {
  const { accounts, newAccount, switchAccount } = useApp();
  return (
    <nav className="acc-tabs" aria-label="Cuentas abiertas">
      <div className="acc-row">
        {accounts.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`acc-tab ${a.active ? 'is-active' : ''}`}
            aria-current={a.active || undefined}
            onClick={() => !a.active && switchAccount(a.id)}
          >
            <strong>{a.name}</strong>
            <span className="money">{a.count ? `${a.count} art. · ${money(a.total)}` : 'Vacía'}</span>
          </button>
        ))}
        <button type="button" className="acc-new" disabled={!canAdd} onClick={newAccount} title="Deja esta cuenta en espera y abre otra">
          <IonIcon icon={add} />
          <span>Nueva cuenta</span>
        </button>
      </div>
    </nav>
  );
}

export default function Register() {
  const {
    ticket, ticketTotal, ticketCount, ticketAdd, ticketQty, ticketSetQty, ticketRemove, ticketClear, products,
    account, customers, updateAccount, linkCustomer, availableFor, ticketShortages,
  } = useApp();
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const customer = customers.find((c) => c.id === account.customerId);
  const canAddAccount = ticket.length > 0 || !!account.customerId;
  const showAlert = useAppAlert();
  const toast = useAviso();
  const [payOpen, setPayOpen] = useState(false);
  const [newCode, setNewCode] = useState<string>();
  // Producto por peso esperando que se escriba lo que marca la báscula (`kg`: la línea que se está corrigiendo)
  const [weighing, setWeighing] = useState<{ product: Product; kg?: number } | null>(null);
  const search = useRef<BarcodeSearchHandle>(null);

  const active = useRef(false);

  useIonViewDidEnter(() => {
    active.current = true;
    search.current?.focus();
  });
  useIonViewWillLeave(() => {
    active.current = false;
  });

  // Sin stock: alerta como en la móvil (hay que leerla); un tope alcanzado es un aviso breve
  const warn = (message: string, color: 'warning' | 'danger') =>
    color === 'danger'
      ? void showAlert({ tone: 'error', title: 'Sin stock', message: message.replace(/^Sin stock: /, ''), primary: 'Entendido' }).then(() => search.current?.focus())
      : void toast({ message, duration: 2600, color, position: 'top', cssClass: 'toast-app' });

  // Nunca más de lo disponible: existencia − apartado por pedidos − lo que ya está en esta u otras cuentas
  const addProduct = (p: Product, qty: number) => {
    const room = availableFor(p.id);
    if (isWeighed(p) && room > 0) {
      setWeighing({ product: p });
      return;
    }
    const r = clampToAvailable(qty, room);
    if (r.qty === 0) {
      warn(
        p.stock <= 0
          ? `Sin stock: ${p.name} no tiene existencia en inventario.`
          : `Sin stock: ${isWeighed(p) ? 'los' : 'las'} ${piecesLabel(p.stock, p.saleType)} de ${p.name} ya están apartad${isWeighed(p) ? 'os' : 'as'} por pedidos o en cuentas abiertas.`,
        'danger',
      );
      return;
    }
    ticketAdd(p, r.qty);
    if (r.limited) warn(`Solo hay ${availableLabel(room)} de ${p.name}; se agregaron ${r.qty}.`, 'warning');
  };

  const more = (p: Product) => {
    if (availableFor(p.id) <= 0) {
      warn(`Ya no hay más ${p.name} disponible. La cantidad se queda en el máximo.`, 'warning');
      return;
    }
    ticketQty(p.id, 1);
  };
  const shortOf = (id: string) => ticketShortages.find((s) => s.product.id === id);

  // Peso escrito: se agrega como línea nueva o corrige el de la línea que ya estaba
  const onWeight = (kg: number) => {
    if (!weighing) return;
    if (weighing.kg) ticketSetQty(weighing.product.id, kg);
    else ticketAdd(weighing.product, kg);
    setWeighing(null);
    search.current?.focus();
  };
  // Tope de la pesada: lo disponible, más lo que ya tiene la línea si se está corrigiendo
  const weighMax = weighing ? roundQty(availableFor(weighing.product.id) + (weighing.kg ?? 0)) : null;

  const cancel = () =>
    void showAlert({
      tone: 'warning',
      title: '¿Cancelar la venta?',
      message: 'Se quitarán todos los productos de la cuenta.',
      primary: { text: 'Cancelar venta', danger: true },
      secondary: 'No, seguir',
    }).then((yes) => yes && ticketClear());

  const iva = ticketTotal - ticketTotal / 1.16;

  return (
    <IonPage>
      <PanelHeader title="Caja" />
      <IonContent>
        <div className="ppage reg-grid">
          <AccountTabs canAdd={canAddAccount} />
          <section className="pcard reg-ticket">
            <div className="reg-search">
              <BarcodeSearch
                ref={search}
                products={products}
                availableFor={availableFor}
                onPick={addProduct}
                onMissing={setNewCode}
                placeholder="Escanea o escribe el código de barras"
                autoFocus
                allowQty
                size="lg"
              />
              <p className="reg-hint">Para varias piezas escribe la cantidad y un asterisco antes del código, por ejemplo 3*7501055300075.</p>
              <QuickPicks onPick={(p) => addProduct(p, 1)} />
            </div>

            <div className="pcard-head reg-head">
              <div className="reg-acc">
                <button type="button" className="reg-acc-name" onClick={() => setRenaming(true)} title="Cambiar el nombre de la cuenta">
                  <h2>{account.name}</h2>
                  <IonIcon icon={createOutline} />
                </button>
                <button type="button" className={`reg-acc-customer ${customer ? 'is-set' : ''}`} onClick={() => setPicking(true)}>
                  <IonIcon icon={customer ? personOutline : personAddOutline} />
                  {customer ? (
                    <span>
                      {customer.name !== account.name && `${customer.name} · `}
                      <span className="money">{money(availableCredit(customer))}</span> de crédito disponible
                    </span>
                  ) : (
                    <span>Asignar cliente</span>
                  )}
                </button>
              </div>
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
                  <div key={`${l.product.id}-${l.flashAt}`} className={`reg-row is-${l.source} ${shortOf(l.product.id) ? 'is-short' : ''}`} role="row">
                    <span className="cell-product" role="cell">
                      <ProductThumb product={l.product} size={40} />
                      <span>
                        <strong>{l.product.name}</strong>
                        <span className="unit">{money(l.product.price)} {isWeighed(l.product) ? 'por kg' : 'c/u'} · {l.product.barcode}</span>
                        {shortOf(l.product.id) && (
                          <span className="src-tag is-short" role="alert">
                            <IonIcon icon={alertCircleOutline} /> Solo hay {availableLabel(shortOf(l.product.id)!.available, l.product.saleType)}
                          </span>
                        )}
                        {l.source === 'movil' ? (
                          <span className="src-tag is-movil"><IonIcon icon={phonePortraitOutline} /> Escaneado desde el celular</span>
                        ) : (
                          <span className="src-tag"><IonIcon icon={handLeftOutline} /> Agregado en caja</span>
                        )}
                      </span>
                    </span>
                    <span className="c-qty" role="cell">
                      {isWeighed(l.product) ? (
                        <button
                          type="button"
                          className="qty-weight"
                          onClick={() => setWeighing({ product: l.product, kg: l.qty })}
                          aria-label={`Cambiar el peso de ${l.product.name}`}
                        >
                          <IonIcon icon={scaleOutline} />
                          {qtyText(l.qty, 'peso')}
                        </button>
                      ) : (
                      <span className="qty-mini">
                        <button type="button" onClick={() => ticketQty(l.product.id, -1)} aria-label="Uno menos">
                          <IonIcon icon={remove} />
                        </button>
                        <span>{l.qty}</span>
                        <button type="button" onClick={() => more(l.product)} aria-label="Uno más">
                          <IonIcon icon={add} />
                        </button>
                      </span>
                      )}
                    </span>
                    <span className="num c-sub money" role="cell">{money(lineTotal(l.qty, l.product.price, l.product.saleType))}</span>
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
              </IonButton>
              <IonButton expand="block" fill="clear" color="danger" className="btn-lg" disabled={!ticket.length} onClick={cancel}>
                <IonIcon slot="start" icon={closeCircleOutline} />
                Cancelar venta
              </IonButton>
            </section>
            <LiveDevice />
          </aside>
        </div>
        <WeightModal product={weighing?.product ?? null} initialKg={weighing?.kg} max={weighMax} onConfirm={onWeight} onClose={() => setWeighing(null)} />
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

      <PromptModal
        isOpen={renaming}
        title="Nombre de la cuenta"
        text="Para reconocerla rápido entre las cuentas abiertas."
        label="Nombre"
        hint="Ej. el nombre del cliente, «Mesa 2» o «Señor de la gorra»"
        initial={account.name}
        confirmText="Guardar nombre"
        onClose={() => setRenaming(false)}
        onSave={(name) => updateAccount(account.id, name, account.customerId)}
      />
      <CustomerPicker
        isOpen={picking}
        selectedId={account.customerId}
        onClose={() => { setPicking(false); search.current?.focus(); }}
        onPick={(c) => linkCustomer(account.id, c)}
      />
      <CheckoutModal isOpen={payOpen} onClose={() => { setPayOpen(false); search.current?.focus(); }} />
      <ProductModal
        isOpen={!!newCode}
        barcode={newCode}
        onClose={() => setNewCode(undefined)}
        onSaved={(p, isNew) => isNew && addProduct(p, 1)}
      />
    </IonPage>
  );
}
