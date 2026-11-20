// Contenido del QR de vinculación caja ↔ celular (ver SYNC_PROTOCOL.md, «Vinculación»).
// Lleva el código y la dirección del servidor para que el celular se conecte solo:
//   abarre://vincular?codigo=123456&servidor=http%3A%2F%2F192.168.1.20%3A8787%2F__sync
// Copia idéntica en tendero-web y tendero-mobile.

export const DEFAULT_PORT = 8787;
const LINK_PREFIX = 'abarre://vincular';

export function buildLinkQr(code: string, server: string | null) {
  const params = new URLSearchParams({ codigo: code });
  if (server) params.set('servidor', server);
  return `${LINK_PREFIX}?${params}`;
}

export function parseLinkQr(raw: string): { code: string; server: string | null } | null {
  const text = raw.trim();
  // Formato anterior, solo con el código
  const legacy = text.match(/^(?:ABARRE|TENDERO)-LINK:(\d{6})$/i);
  if (legacy) return { code: legacy[1], server: null };
  if (!text.toLowerCase().startsWith(LINK_PREFIX)) return null;
  const params = new URLSearchParams(text.slice(text.indexOf('?') + 1));
  const code = params.get('codigo') ?? '';
  if (!/^\d{6}$/.test(code)) return null;
  return { code, server: normalizeServer(params.get('servidor') ?? '') };
}

// Acepta lo que alguien escribiría a mano: "192.168.1.20", "192.168.1.20:8787", "http://pc.local:8787" o la URL completa
export function normalizeServer(input: string): string | null {
  let text = input.trim().replace(/\s+/g, '');
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) text = `http://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!url.hostname || !/^[\w.-]+$/.test(url.hostname)) return null;
  if (!url.port && url.protocol === 'http:') url.port = String(DEFAULT_PORT);
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/__sync') ? path : `${path}/__sync`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

// "http://192.168.1.20:8787/__sync" → "192.168.1.20:8787", para mostrarla y escribirla a mano
export function shortServer(url: string | null) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/__sync$/, '').replace(/\/$/, '');
    return `${u.protocol === 'https:' ? 'https://' : ''}${u.host}${path}`;
  } catch {
    return url;
  }
}
