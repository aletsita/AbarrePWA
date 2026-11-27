import { IonIcon } from '@ionic/react';
import { contrastOutline, moonOutline, sunnyOutline } from 'ionicons/icons';
import { nextTheme, THEME_LABEL, useThemeMode, type ThemeMode } from '../lib/theme';

// Nombre de la marca en Poppins Bold, con la "é" en ámbar
export function BrandWord({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-word ${className}`} aria-label="Abarré">
      Abarr<em>é</em>
    </span>
  );
}

// Isotipo de Abarré: cesta con código de barras y el rayo ámbar del escáner (assets/brand/isotipo.svg).
// `color`: cesta azul (para fondos claros) · `blanco`: cesta blanca (para fondos azules).
// Con 24 px o menos se usa la versión simplificada (isotipo-mini.svg): asa, cuerpo y rayo, sin barras.
// `animated`: entrada de la animación de inicio (la cesta aparece y el rayo la recorre).
export function BrandMark({ size = 40, tone = 'color', animated, className = '' }: { size?: number; tone?: 'color' | 'blanco'; animated?: boolean; className?: string }) {
  const mini = size <= 24;
  return (
    <svg
      className={`brand-mark is-${tone} ${animated ? 'is-animated' : ''} ${className}`}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      {mini ? (
        <g className="bm-basket">
          <path d="M30,40 C30,13 70,13 70,40" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
          <path d="M12,40 H88 L83,85 a9,9 0 0 1 -9,8 H26 a9,9 0 0 1 -9,-8 Z" fill="currentColor" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />
        </g>
      ) : (
        <g className="bm-basket">
          <path d="M30,38 C30,10 70,10 70,38" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
          <path d="M14,38 H86 L82,86 a8,8 0 0 1 -8,7 H26 a8,8 0 0 1 -8,-7 Z" fill="currentColor" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />
          <g className="bm-bars">
            <rect x="32" y="54" width="5" height="26" rx="1.2" />
            <rect x="42" y="54" width="3" height="26" rx="1.2" />
            <rect x="49" y="54" width="7" height="26" rx="1.2" />
            <rect x="59" y="54" width="3" height="26" rx="1.2" />
            <rect x="65" y="54" width="5" height="26" rx="1.2" />
          </g>
        </g>
      )}
      <rect className="bm-ray" x={mini ? 4 : 8} y={mini ? 59 : 64} width={mini ? 92 : 84} height={mini ? 13 : 8} rx={mini ? 6.5 : 4} />
    </svg>
  );
}

// Logo en las pantallas (inicio de sesión, encabezados, Acerca de)
export function BrandLogo({ size = 40, tone = 'color' }: { size?: number; tone?: 'color' | 'blanco' }) {
  return <BrandMark size={size} tone={tone} />;
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
