import { IonIcon } from '@ionic/react';
import { addCircleOutline, barcodeOutline, closeCircle, keypadOutline, textOutline } from 'ionicons/icons';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { ProductView } from '../context/AppContext';
import { money } from '../data/models';
import { parseQty, searchProducts } from '../lib/search';
import { ProductThumb } from './ProductThumb';
import { SyncBadge } from './SyncBadge';
import './BarcodeSearch.css';

interface Props {
  products: ProductView[];
  onPick: (product: ProductView, qty: number) => void;
  onMissing?: (code: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  allowQty?: boolean;
  // Caja: piezas que todavía se pueden vender; marca "Sin stock" en la lista
  availableFor?: (productId: string) => number;
  keyboardToggle?: boolean;
  blurOnPick?: boolean;
  size?: 'md' | 'lg';
  missingLabel?: string;
}

export interface BarcodeSearchHandle {
  focus: () => void;
}

export const BarcodeSearch = forwardRef<BarcodeSearchHandle, Props>(function BarcodeSearch(
  {
    products,
    onPick,
    onMissing,
    placeholder = 'Código de barras o nombre',
    autoFocus,
    allowQty,
    availableFor,
    keyboardToggle,
    blurOnPick,
    size = 'md',
    missingLabel = 'Dar de alta',
  },
  ref,
) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [missing, setMissing] = useState('');
  const [numeric, setNumeric] = useState(true);

  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  const { qty, code } = allowQty ? parseQty(text) : { qty: 1, code: text.trim() };
  const results = searchProducts(products, code);
  const open = focused && code.length > 0 && !missing;

  const reset = () => {
    setText('');
    setActive(0);
    setMissing('');
  };

  const pick = (p: ProductView) => {
    onPick(p, qty);
    reset();
    if (blurOnPick) input.current?.blur();
    else input.current?.focus();
  };

  const submit = () => {
    if (!code) return;
    const exact = products.find((p) => p.barcode === code);
    if (exact) return pick(exact);
    if (results[active] && !/^\d{8,}$/.test(code)) return pick(results[active]);
    if (/^\d{4,}$/.test(code)) setMissing(code);
    else if (results[0]) pick(results[0]);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Escape') reset();
  };

  return (
    <div className={`bsearch is-${size}`}>
      <div className={`bsearch-box ${focused ? 'is-focused' : ''}`}>
        <IonIcon icon={barcodeOutline} className="bsearch-icon" aria-hidden="true" />
        <input
          ref={input}
          type="search"
          enterKeyHint="search"
          inputMode={keyboardToggle && numeric ? 'numeric' : 'search'}
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setMissing('');
          }}
          onKeyDown={onKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {text && (
          <button type="button" className="bsearch-btn" onMouseDown={(e) => e.preventDefault()} onClick={reset} aria-label="Borrar">
            <IonIcon icon={closeCircle} />
          </button>
        )}
        {keyboardToggle && (
          <button
            type="button"
            className="bsearch-btn bsearch-kb"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setNumeric((n) => !n);
              input.current?.blur();
              window.setTimeout(() => input.current?.focus(), 50);
            }}
            aria-label={numeric ? 'Escribir nombre' : 'Escribir número'}
          >
            <IonIcon icon={numeric ? textOutline : keypadOutline} />
          </button>
        )}
      </div>

      {open && (
        <ul className="bsearch-list" role="listbox">
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={i === active ? 'is-active' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(p)}
              >
                <ProductThumb product={p} size={36} />
                <span className="bsearch-name">
                  <strong>{p.name}</strong>
                  <span>
                    {p.barcode} ·{' '}
                    {availableFor && availableFor(p.id) <= 0 ? <b className="stock-out">Sin stock</b> : `${availableFor ? availableFor(p.id) : p.stock} pzas`}{' '}
                    {p.sync && <SyncBadge state={p.sync} compact />}
                  </span>
                </span>
                <span className="bsearch-price money">
                  {qty > 1 && <small>{qty} ×</small>}
                  {money(p.price)}
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="bsearch-empty">
              {/^\d+$/.test(code) ? 'Presiona Enter para buscar el código completo' : 'Sin coincidencias'}
            </li>
          )}
        </ul>
      )}

      {missing && (
        <div className="bsearch-missing" role="alert">
          <span>
            No hay ningún producto con el código <strong>{missing}</strong>
          </span>
          {onMissing && (
            <button
              type="button"
              onClick={() => {
                onMissing(missing);
                reset();
              }}
            >
              <IonIcon icon={addCircleOutline} />
              {missingLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
