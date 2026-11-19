import { normalize, type Product } from '../data/models';

export function searchProducts<T extends Product>(products: T[], text: string, limit = 6): T[] {
  const q = normalize(text);
  if (!q) return [];
  const digits = /^\d+$/.test(q);
  const scored = products
    .map((p) => {
      let score = 0;
      if (p.barcode === q) score = 100;
      else if (p.barcode.startsWith(q)) score = 60;
      else if (digits && p.barcode.includes(q)) score = 40;
      else if (!digits) {
        const name = normalize(p.name);
        if (name.startsWith(q)) score = 50;
        else if (name.includes(q)) score = 30;
        else if (q.split(/\s+/).every((w) => name.includes(w))) score = 20;
      }
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
  return scored.slice(0, limit).map((x) => x.p);
}

// "3*7501055300075" agrega 3 piezas, como en las cajas con lector
export function parseQty(text: string): { qty: number; code: string } {
  const m = text.trim().match(/^(\d{1,3})\s*[*xX]\s*(.+)$/);
  if (m && Number(m[1]) > 0) return { qty: Number(m[1]), code: m[2].trim() };
  return { qty: 1, code: text.trim() };
}
