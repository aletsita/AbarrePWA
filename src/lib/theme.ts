import { useEffect, useState } from 'react';

export type ThemeMode = 'sistema' | 'claro' | 'oscuro';

const KEY = 'abarre.tema';
const EVENT = 'abarre-theme';
const media = () => window.matchMedia?.('(prefers-color-scheme: dark)');

export function getThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'claro' || v === 'oscuro' || v === 'sistema') return v;
  } catch {
    /* sin almacenamiento */
  }
  return 'claro';
}

export function applyTheme(mode = getThemeMode()) {
  const dark = mode === 'oscuro' || (mode === 'sistema' && !!media()?.matches);
  document.documentElement.classList.toggle('theme-dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e0d18' : '#ffffff');
}

export function setThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* sin almacenamiento */
  }
  applyTheme(mode);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }));
}

// Aplica el tema al arrancar y sigue los cambios del sistema
export function initTheme() {
  applyTheme();
  media()?.addEventListener('change', () => getThemeMode() === 'sistema' && applyTheme());
}

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode);
  useEffect(() => {
    const on = (e: Event) => setMode((e as CustomEvent<ThemeMode>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return [mode, setThemeMode] as const;
}

export const THEME_LABEL: Record<ThemeMode, string> = { sistema: 'Automático', claro: 'Claro', oscuro: 'Oscuro' };
export const nextTheme = (m: ThemeMode): ThemeMode => (m === 'sistema' ? 'claro' : m === 'claro' ? 'oscuro' : 'sistema');
