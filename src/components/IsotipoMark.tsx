import { useId } from 'react';

// Isotipo blanco de la marca (public/brand/isotipo-blanco.svg) como marca de agua sobre azul:
// la bolsa en blanco al 10 %, el código de barras calado y el rayo en ámbar al 55 %. El tamaño y la posición los pone `className`.
export function IsotipoMark({ className }: { className: string }) {
  const mask = `isotipo-${useId().replace(/:/g, '')}`;
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <mask id={mask}>
          <rect width="100" height="100" fill="#fff" />
          <rect x="32" y="54" width="5" height="26" rx="1.2" fill="#000" />
          <rect x="42" y="54" width="3" height="26" rx="1.2" fill="#000" />
          <rect x="49" y="54" width="7" height="26" rx="1.2" fill="#000" />
          <rect x="59" y="54" width="3" height="26" rx="1.2" fill="#000" />
          <rect x="65" y="54" width="5" height="26" rx="1.2" fill="#000" />
        </mask>
      </defs>
      <g opacity="0.1">
        <path d="M30,38 C30,10 70,10 70,38" fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" />
        <path d="M14,38 H86 L82,86 a8,8 0 0 1 -8,7 H26 a8,8 0 0 1 -8,-7 Z" fill="#FFFFFF" stroke="#FFFFFF" strokeWidth="6" strokeLinejoin="round" mask={`url(#${mask})`} />
      </g>
      <rect x="8" y="64" width="84" height="8" rx="4" fill="#FFB020" opacity="0.55" />
    </svg>
  );
}
