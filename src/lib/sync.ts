import { uid } from '../data/models';
import type { Shortfall } from '../domain/stock';

interface Envelope {
  id: string;
  from: string;
  msg: unknown;
}

// Respuesta del servidor a un mensaje que mueve existencias. `offline`: no hay servidor y solo se aplicó aquí.
export type SendResult =
  | { ok: true; offline?: boolean }
  | { ok: false; status: number; body: { code?: string; message?: string; faltantes?: Shortfall[]; intentos?: number } };

export interface SyncLink {
  post: (msg: unknown) => void;
  // Para lo que el servidor revisa antes de reenviar (cobros, preparar, entregar): se aplica solo si pasa
  send: (msg: unknown) => Promise<SendResult>;
  close: () => void;
}

export const URL_SYNC = import.meta.env.VITE_SYNC_URL ?? '/__sync';

// Une las pestañas del mismo navegador (BroadcastChannel) y los equipos de la misma red (servidor)
export function openSync(
  channelName: string,
  onMessage: (msg: unknown) => void,
  onConnect: () => void,
  onStatus?: (connected: boolean) => void,
): SyncLink {
  const me = uid();
  const seen = new Set<string>();
  let relay = false;
  let closed = false;

  const remember = (id: string) => {
    seen.add(id);
    if (seen.size > 800) seen.delete(seen.values().next().value as string);
  };

  const receive = (env: Envelope) => {
    if (!env || env.from === me || seen.has(env.id)) return;
    remember(env.id);
    onMessage(env.msg);
  };

  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null;
  if (bc) bc.onmessage = (e: MessageEvent<Envelope>) => receive(e.data);

  let es: EventSource | null = null;
  if (typeof EventSource !== 'undefined') {
    es = new EventSource(URL_SYNC);
    es.onopen = () => {
      relay = true;
      onStatus?.(true);
      onConnect();
    };
    es.onmessage = (e) => {
      try {
        receive(JSON.parse(e.data) as Envelope);
      } catch {
        /* mensaje inválido */
      }
    };
    es.onerror = () => {
      relay = false;
      onStatus?.(false);
    };
  }

  const link: SyncLink = {
    post(msg) {
      if (closed) return;
      const env: Envelope = { id: uid(), from: me, msg };
      remember(env.id);
      try {
        bc?.postMessage(env);
      } catch {
        /* canal cerrado */
      }
      if (!relay) return;
      const body = JSON.stringify(env);
      fetch(URL_SYNC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: body.length < 60000,
      }).catch(() => undefined);
    },
    async send(msg) {
      if (closed) return { ok: false, status: 0, body: { code: 'cerrado', message: 'La conexión se cerró.' } };
      if (!relay || !URL_SYNC) {
        link.post(msg);
        return { ok: true, offline: true };
      }
      const env: Envelope = { id: uid(), from: me, msg };
      remember(env.id);
      let res: Response;
      try {
        res = await fetch(URL_SYNC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env) });
      } catch {
        return { ok: false, status: 0, body: { code: 'sin-conexion', message: 'No se pudo contactar al servidor. Revisa la conexión e intenta de nuevo.' } };
      }
      if (!res.ok) return { ok: false, status: res.status, body: await res.json().catch(() => ({})) };
      // El servidor ya lo reenvió a los demás equipos; las pestañas de este navegador lo reciben aquí
      try {
        bc?.postMessage(env);
      } catch {
        /* canal cerrado */
      }
      return { ok: true };
    },
    close() {
      closed = true;
      bc?.close();
      es?.close();
    },
  };
  return link;
}
