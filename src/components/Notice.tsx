import { IonIcon } from '@ionic/react';
import { alertCircleOutline, checkmarkCircleOutline, closeCircleOutline, informationCircleOutline } from 'ionicons/icons';
import type { ReactNode } from 'react';
import './Notice.css';

// Aviso dentro de un formulario o pantalla, con el mismo lenguaje visual que las alertas:
// ícono en círculo por tipo, título corto y texto
export type NoticeTone = 'info' | 'warning' | 'error' | 'success';

const ICON: Record<NoticeTone, string> = {
  info: informationCircleOutline,
  warning: alertCircleOutline,
  error: closeCircleOutline,
  success: checkmarkCircleOutline,
};

export function Notice({ tone, title, children, className = '' }: { tone: NoticeTone; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div className={`notice is-${tone} ${className}`} role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}>
      <span className="notice-icon">
        <IonIcon icon={ICON[tone]} aria-hidden="true" />
      </span>
      <div className="notice-body">
        {title && <strong>{title}</strong>}
        {children && <div className="notice-text">{children}</div>}
      </div>
    </div>
  );
}
