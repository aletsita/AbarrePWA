import type { ReactNode } from 'react';
import './EmptyState.css';

type Art = 'offline' | 'box' | 'search' | 'cart' | 'error';

interface Props {
  art: Art;
  title: string;
  text?: string;
  action?: ReactNode;
}

export function EmptyState({ art, title, text, action }: Props) {
  return (
    <div className={`empty-state art-${art}`}>
      <div className="empty-art" aria-hidden="true">{ART[art]}</div>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

// Los colores vienen de clases (EmptyState.css) para respetar el modo oscuro
const ART: Record<Art, ReactNode> = {
  offline: (
    <svg viewBox="0 0 160 120">
      <ellipse className="ea-shadow" cx="80" cy="108" rx="54" ry="7" />
      <path className="ea-pfill ea-p" d="M46 78a22 22 0 0 1 4-43.6A30 30 0 0 1 107 40a19 19 0 0 1 7 38z" strokeWidth="4" strokeLinejoin="round" />
      <path className="ea-a" d="M40 22l80 72" strokeWidth="6" strokeLinecap="round" />
      <rect className="ea-surface ea-p" x="64" y="86" width="32" height="18" rx="4" strokeWidth="3" />
      <path className="ea-p" d="M72 92h16M72 98h10" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
  box: (
    <svg viewBox="0 0 160 120">
      <ellipse className="ea-shadow" cx="80" cy="108" rx="54" ry="7" />
      <path className="ea-afill ea-a" d="M40 46l40-18 40 18v46l-40 16-40-16z" strokeWidth="4" strokeLinejoin="round" />
      <path className="ea-a" d="M40 46l40 16 40-16M80 62v46" fill="none" strokeWidth="4" strokeLinejoin="round" />
      <path className="ea-a" d="M58 37l40 17" strokeWidth="4" />
      <circle className="ea-dot" cx="124" cy="24" r="4" />
      <circle className="ea-dot" cx="34" cy="28" r="3" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 160 120">
      <ellipse className="ea-shadow" cx="80" cy="108" rx="54" ry="7" />
      <circle className="ea-pfill ea-p" cx="72" cy="54" r="30" strokeWidth="5" />
      <path className="ea-p" d="M94 76l22 22" strokeWidth="9" strokeLinecap="round" />
      <path className="ea-a" d="M62 46l20 16M82 46L62 62" strokeWidth="5" strokeLinecap="round" />
    </svg>
  ),
  cart: (
    <svg viewBox="0 0 160 120">
      <ellipse className="ea-shadow" cx="80" cy="108" rx="54" ry="7" />
      <rect className="ea-pfill ea-p" x="34" y="22" width="92" height="70" rx="12" strokeWidth="4" />
      <path className="ea-p" d="M52 36v42M62 36v42M76 36v42M90 36v42M100 36v42M110 36v42" strokeWidth="4" strokeLinecap="round" />
      <path className="ea-a" d="M40 57h80" strokeWidth="4" strokeLinecap="round" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 160 120">
      <ellipse className="ea-shadow" cx="80" cy="108" rx="54" ry="7" />
      <path className="ea-dfill ea-d" d="M80 18l46 80H34z" strokeWidth="5" strokeLinejoin="round" />
      <path className="ea-d" d="M80 48v24" strokeWidth="6" strokeLinecap="round" />
      <circle className="ea-ddot" cx="80" cy="84" r="4" />
    </svg>
  ),
};
