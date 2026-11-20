import { IonButton, IonIcon } from '@ionic/react';
import { checkmarkCircle, gridOutline, printOutline } from 'ionicons/icons';
import { useApp } from '../../../context/AppContext';
import { money, time, type CashCut } from '../../../data/models';
import { downloadCutCsv, printCut } from '../../../lib/print';

export function Difference({ value, big }: { value: number; big?: boolean }) {
  const tone = Math.abs(value) < 0.005 ? 'is-even' : value > 0 ? 'is-over' : 'is-short';
  const label = tone === 'is-even' ? 'Cuadra exacto' : tone === 'is-over' ? 'Sobrante' : 'Faltante';
  return (
    <span className={`diff ${tone} ${big ? 'is-big' : ''}`}>
      <span>{label}</span>
      <strong className="money">{tone === 'is-even' ? money(0) : `${value > 0 ? '+' : '−'}${money(Math.abs(value))}`}</strong>
    </span>
  );
}

export function ClosedCut({ cut }: { cut: CashCut }) {
  const { store } = useApp();
  const avg = cut.salesCount ? cut.salesTotal / cut.salesCount : 0;

  return (
    <article className="closed">
      <header className="closed-head">
        <IonIcon icon={checkmarkCircle} />
        <div>
          <h2>Corte #{cut.folio} cerrado</h2>
          <p>
            {new Date(cut.date).toLocaleDateString('es-MX', { dateStyle: 'full' })} · {time(cut.date)} · {cut.employee}
          </p>
        </div>
      </header>

      <div className="closed-grid">
        <section>
          <h3>Ventas</h3>
          <dl>
            <div><dt>Total vendido</dt><dd className="money">{money(cut.salesTotal)}</dd></div>
            <div><dt>Número de ventas</dt><dd>{cut.salesCount}</dd></div>
            <div><dt>Ticket promedio</dt><dd className="money">{money(avg)}</dd></div>
            <div><dt>En tienda</dt><dd className="money">{money(cut.storeSales ?? cut.salesTotal - (cut.pickupSales ?? 0))}</dd></div>
            <div><dt>Pide y recoge</dt><dd className="money">{money(cut.pickupSales ?? 0)}</dd></div>
            <div><dt>Efectivo</dt><dd className="money">{money(cut.cashSales)}</dd></div>
            <div><dt>Tarjeta</dt><dd className="money">{money(cut.cardSales)}</dd></div>
            <div><dt>Transferencia</dt><dd className="money">{money(cut.transferSales)}</dd></div>
            <div><dt>A crédito</dt><dd className="money">{money(cut.creditSales ?? 0)}</dd></div>
            <div><dt>Abonos de clientes</dt><dd className="money">{money(cut.creditPaid ?? 0)}</dd></div>
          </dl>
        </section>
        <section>
          <h3>Caja</h3>
          <dl>
            <div><dt>Fondo inicial</dt><dd className="money">{money(cut.openingFund)}</dd></div>
            <div><dt>+ Ventas en efectivo</dt><dd className="money">{money(cut.cashSales)}</dd></div>
            <div><dt>+ Abonos en efectivo</dt><dd className="money">{money(cut.creditCash ?? 0)}</dd></div>
            <div><dt>+ Entradas</dt><dd className="money">{money(cut.cashIn)}</dd></div>
            <div><dt>− Salidas</dt><dd className="money">{money(cut.cashOut)}</dd></div>
            <div className="is-strong"><dt>Efectivo esperado</dt><dd className="money">{money(cut.expectedCash)}</dd></div>
            <div className="is-strong"><dt>Efectivo contado</dt><dd className="money">{money(cut.countedCash)}</dd></div>
          </dl>
          <Difference value={cut.countedCash - cut.expectedCash} big />
        </section>
      </div>

      <footer className="closed-actions">
        <IonButton fill="outline" className="btn-lg" onClick={() => downloadCutCsv(cut, store)}>
          <IonIcon slot="start" icon={gridOutline} />
          Descargar Excel
        </IonButton>
        <IonButton className="btn-lg" onClick={() => printCut(cut, store)}>
          <IonIcon slot="start" icon={printOutline} />
          Imprimir o guardar PDF
        </IonButton>
      </footer>
    </article>
  );
}
