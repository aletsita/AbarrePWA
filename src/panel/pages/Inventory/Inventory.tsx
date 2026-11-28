import { IonButton, IonContent, IonIcon, IonPage, IonSearchbar, IonSkeletonText } from '@ionic/react';
import {
  add,
  alertCircleOutline,
  barcodeOutline,
  checkmarkCircle,
  chevronDown,
  createOutline,
  cubeOutline,
  trendingDownOutline,
  walletOutline,
} from 'ionicons/icons';
import { useState, type KeyboardEvent } from 'react';
import { BrandMark } from '../../../components/Brand';
import { IsotipoMark } from '../../../components/IsotipoMark';
import { StatCard } from '../../../components/StatCard';
import { SyncBadge } from '../../../components/SyncBadge';
import { useApp, type ProductView } from '../../../context/AppContext';
import { CATEGORIES, categoryColor, money, normalize, stockLevel } from '../../../data/models';
import { qtyText } from '../../../domain/weight';
import { PanelHeader } from '../../components/PanelHeader';
import { ProductModal } from './ProductModal';
import './Inventory.css';

type Filter = 'todos' | 'poco' | 'sin' | 'pendientes';

// Debajo de este margen (sobre el precio de venta) la píldora sale en ámbar
export const LOW_MARGIN = 0.15;

const LEVEL_LABEL = { ok: 'Disponible', poco: 'Poco stock', sin: 'Agotado' } as const;

// Margen sobre la venta; null si falta un precio
const marginOf = (p: ProductView) => (p.price > 0 && p.cost > 0 ? (p.price - p.cost) / p.price : null);

// Relleno de la barra de existencia: 100 % al triple del mínimo de poco stock
const stockFill = (p: ProductView) => (p.stock <= 0 ? 0 : p.minStock > 0 ? Math.min(1, p.stock / (p.minStock * 3)) : 1);

const stockText = (p: ProductView) => (p.saleType === 'peso' ? qtyText(p.stock, p.saleType) : `${p.stock} pzas`);

// Foto real sobre un fondo tintado de su categoría; sin foto, el ícono de producto en gris
function Thumb({ product }: { product: ProductView }) {
  return product.photo ? (
    <span className="inv-thumb" style={{ background: `color-mix(in srgb, ${categoryColor(product.category)} 14%, var(--ab-blanco))` }} aria-hidden="true">
      <img src={product.photo} alt="" />
    </span>
  ) : (
    <span className="inv-thumb is-empty" aria-hidden="true"><IonIcon icon={cubeOutline} /></span>
  );
}

