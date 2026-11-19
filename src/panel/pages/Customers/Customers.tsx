import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonModal, IonPage, IonSearchbar, IonTitle, IonToolbar } from '@ionic/react';
import {
  add,
  alertCircleOutline,
  arrowDownCircleOutline,
  arrowUpCircleOutline,
  callOutline,
  closeOutline,
  createOutline,
  peopleOutline,
  walletOutline,
} from 'ionicons/icons';
import { useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { StatCard } from '../../../components/StatCard';
import { useApp } from '../../../context/AppContext';
import { availableCredit, initials, money, normalize, PAYMENT_LABEL, shortDate, time, type Customer } from '../../../data/models';
import { PanelHeader } from '../../components/PanelHeader';
import { CreditPaymentModal } from './CreditPaymentModal';
import { CustomerModal } from './CustomerModal';
import '../CashCut/CashCut.css';
import './Customers.css';

type Filter = 'todos' | 'deben' | 'limite';

// Qué tanto del crédito ya está usado: verde, amarillo al pasar del 75 %, rojo al llegar al límite
function CreditMeter({ c }: { c: Customer }) {
  const used = c.creditLimit ? Math.min(1, c.balance / c.creditLimit) : c.balance > 0 ? 1 : 0;
  const tone = used >= 1 ? 'is-full' : used >= 0.75 ? 'is-high' : '';
  return (
    <span className={`cu-meter ${tone}`} title={`${Math.round(used * 100)} % del crédito usado`}>
      <span style={{ width: `${used * 100}%` }} />
    </span>
  );
}

function CustomerDetail({ customer, onClose, onEdit, onPay }: { customer?: Customer; onClose: () => void; onEdit: () => void; onPay: () => void }) {
  const { creditMovements, sales } = useApp();
  const moves = customer ? creditMovements.filter((m) => m.customerId === customer.id) : [];
  const bought = customer ? sales.filter((s) => s.customerId === customer.id) : [];

  return (
    <IonModal isOpen={!!customer} onDidDismiss={onClose} className="pmodal is-wide">
      {customer && (
        <>
          <IonHeader className="ion-no-border">
            <IonToolbar>
              <IonTitle>{customer.name}</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={onClose} aria-label="Cerrar"><IonIcon slot="icon-only" icon={closeOutline} /></IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <div className="pmodal-body">
            <div className="cu-summary">
              <div className={customer.balance > 0 ? 'is-debt' : ''}>
                <span>Debe</span>
                <strong className="money">{money(customer.balance)}</strong>
              </div>
              <div>
                <span>Crédito disponible</span>
                <strong className="money">{money(availableCredit(customer))}</strong>
              </div>
              <div>
                <span>Límite</span>
                <strong className="money">{money(customer.creditLimit)}</strong>
              </div>
            </div>
            <CreditMeter c={customer} />
            <p className="cu-facts">
              {customer.phone && <span><IonIcon icon={callOutline} /> {customer.phone}</span>}
              <span>{bought.length} {bought.length === 1 ? 'compra' : 'compras'} · cliente desde {shortDate(customer.createdAt)}</span>
              {customer.note && <span>{customer.note}</span>}
            </p>

            <h3 className="cu-h3">Movimientos de crédito</h3>
            {moves.length === 0 ? (
              <p className="muted">Todavía no ha comprado a crédito.</p>
            ) : (
              <ul className="cu-moves">
                {moves.map((m) => (
                  <li key={m.id}>
                    <span className={`cm-icon ${m.type === 'cargo' ? 't-gasto' : 't-entrada'}`}>
                      <IonIcon icon={m.type === 'cargo' ? arrowUpCircleOutline : arrowDownCircleOutline} />
                    </span>
                    <span className="cm-text">
                      <strong>{m.type === 'cargo' ? `Compra a crédito · ${m.note}` : m.note}</strong>
                      <span className="muted">
                        {shortDate(m.date)} · {time(m.date)} · {m.employee}
                        {m.method && ` · ${PAYMENT_LABEL[m.method]}`}
                      </span>
                    </span>
                    <span className={`money cm-amt ${m.type === 'cargo' ? 'is-out' : 'is-in'}`}>
                      {m.type === 'cargo' ? '+' : '−'}{money(m.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="pmodal-foot">
            <IonButton fill="outline" className="btn-lg" onClick={onEdit}>
              <IonIcon slot="start" icon={createOutline} />
              Editar
            </IonButton>
            <IonButton color="success" className="btn-lg" disabled={customer.balance <= 0} onClick={onPay}>
              <IonIcon slot="start" icon={walletOutline} />
              Registrar abono
            </IonButton>
          </div>
        </>
      )}
    </IonModal>
  );
}

export default function Customers() {
  const { customers } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [detailId, setDetailId] = useState<string>();
  const [payingId, setPayingId] = useState<string>();

  // Por id para que los modales muestren el saldo al día después de cada abono
  const byId = (id?: string) => customers.find((c) => c.id === id);
  const atLimit = (c: Customer) => c.balance > 0 && availableCredit(c) <= 0;
  const match = (c: Customer, f: Filter) => f === 'todos' || (f === 'deben' ? c.balance > 0 : atLimit(c));
  const count = (f: Filter) => customers.filter((c) => match(c, f)).length;
  const q = normalize(query);
  const list = customers
    .filter((c) => (!q || normalize(c.name).includes(q) || c.phone.includes(query.trim())) && match(c, filter))
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
  const owed = customers.reduce((n, c) => n + c.balance, 0);
  const available = customers.reduce((n, c) => n + availableCredit(c), 0);

  return (
    <IonPage>
      <PanelHeader title="Clientes" />
      <IonContent>
        <div className="ppage">
          <div className="ppage-head">
            <div>
              <h1>Clientes</h1>
              <p>{customers.length} clientes · te deben <strong className="money">{money(owed)}</strong></p>
            </div>
            <div className="ppage-actions">
              <IonButton className="btn-lg" onClick={() => setAdding(true)}>
                <IonIcon slot="start" icon={add} />
                Nuevo cliente
              </IonButton>
            </div>
          </div>

          <div className="kpis">
            <StatCard tone="primary" icon={peopleOutline} label="Clientes" value={String(customers.length)}
              active={filter === 'todos'} onClick={() => setFilter('todos')} />
            <StatCard tone="warning" icon={walletOutline} label="Por cobrar" value={money(owed)} hint={`${count('deben')} con saldo pendiente`}
              active={filter === 'deben'} onClick={() => setFilter((f) => (f === 'deben' ? 'todos' : 'deben'))} />
            <StatCard tone="danger" icon={alertCircleOutline} label="Sin crédito" value={String(count('limite'))} hint="Llegaron a su límite"
              active={filter === 'limite'} onClick={() => setFilter((f) => (f === 'limite' ? 'todos' : 'limite'))} />
            <StatCard tone="success" icon={arrowDownCircleOutline} label="Crédito disponible" value={money(available)} hint="Entre todos los clientes" />
          </div>

          <div className="filters">
            <IonSearchbar placeholder="Buscar por nombre o teléfono" value={query} onIonInput={(e) => setQuery(e.detail.value ?? '')} />
          </div>

          <section className="pcard">
            {list.length === 0 ? (
              <EmptyState
                art={customers.length === 0 ? 'cart' : 'search'}
                title={customers.length === 0 ? 'Aún no hay clientes' : 'Sin resultados'}
                text={customers.length === 0 ? 'Da de alta a quien te compra fiado para llevar su cuenta.' : 'Prueba con otro nombre, teléfono o filtro.'}
              />
            ) : (
              <table className="ptable is-cards">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Teléfono</th>
                    <th className="num">Debe</th>
                    <th>Crédito usado</th>
                    <th className="num">Disponible</th>
                    <th><span className="sr-only">Abonar</span></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id} className="is-click" onClick={() => setDetailId(c.id)}>
                      <td className="is-main">
                        <span className="cell-product">
                          <span className="cu-avatar">{initials(c.name)}</span>
                          <span>
                            <strong>{c.name}</strong>
                            {c.note && <small>{c.note}</small>}
                          </span>
                        </span>
                      </td>
                      <td data-label="Teléfono">{c.phone || '—'}</td>
                      <td className={`num strong ${c.balance > 0 ? 'cu-debt' : ''}`} data-label="Debe">{money(c.balance)}</td>
                      <td data-label="Usado"><CreditMeter c={c} /></td>
                      <td className="num" data-label="Disponible">{money(availableCredit(c))}</td>
                      <td className="is-end">
                        {c.balance > 0 && (
                          <IonButton fill="outline" size="small" onClick={(e) => { e.stopPropagation(); setPayingId(c.id); }}>
                            Abonar
                          </IonButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </IonContent>

      <CustomerDetail
        customer={byId(detailId)}
        onClose={() => setDetailId(undefined)}
        onEdit={() => setEditingId(detailId)}
        onPay={() => setPayingId(detailId)}
      />
      <CustomerModal isOpen={adding || !!editingId} customer={byId(editingId)} onClose={() => { setAdding(false); setEditingId(undefined); }} />
      <CreditPaymentModal customer={byId(payingId)} onClose={() => setPayingId(undefined)} />
    </IonPage>
  );
}
