import { IonIcon } from '@ionic/react';
import { cubeOutline, scaleOutline } from 'ionicons/icons';
import type { SaleType } from '../domain/weight';
import './SaleTypeField.css';

// Cómo se vende: por pieza (se cuentan) o por peso (precio por kg; en caja se escribe lo que marca la báscula)
export function SaleTypeField({ value, onChange }: { value?: SaleType; onChange: (v: SaleType) => void }) {
  const current = value === 'peso' ? 'peso' : 'pieza';
  const option = (v: SaleType, icon: string, title: string, text: string) => (
    <button type="button" role="radio" aria-checked={current === v} className={current === v ? 'is-active' : ''} onClick={() => onChange(v)}>
      <IonIcon icon={icon} aria-hidden="true" />
      <strong>{title}</strong>
      <span>{text}</span>
    </button>
  );
  return (
    <div className="sale-type" role="radiogroup" aria-label="Se vende por">
      {option('pieza', cubeOutline, 'Por pieza', 'Se cuentan piezas')}
      {option('peso', scaleOutline, 'Por peso', 'Precio por kg')}
    </div>
  );
}
