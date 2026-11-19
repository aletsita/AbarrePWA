import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonModal, IonPage, IonTitle, IonToolbar } from '@ionic/react';
import {
  basketOutline,
  cardOutline,
  cashOutline,
  closeOutline,
  downloadOutline,
  printOutline,
  receiptOutline,
  swapHorizontalOutline,
  trendingUpOutline,
} from 'ionicons/icons';
import { useState } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { StatCard } from '../../../components/StatCard';
import { SyncBadge } from '../../../components/SyncBadge';
import { useApp } from '../../../context/AppContext';
import { money, PAYMENT_LABEL, shortDate, time, type PaymentMethod, type Sale } from '../../../data/models';
import { downloadSalesCsv, printSale } from '../../../lib/print';
import { PanelHeader } from '../../components/PanelHeader';
import './Sales.css';

const METHOD_ICON: Record<PaymentMethod, string> = { efectivo: cashOutline, tarjeta: cardOutline, transferencia: swapHorizontalOutline };
type Range = 'hoy' | 'ayer' | 'semana' | 'todo';
const RANGE_LABEL: Record<Range, string> = { hoy: 'Hoy', ayer: 'Ayer', semana: 'Últimos 7 días', todo: 'Todo' };

function inRange(iso: string, r: Range) {
  const d = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = 86400000;
  if (r === 'hoy') return d >= start;
  if (r === 'ayer') return d >= new Date(start.getTime() - day) && d < start;
  if (r === 'semana') return d >= new Date(start.getTime() - 6 * day);
  return true;
}

