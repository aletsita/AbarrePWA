import { IonButton, IonIcon } from '@ionic/react';
import { add, checkmark } from 'ionicons/icons';
import { useId, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { categoryList } from '../data/models';
import { TextField } from './Form';
import './CategoryField.css';

// Categoría en chips, con «+ Nueva» para crear una propia. La categoría nueva se guarda con el producto
// (es su nombre, igual que las de siempre), queda elegida y aparece entre los chips.
export function CategoryField({ value, onChange, className = '' }: { value: string; onChange: (c: string) => void; className?: string }) {
  const { products } = useApp();
  const labelId = useId();
  const [mine, setMine] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);
  const list = categoryList(products, [...mine, value]);

  const clean = name.trim().replace(/\s+/g, ' ');
  const taken = list.find((c) => c.toLocaleLowerCase('es') === clean.toLocaleLowerCase('es'));
  const error = !clean ? 'Escribe el nombre de la categoría' : taken ? `Ya existe «${taken}»` : '';

  const close = () => {
    setAdding(false);
    setName('');
    setTried(false);
    setTimeout(() => addBtn.current?.focus(), 0);
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
      <span className="fld-label" id={labelId}>
        Categoría
      </span>
      <div className="cat-chips" role="radiogroup" aria-labelledby={labelId}>
        {list.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={c === value} className={`cat-chip ${c === value ? 'is-active' : ''}`} onClick={() => onChange(c)}>
            {c === value && <IonIcon icon={checkmark} aria-hidden="true" />}
            <span>{c}</span>
          </button>
        ))}
        {!adding && (
          <button
            ref={addBtn}
            type="button"
            className="cat-chip is-new"
            onClick={() => {
              setAdding(true);
              setTimeout(() => input.current?.focus(), 50);
            }}
            aria-expanded={false}
          >
            <IonIcon icon={add} aria-hidden="true" />
            <span>Nueva</span>
          </button>
        )}
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
            <IonButton fill="outline" onClick={close}>
              Cancelar
            </IonButton>
            <IonButton onClick={create}>
              <IonIcon slot="start" icon={checkmark} />
              Crear y elegir
            </IonButton>
          </div>
        </div>
      )}
    </div>
  );
}
