import { IonIcon } from '@ionic/react';
import { useAppAlert } from './AppAlert';
import { cameraOutline, closeCircle } from 'ionicons/icons';
import { useRef, useState } from 'react';
import { readPhoto } from '../lib/photo';

// Foto del producto. `busy`: texto que se muestra dentro del recuadro con una barra de progreso
// (por ejemplo «Subiendo…»); `withButton`: botón «Cambiar foto» debajo del recuadro.
export function PhotoPicker({ value, onChange, busy, withButton }: { value?: string; onChange: (photo?: string) => void; busy?: string; withButton?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const showAlert = useAppAlert();
  const [reading, setReading] = useState(false);
  const status = busy || (reading ? 'Cargando…' : '');

  const onFile = async (file?: File) => {
    if (!file) return;
    setReading(true);
    try {
      onChange(await readPhoto(file));
    } catch {
      void showAlert({ tone: 'error', title: 'No se pudo leer la foto', message: 'Prueba con otra imagen (JPG o PNG).', primary: 'Entendido' });
    } finally {
      setReading(false);
    }
  };
  const pick = () => input.current?.click();

  return (
    <div className={`photo-pick-wrap ${withButton ? 'has-button' : ''}`}>
      <div className={`photo-pick ${value ? 'has-photo' : ''}`}>
        <button type="button" className="photo-pick-btn" onClick={pick} disabled={!!status} aria-label={value ? 'Cambiar foto' : 'Agregar foto'} tabIndex={withButton ? -1 : undefined}>
          {value ? (
            <img src={value} alt="Foto del producto" />
          ) : (
            <>
              <IonIcon icon={cameraOutline} />
              <span>Foto</span>
            </>
          )}
        </button>
        {status && (
          <span className="photo-pick-busy" role="status">
            <span>{status}</span>
            <span className="photo-pick-bar" aria-hidden="true">
              <i />
            </span>
          </span>
        )}
        {value && !status && (
          <button type="button" className="photo-pick-clear" onClick={() => onChange(undefined)} aria-label="Quitar foto">
            <IonIcon icon={closeCircle} />
          </button>
        )}
      </div>
      {withButton && (
        <button type="button" className="photo-pick-change" onClick={pick} disabled={!!status}>
          <IonIcon icon={cameraOutline} aria-hidden="true" />
          {value ? 'Cambiar foto' : 'Agregar foto'}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
