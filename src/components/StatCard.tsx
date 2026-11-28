import { IonIcon } from '@ionic/react';
import type { ReactNode } from 'react';
import './StatCard.css';

interface Props {
  icon: string;
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'accent' | 'danger';
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function StatCard({ icon, label, value, hint, tone = 'primary', active, onClick, className = '' }: Props) {
  const body = (
    <>
      <span className="stat-head">
        <span className="stat-icon"><IonIcon icon={icon} aria-hidden="true" /></span>
        <span className="stat-label">{label}</span>
      </span>
      <span className="stat-value money">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </>
  );
  if (!onClick) return <div className={`stat-card tone-${tone} ${className}`}>{body}</div>;
  return (
    <button type="button" className={`stat-card is-click tone-${tone} ${active ? 'is-active' : ''} ${className}`} aria-pressed={active} onClick={onClick}>
      {body}
    </button>
  );
}