export default function Inventory() {
  const { products, user, ready } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<ProductView>();
  const [adding, setAdding] = useState(false);

  const match = (p: ProductView, f: Filter) =>
    f === 'todos' || (f === 'pendientes' ? !!p.sync : stockLevel(p) === f);
  const count = (f: Filter) => products.filter((p) => match(p, f)).length;
  const q = normalize(query);
  const list = products.filter(
    (p) => (!q || normalize(p.name).includes(q) || p.barcode.includes(q)) && match(p, filter) && (!category || p.category === category),
  );
  const value = products.reduce((n, p) => n + p.stock * p.cost, 0);
  const pendingCount = count('pendientes');
  const toggle = (f: Filter) => setFilter((cur) => (cur === f ? 'todos' : f));
  const retail = products.reduce((n, p) => n + p.stock * p.price, 0);
  const pieces = products.reduce((n, p) => n + p.stock, 0);
  const low = count('poco');
  const out = count('sin');

  const addButton = () =>
    user?.role !== 'Cajero' && (
      <IonButton className="inv-add" onClick={() => setAdding(true)}>
        <IonIcon slot="start" icon={add} />
        Agregar producto
      </IonButton>
    );

  // La fila entera abre el producto; con teclado, Enter o espacio
  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, p: ProductView) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    setEditing(p);
  };

  const filters: [Filter, string, number][] = [
    ['todos', 'Todos', count('todos')],
    ['poco', 'Poco stock', low],
    ['sin', 'Sin stock', out],
    ...(pendingCount > 0 ? [['pendientes', 'Sin subir', pendingCount] as [Filter, string, number]] : []),
  ];

  return (
    <IonPage>
      <PanelHeader title="Inventario" />
      <IonContent className="inv-content">
        <div className="ppage inv-page">
          <div className="ppage-head">
            <div>
              <h1>Inventario</h1>
              <p>{products.length} productos · {pieces} piezas en total</p>
            </div>
            <div className="ppage-actions">{addButton()}</div>
          </div>

          <div className="inv-kpis">
            {/* Valor del inventario: a compra, a venta y la ganancia posible */}
            <section className="inv-hero" aria-label="Valor del inventario">
              <IsotipoMark className="inv-hero-mark" />
              <span className="inv-hero-head">
                <span className="inv-hero-icon"><IonIcon icon={walletOutline} aria-hidden="true" /></span>
                Valor del inventario
              </span>
              <span className="inv-hero-value">
                <strong className="money">{money(value)}</strong>
                <small>a precio de compra</small>
              </span>
              <span className="inv-hero-foot">
                <span>
                  <small>A precio de venta</small>
                  <strong className="money">{money(retail)}</strong>
                </span>
                <span>
                  <small>Ganancia posible</small>
                  <strong className="money is-gain">{money(retail - value)}</strong>
                </span>
              </span>
            </section>
            <StatCard className="inv-kpi" tone="primary" icon={cubeOutline} label="Productos" value={String(products.length)} hint={`${pieces} piezas en total`}
              active={filter === 'todos'} onClick={() => setFilter('todos')} />
            <StatCard className={`inv-kpi ${low ? 'is-warn' : 'is-ok'}`} tone="warning" icon={trendingDownOutline} label="Poco stock" value={String(low)}
              hint={low ? 'Toca para ver cuáles' : <><IonIcon icon={checkmarkCircle} aria-hidden="true" />Todo en orden</>}
              active={filter === 'poco'} onClick={low ? () => toggle('poco') : undefined} />
            <StatCard className={`inv-kpi ${out ? 'is-bad' : 'is-ok'}`} tone="danger" icon={alertCircleOutline} label="Sin stock" value={String(out)}
              hint={out ? 'Se están perdiendo ventas' : <><IonIcon icon={checkmarkCircle} aria-hidden="true" />Nada agotado</>}
              active={filter === 'sin'} onClick={out ? () => toggle('sin') : undefined} />
          </div>

          <div className="inv-tools">
            <IonSearchbar className="inv-search" placeholder="Buscar por nombre o código de barras" value={query} onIonInput={(e) => setQuery(e.detail.value ?? '')} />
            <div className="inv-seg" role="group" aria-label="Filtrar por existencia">
              {filters.map(([id, label, n]) => (
                <button key={id} type="button" className={`inv-seg-btn ${filter === id ? 'is-active' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                  {label}
                  <span className="inv-seg-count">{n}</span>
                </button>
              ))}
            </div>
            <label className="inv-select">
              <span className="sr-only">Categoría</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Todas las categorías</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <IonIcon icon={chevronDown} aria-hidden="true" />
            </label>
          </div>

          <section className="inv-card">
            {ready && list.length === 0 ? (
              <div className="inv-empty">
                <BrandMark size={72} className="inv-empty-mark" />
                <strong>{products.length === 0 ? 'Aún no tienes productos' : 'No encontramos resultados'}</strong>
                <small>{products.length === 0 ? 'Agrégalos con el código de barras o escanéalos con el celular.' : 'Prueba con otro nombre, código, filtro o categoría.'}</small>
                {addButton()}
              </div>
            ) : (
              <>
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="is-cat">Categoría</th>
                      <th className="num">Compra</th>
                      <th className="num">Venta</th>
                      <th className="num is-margin">Margen</th>
                      <th>Existencia</th>
                      <th><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {!ready
                      ? [0, 1, 2, 3, 4].map((k) => (
                          <tr key={k} className="inv-row is-skeleton" aria-hidden="true">
                            <td className="is-main"><span className="cell-product"><IonSkeletonText animated className="sk-thumb" /><IonSkeletonText animated className="sk-name" /></span></td>
                            <td className="is-cat"><IonSkeletonText animated /></td>
                            <td className="is-cost"><IonSkeletonText animated /></td>
                            <td className="is-price"><IonSkeletonText animated /></td>
                            <td className="is-margin"><IonSkeletonText animated /></td>
                            <td className="is-stock"><IonSkeletonText animated /></td>
                            <td className="is-end" />
                          </tr>
                        ))
                      : list.map((p) => {
                          const level = stockLevel(p);
                          const margin = marginOf(p);
                          return (
                            <tr key={p.id} className={`inv-row ${p.sync ? 'is-unsynced' : ''}`} tabIndex={0}
                              onClick={() => setEditing(p)} onKeyDown={(e) => onRowKey(e, p)}>
                              <td className="is-main">
                                <span className="cell-product">
                                  <Thumb product={p} />
                                  <span className="inv-name">
                                    <strong>{p.name}</strong>
                                    <small><IonIcon icon={barcodeOutline} aria-hidden="true" />{p.barcode}</small>
                                    {p.sync && <SyncBadge state={p.sync} />}
                                  </span>
                                </span>
                              </td>
                              <td className="is-cat"><span className="inv-chip">{p.category}</span></td>
                              <td className="num is-cost">{money(p.cost)}</td>
                              <td className="num is-price"><span className="money">{money(p.price)}</span></td>
                              <td className="num is-margin">
                                {margin === null ? (
                                  <span className="inv-margin-none">–</span>
                                ) : (
                                  <span className={`inv-margin ${margin < LOW_MARGIN ? 'is-low' : ''}`}>{Math.round(margin * 100)} %</span>
                                )}
                              </td>
                              <td className="is-stock">
                                <span className="inv-stock-top">
                                  <span>{stockText(p)}</span>
                                  <span className={`inv-level is-${level}`}>{LEVEL_LABEL[level]}</span>
                                </span>
                                <span className={`inv-bar is-${level}`} aria-hidden="true"><span style={{ width: `${stockFill(p) * 100}%` }} /></span>
                              </td>
                              <td className="is-end">
                                <IonButton fill="clear" className="inv-edit" aria-label={`Editar ${p.name}`} onClick={(e) => { e.stopPropagation(); setEditing(p); }}>
                                  <IonIcon slot="icon-only" icon={createOutline} />
                                </IonButton>
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
                {ready && (
                  <div className="inv-foot">
                    <span>Mostrando {list.length} de {products.length} productos</span>
                    <span className="inv-legend"><i aria-hidden="true" />Margen menor a {Math.round(LOW_MARGIN * 100)} %</span>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </IonContent>

      <ProductModal
        isOpen={adding || !!editing}
        product={editing}
        onClose={() => {
          setEditing(undefined);
          setAdding(false);
        }}
      />
    </IonPage>
  );
}