export default function Sales() {
  const { sales, users, store, ticketConfig } = useApp();
  const [range, setRange] = useState<Range>('hoy');
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [employee, setEmployee] = useState('');
  const [detail, setDetail] = useState<Sale>();

  const list = sales.filter(
    (s) => inRange(s.date, range) && (!method || s.method === method) && (!employee || s.employee === employee),
  );
  const total = list.reduce((n, s) => n + s.total, 0);
  const pieces = list.reduce((n, s) => n + s.items.reduce((m, i) => m + i.qty, 0), 0);
  const cash = list.filter((s) => s.method === 'efectivo').reduce((n, s) => n + s.total, 0);
  const employees = [...new Set([...users.map((u) => u.name), ...sales.map((s) => s.employee)])];

  return (
    <IonPage>
      <PanelHeader title="Ventas" />
      <IonContent>
        <div className="ppage">
          <div className="ppage-head">
            <div>
              <h1>Ventas</h1>
              <p>
                {list.length} {list.length === 1 ? 'venta' : 'ventas'} · <strong className="money">{money(total)}</strong> · {RANGE_LABEL[range].toLowerCase()}
              </p>
            </div>
            <div className="ppage-actions">
              <IonButton fill="outline" className="btn-lg" disabled={!list.length} onClick={() => downloadSalesCsv(list, store, RANGE_LABEL[range])}>
                <IonIcon slot="start" icon={downloadOutline} />
                Exportar a Excel
              </IonButton>
            </div>
          </div>

          <div className="kpis">
            <StatCard tone="accent" icon={trendingUpOutline} label="Vendido" value={money(total)} hint={RANGE_LABEL[range]} />
            <StatCard tone="primary" icon={receiptOutline} label="Ventas" value={String(list.length)} hint={`${pieces} piezas`} />
            <StatCard tone="success" icon={basketOutline} label="Ticket promedio" value={money(list.length ? total / list.length : 0)} />
            <StatCard tone="warning" icon={cashOutline} label="En efectivo" value={money(cash)} hint={total ? `${Math.round((cash / total) * 100)} % del total` : undefined} />
          </div>

          <div className="filters">
            <div className="fchips" role="group" aria-label="Periodo">
              {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
                <button key={r} type="button" className={`fchip ${range === r ? 'is-active' : ''}`} onClick={() => setRange(r)}>
                  {RANGE_LABEL[r]}
                </button>
              ))}
            </div>
            <select className="fselect" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')} aria-label="Método de pago">
              <option value="">Todos los métodos</option>
              {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_LABEL[m]}</option>)}
            </select>
            <select className="fselect" value={employee} onChange={(e) => setEmployee(e.target.value)} aria-label="Empleado">
              <option value="">Todos los empleados</option>
              {employees.map((e) => <option key={e}>{e}</option>)}
            </select>
          </div>

          <section className="pcard">
            {list.length === 0 ? (
              <EmptyState art="search" title="No hay ventas con estos filtros" text="Cambia el periodo, el método de pago o el empleado." />
            ) : (
              <table className="ptable is-cards">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Fecha y hora</th>
                    <th>Empleado</th>
                    <th className="num">Artículos</th>
                    <th>Pago</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((s) => (
                    <tr key={s.id} className={`is-click ${s.pending ? 'is-unsynced' : ''}`} onClick={() => setDetail(s)}>
                      <td className="is-main strong">
                        #{s.folio} {s.pending && <SyncBadge state="pendiente" compact />}
                      </td>
                      <td data-label="Fecha">{shortDate(s.date)} · {time(s.date)}</td>
                      <td data-label="Empleado">{s.employee}</td>
                      <td className="num" data-label="Artículos">{s.items.reduce((n, i) => n + i.qty, 0)}</td>
                      <td data-label="Pago">
                        <span className={`pill is-${s.method}`}><IonIcon icon={METHOD_ICON[s.method]} />{PAYMENT_LABEL[s.method]}</span>
                      </td>
                      <td className="num strong is-end sales-total">{money(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </IonContent>

      <IonModal isOpen={!!detail} onDidDismiss={() => setDetail(undefined)} className="pmodal">
        {detail && (
          <>
            <IonHeader className="ion-no-border">
              <IonToolbar>
                <IonTitle>Venta #{detail.folio}</IonTitle>
                <IonButtons slot="end">
                  <IonButton onClick={() => setDetail(undefined)} aria-label="Cerrar">
                    <IonIcon slot="icon-only" icon={closeOutline} />
                  </IonButton>
                </IonButtons>
              </IonToolbar>
            </IonHeader>
            <div className="pmodal-body">
              <dl className="sd-facts">
                <div><dt>Fecha</dt><dd>{new Date(detail.date).toLocaleDateString('es-MX', { dateStyle: 'long' })} · {time(detail.date)}</dd></div>
                <div><dt>Atendió</dt><dd>{detail.employee}</dd></div>
                <div><dt>Pago</dt><dd><span className={`pill is-${detail.method}`}><IonIcon icon={METHOD_ICON[detail.method]} />{PAYMENT_LABEL[detail.method]}</span></dd></div>
                {detail.pending && <div><dt>Estado</dt><dd><SyncBadge state="pendiente" /></dd></div>}
              </dl>
              <table className="ptable sd-items">
                <thead><tr><th>Producto</th><th className="num">Cant.</th><th className="num">Precio</th><th className="num">Importe</th></tr></thead>
                <tbody>
                  {detail.items.map((i) => (
                    <tr key={i.productId}>
                      <td>{i.name}</td>
                      <td className="num">{i.qty}</td>
                      <td className="num">{money(i.price)}</td>
                      <td className="num strong">{money(i.qty * i.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="sd-total">
                <span>Total</span>
                <strong className="money">{money(detail.total)}</strong>
              </div>
              {detail.method === 'efectivo' && detail.paid && (
                <p className="sd-paid">Pagó con {money(detail.paid)} · cambio {money(detail.paid - detail.total)}</p>
              )}
            </div>
            <div className="pmodal-foot">
              <IonButton fill="outline" className="btn-lg" onClick={() => printSale(detail, store, ticketConfig)}>
                <IonIcon slot="start" icon={printOutline} />
                Reimprimir ticket
              </IonButton>
            </div>
          </>
        )}
      </IonModal>
    </IonPage>
  );
}
