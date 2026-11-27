import { IonButton, IonIcon } from '@ionic/react';
import { add, checkmark, closeOutline } from 'ionicons/icons';
import { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { categoryList } from '../data/models';
import { SelectField, TextField } from './Form';
import './CategoryField.css';

// Selector de categoría con «+» para crear una propia. La categoría nueva se guarda con el producto
// (es su nombre, igual que las de siempre), queda elegida y aparece en el selector.
export function CategoryField({ value, onChange, className = '' }: { value: string; onChange: (c: string) => void; className?: string }) {
  const { products } = useApp();
  const [mine, setMine] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = categoryList(products, [...mine, value]);

  const clean = name.trim().replace(/\s+/g, ' ');
  const taken = list.find((c) => c.toLocaleLowerCase('es') === clean.toLocaleLowerCase('es'));
  const error = !clean ? 'Escribe el nombre de la categoría' : taken ? `Ya existe «${taken}»` : '';

  const close = () => {
    setAdding(false);
    setName('');
    setTried(false);
  };
  const create = () => {
    setTried(true);
    if (error) return input.current?.focus();
    const c = clean.charAt(0).toLocaleUpperCase('es') + clean.slice(1);
    setMine((m) => [...m, c]);
    onChange(c);
    close();
  };

  return (
    <div className={`cat-field ${className}`}>
      <div className="cat-field-row">
        <SelectField label="Categoría" value={value} onChange={onChange}>
          {list.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </SelectField>
        <button
          type="button"
          className={`cat-field-add ${adding ? 'is-open' : ''}`}
          onClick={() => {
            if (adding) return close();
            setAdding(true);
            setTimeout(() => input.current?.focus(), 50);
          }}
          aria-expanded={adding}
          aria-label={adding ? 'Cerrar nueva categoría' : 'Crear categoría'}
          title="Crear categoría"
        >
          <IonIcon icon={adding ? closeOutline : add} aria-hidden="true" />
        </button>
      </div>
      {adding && (
        <div className="cat-field-new">
          <TextField
            label="Nueva categoría"
            placeholder="Ej. Dulcería"
            maxLength={30}
            inputRef={input}
            value={name}
            error={tried && error}
            onChange={setName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                create();
              }
              if (e.key === 'Escape') {
                e.stopPropagation();
                close();
              }
            }}
          />
          <div className="cat-field-actions">
            <IonButton fill="outline" size="small" onClick={close}>
              Cancelar
            </IonButton>
            <IonButton size="small" onClick={create}>
              <IonIcon slot="start" icon={checkmark} />
              Crear y elegir
            </IonButton>
          </div>
        </div>
      )}
    </div>
  );
}
