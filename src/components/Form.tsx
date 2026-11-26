import { IonIcon, IonToggle } from '@ionic/react';
import { alertCircleOutline, eyeOffOutline, eyeOutline } from 'ionicons/icons';
import { useId, useState, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import './Form.css';

// Campos de formulario de todo el panel: etiqueta arriba, caja, y ayuda o error abajo
interface Base {
  label: string;
  hint?: ReactNode;
  error?: string | false;
  optional?: boolean;
  className?: string;
}

function Shell({ id, label, hint, error, optional, className = '', children }: Base & { id: string; children: ReactNode }) {
  return (
    <div className={`fld ${error ? 'is-invalid' : ''} ${className}`}>
      <label className="fld-label" htmlFor={id}>
        {label}
        {optional && <span>Opcional</span>}
      </label>
      {children}
      {error ? (
        <p className="fld-error" id={`${id}-msg`}><IonIcon icon={alertCircleOutline} />{error}</p>
      ) : (
        hint && <p className="fld-hint" id={`${id}-msg`}>{hint}</p>
      )}
    </div>
  );
}

type InputProps = Base & {
  value: string;
  onChange: (value: string) => void;
  icon?: string;
  prefix?: string;
  suffix?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'prefix'>;

export function TextField({ label, hint, error, optional, className, icon, prefix, suffix, inputRef, value, onChange, type = 'text', ...input }: InputProps) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const password = type === 'password';
  return (
    <Shell id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <div className={`fld-box ${input.disabled ? 'is-disabled' : ''}`}>
        {icon && <IonIcon className="fld-icon" icon={icon} aria-hidden="true" />}
        {prefix && <span className="fld-adorn">{prefix}</span>}
        <input
          id={id}
          ref={inputRef}
          type={password && shown ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error || undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          {...input}
        />
        {suffix && <span className="fld-adorn">{suffix}</span>}
        {password && (
          <button type="button" className="fld-reveal" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
            <IonIcon icon={shown ? eyeOffOutline : eyeOutline} />
          </button>
        )}
      </div>
    </Shell>
  );
}

// Para montos: solo deja escribir números y punto decimal
export function MoneyField(props: Omit<InputProps, 'prefix' | 'inputMode'>) {
  return <TextField {...props} prefix="$" inputMode="decimal" placeholder={props.placeholder ?? '0.00'} onChange={(v) => props.onChange(v.replace(/[^\d.]/g, ''))} />;
}

type AreaProps = Base & { value: string; onChange: (value: string) => void } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>;

export function AreaField({ label, hint, error, optional, className, value, onChange, rows = 3, ...area }: AreaProps) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <div className="fld-box is-area">
        <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} {...area} />
      </div>
    </Shell>
  );
}

type SelectProps = Base & { value: string; onChange: (value: string) => void; children: ReactNode } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>;

export function SelectField({ label, hint, error, optional, className, value, onChange, children, ...select }: SelectProps) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <div className={`fld-box is-select ${select.disabled ? 'is-disabled' : ''}`}>
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} {...select}>
          {children}
        </select>
      </div>
    </Shell>
  );
}

export function SwitchField({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="fld-switch">
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <IonToggle checked={checked} disabled={disabled} aria-label={label} onIonChange={(e) => onChange(e.detail.checked)} />
    </div>
  );
}

// Bloque con título dentro de un formulario largo; con `icon` se muestra como tarjeta con ícono
export function FormSection({ title, text, icon, children }: { title: string; text?: string; icon?: string; children: ReactNode }) {
  return (
    <section className={`form-section ${icon ? 'is-card' : ''}`}>
      <header>
        {icon && (
          <span className="form-section-icon">
            <IonIcon icon={icon} aria-hidden="true" />
          </span>
        )}
        <span>
          <h3>{title}</h3>
          {text && <p>{text}</p>}
        </span>
      </header>
      <div className="form-grid">{children}</div>
    </section>
  );
}
