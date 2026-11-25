// Venta por pieza o por peso. Las cuentas se hacen en enteros (gramos y centavos) para que
// 0.1 + 0.2 nunca dé 0.30000000000000004 en un ticket ni en un corte.
export type SaleType = 'pieza' | 'peso';

// Sin tipo = pieza (los productos guardados antes de existir la venta por peso)
export const isWeighed = (p: { saleType?: SaleType } | undefined) => p?.saleType === 'peso';

// Límites de una pesada: 1 g a 999.999 kg
export const MIN_GRAMS = 1;
export const MAX_GRAMS = 999_999;

export const toGrams = (kg: number) => Math.round(kg * 1000);
export const toCents = (pesos: number) => Math.round(pesos * 100);
export const fromCents = (cents: number) => cents / 100;

// Cantidad normalizada: kilos con 3 decimales exactos; piezas enteras
export const roundQty = (qty: number) => toGrams(qty) / 1000;

// Importe de una línea en centavos: precio por kg × gramos / 1000, redondeado al centavo
export function lineCents(qty: number, price: number, saleType?: SaleType): number {
  if (saleType === 'peso') return Math.round((toCents(price) * toGrams(qty)) / 1000);
  return toCents(price) * Math.round(qty);
}

export const lineTotal = (qty: number, price: number, saleType?: SaleType) => fromCents(lineCents(qty, price, saleType));

// Total de varias líneas: se suma en centavos y se convierte una sola vez
export function sumCents(lines: Iterable<{ qty: number; price: number; saleType?: SaleType }>): number {
  let cents = 0;
  for (const l of lines) cents += lineCents(l.qty, l.price, l.saleType);
  return cents;
}

// Lo que escribe el cajero: "0.350", "0,35", ".5", "1". Kilos con hasta 3 decimales.
// null si no es un peso válido (vacío, cero, negativo, letras, más de 3 decimales o fuera de rango).
export function parseKg(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d*\.?\d{0,3}$/.test(t) || t === '' || t === '.') return null;
  const grams = toGrams(Number(t));
  if (!Number.isFinite(grams) || grams < MIN_GRAMS || grams > MAX_GRAMS) return null;
  return grams / 1000;
}

const kgFmt = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

// "0.350 kg" o "3" (piezas)
export function qtyText(qty: number, saleType?: SaleType): string {
  return saleType === 'peso' ? `${kgFmt.format(roundQty(qty))} kg` : String(qty);
}

// "0.350 kg" / "1 pieza" / "3 piezas"
export function qtyLabel(qty: number, saleType?: SaleType): string {
  if (saleType === 'peso') return qtyText(qty, saleType);
  return `${qty} ${qty === 1 ? 'pieza' : 'piezas'}`;
}

// Artículos de una venta: las piezas se cuentan; cada producto pesado cuenta como uno
export const itemCount = (items: Iterable<{ qty: number; saleType?: SaleType }>) => {
  let n = 0;
  for (const i of items) n += i.saleType === 'peso' ? 1 : i.qty;
  return n;
};
