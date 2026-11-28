import { useIonRouter } from '@ionic/react';
import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { money } from '../data/models';
import { useAviso } from '../components/Aviso';

// Dos tonos cortos; el navegador solo los permite después de que alguien tocó la página
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.16;
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    });
    window.setTimeout(() => void ctx.close(), 600);
  } catch {
    /* sin audio */
  }
}

// Aviso en cualquier pantalla de la caja cuando entra un pedido nuevo de Pide y recoge
export function OrderAlerts() {
  const { orders, user } = useApp();
  const router = useIonRouter();
  const toast = useAviso();
  const known = useRef<Set<string> | null>(null);
  // Respuestas del cliente a un aviso de producto agotado: cambió productos o canceló
  const answers = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    const answerOf = (o: (typeof orders)[number]) => (o.cancel?.reason === 'cliente' ? 'cancelo' : o.editedAt ?? '');
    const prev = answers.current;
    answers.current = new Map(orders.map((o) => [o.id, answerOf(o)]));
    if (prev && user) {
      const changed = orders.filter((o) => prev.has(o.id) && answerOf(o) && prev.get(o.id) !== answerOf(o));
      changed.forEach((o) =>
        toast({
          header: o.cancel?.reason === 'cliente' ? `${o.customer.name} canceló ${o.folio}` : `${o.customer.name} cambió ${o.folio}`,
          message: o.cancel?.reason === 'cliente' ? 'Ya no prepares este pedido.' : `Nuevo total ${money(o.total)}. Ya puedes seguir preparándolo.`,
          duration: 8000,
          color: o.cancel?.reason === 'cliente' ? 'medium' : 'primary',
          position: 'top',
          cssClass: 'toast-app',
          buttons: [{ text: 'Ver pedidos', handler: () => router.push('/panel/pedidos', 'none') }],
        }),
      );
    }

    const ids = new Set(orders.map((o) => o.id));
    if (!known.current) {
      known.current = ids;
      return;
    }
    const fresh = orders.filter((o) => !known.current!.has(o.id) && o.status === 'pendiente');
    known.current = ids;
    if (!fresh.length || !user) return;
    chime();
    const o = fresh[0];
    toast({
      header: fresh.length === 1 ? `Nuevo pedido ${o.folio}` : `${fresh.length} pedidos nuevos`,
      message: fresh.length === 1 ? `${o.customer.name} · ${money(o.total)}` : fresh.map((x) => x.folio).join(', '),
      duration: 8000,
      color: 'warning',
      position: 'top',
      cssClass: 'toast-app',
      buttons: [{ text: 'Ver pedidos', handler: () => router.push('/panel/pedidos', 'none') }],
    });
  }, [orders]);

  return null;
}
