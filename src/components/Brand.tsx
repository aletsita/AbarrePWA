import { IonIcon } from '@ionic/react';
import { contrastOutline, moonOutline, sunnyOutline } from 'ionicons/icons';
import { nextTheme, THEME_LABEL, useThemeMode, type ThemeMode } from '../lib/theme';

// Nombre de la marca con el acento en la "é"
export function BrandWord({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-word ${className}`} aria-label="Abarré">
      Abarr<em>é</em>
    </span>
  );
}

export function BrandLogo({ size = 40 }: { size?: number }) {
  return <img src="/icons/icon.svg" alt="" width={size} height={size} style={{ borderRadius: size * 0.24 }} />;
}

const THEME_ICON: Record<ThemeMode, string> = { sistema: contrastOutline, claro: sunnyOutline, oscuro: moonOutline };

export function ThemeButton({ className = '', showLabel }: { className?: string; showLabel?: boolean }) {
  const [mode, setMode] = useThemeMode();
  return (
    <button
      type="button"
      className={className}
      onClick={() => setMode(nextTheme(mode))}
      title={`Tema: ${THEME_LABEL[mode]}`}
      aria-label={`Tema: ${THEME_LABEL[mode]}. Cambiar`}
    >
      <IonIcon icon={THEME_ICON[mode]} />
      {showLabel && <span>Tema {THEME_LABEL[mode].toLowerCase()}</span>}
    </button>
  );
}
