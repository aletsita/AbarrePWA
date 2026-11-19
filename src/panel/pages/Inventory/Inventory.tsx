import { IonButton, IonContent, IonIcon, IonPage, IonSearchbar } from '@ionic/react';
import { add, alertCircleOutline, cubeOutline, createOutline, trendingDownOutline, walletOutline } from 'ionicons/icons';
import { useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { StatCard } from '../../../components/StatCard';
import { ProductThumb } from '../../../components/ProductThumb';
import { StockBadge } from '../../../components/StockBadge';
import { SyncBadge } from '../../../components/SyncBadge';
import { useApp, type ProductView } from '../../../context/AppContext';
import { CATEGORIES, money, normalize, stockLevel } from '../../../data/models';
import { PanelHeader } from '../../components/PanelHeader';
import { ProductModal } from './ProductModal';
import './Inventory.css';

type Filter = 'todos' | 'poco' | 'sin' | 'pendientes';

export default function Inventory() {
  const { products } = useApp();
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

  return (
    <IonPage>
      <PanelHeader title="Inventario" />
      <IonContent>
        <div className="ppage">
          <div className="ppage-head">
            <div>
              <h1>Inventario</h1>
              <p>{products.length} productos · valor a precio de compra {money(value)}</p>
            </div>
            <div className="ppage-actions">
              <IonButton className="btn-lg" onClick={() => setAdding(true)}>
                <IonIcon slot="start" icon={add} />
                Agregar producto
              </IonButton>
            </div>
          </div>

          <div className="kpis">
            <StatCard tone="primary" icon={cubeOutline} label="Productos" value={String(products.length)} hint={`${products.reduce((n, p) => n + p.stock, 0)} piezas en total`}
              active={filter === 'todos'} onClick={() => setFilter('todos')} />
            <StatCard tone="warning" icon={trendingDownOutline} label="Poco stock" value={String(count('poco'))} hint="Toca para ver cuáles"
              active={filter === 'poco'} onClick={() => toggle('poco')} />
            <StatCard tone="danger" icon={alertCircleOutline} label="Sin stock" value={String(count('sin'))} hint="Se están perdiendo ventas"
              active={filter === 'sin'} onClick={() => toggle('sin')} />
            <StatCard tone="success" icon={walletOutline} label="Valor del inventario" value={money(value)} hint={`${money(retail)} a precio de venta`} />
          </div>

          <div className="filters">
            <IonSearchbar placeholder="Buscar por nombre o código de barras" value={query} onIonInput={(e) => setQuery(e.detail.value ?? '')} />
            <div className="fchips" role="group" aria-label="Filtrar">
              <button type="button" className={`fchip ${filter === 'todos' ? 'is-active' : ''}`} onClick={() => setFilter('todos')}>
                Todos · {count('todos')}
              </button>
              <button type="button" className={`fchip tone-warning ${filter === 'poco' ? 'is-active' : ''}`} onClick={() => setFilter('poco')}>
                Poco stock · {count('poco')}
              </button>
              <button type="button" className={`fchip tone-danger ${filter === 'sin' ? 'is-active' : ''}`} onClick={() => setFilter('sin')}>
                Sin stock · {count('sin')}
              </button>
              {pendingCount > 0 && (
                <button type="button" className={`fchip tone-warning ${filter === 'pendientes' ? 'is-active' : ''}`} onClick={() => setFilter('pendientes')}>
                  Sin subir · {pendingCount}
                </button>
              )}
            </div>
            <select className="fselect" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoría">
              <option value="">Todas las categorías</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          <section className="pcard">
            {list.length === 0 ? (
              <EmptyState
                art={products.length === 0 ? 'box' : 'search'}
                title={products.length === 0 ? 'Aún no hay productos' : 'Sin resultados'}
                text={products.length === 0 ? 'Agrégalos con el código de barras o escanéalos con el celular.' : 'Prueba con otro nombre, código, filtro o categoría.'}
              />
            ) : (
              <table className="ptable is-cards">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th className="num">Compra</th>
                    <th className="num">Venta</th>
                    <th>Existencia</th>
                    <th><span className="sr-only">Editar</span></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id} className={`is-click inv-row lvl-${stockLevel(p)} ${p.sync ? 'is-unsynced' : ''}`} onClick={() => setEditing(p)}>
                      <td className="is-main">
                        <span className="cell-product">
                          <ProductThumb product={p} size={38} />
                          <span>
                            <strong>{p.name}</strong>
                            <small>{p.barcode}</small>
                            {p.sync && <SyncBadge state={p.sync} />}
                          </span>
                        </span>
                      </td>
                      <td data-label="Categoría">{p.category}</td>
                      <td className="num" data-label="Compra">{money(p.cost)}</td>
                      <td className="num strong" data-label="Venta">{money(p.price)}</td>
                      <td data-label="Existencia"><StockBadge product={p} /></td>
                      <td className="is-end">
                        <IonButton fill="clear" size="small" aria-label={`Editar ${p.name}`}>
                          <IonIcon slot="icon-only" icon={createOutline} />
                        </IonButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
