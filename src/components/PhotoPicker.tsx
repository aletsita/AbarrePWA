import { IonIcon } from '@ionic/react';
import { useAppAlert } from './AppAlert';
import { cameraOutline, closeCircle } from 'ionicons/icons';
import { useRef } from 'react';
import { readPhoto } from '../lib/photo';

export function PhotoPicker({ value, onChange }: { value?: string; onChange: (photo?: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const showAlert = useAppAlert();

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      onChange(await readPhoto(file));
    } catch {
      void showAlert({ tone: 'error', title: 'No se pudo leer la foto', message: 'Prueba con otra imagen (JPG o PNG).', primary: 'Entendido' });
    }
  };

  return (
    <div className={`photo-pick ${value ? 'has-photo' : ''}`}>
      <button type="button" className="photo-pick-btn" onClick={() => input.current?.click()} aria-label={value ? 'Cambiar foto' : 'Agregar foto'}>
        {value ? (
          <img src={value} alt="Foto del producto" />
        ) : (
          <>
            <IonIcon icon={cameraOutline} />
            <span>Foto</span>
          </>
        )}
      </button>
      {value && (
        <button type="button" className="photo-pick-clear" onClick={() => onChange(undefined)} aria-label="Quitar foto">
          <IonIcon icon={closeCircle} />
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
