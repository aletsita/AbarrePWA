// Códigos EAN-13. Los internos de la tienda empiezan con 2: GS1 reserva el prefijo 20–29 para uso dentro
// de la tienda, así que nunca chocan con el código impreso de un producto comercial.
export const INTERNAL_PREFIX = '2';

// Dígito verificador de los primeros 12 dígitos: pesos 1 y 3 alternados desde la izquierda
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error('Se necesitan 12 dígitos');
  const sum = [...first12].reduce((n, d, i) => n + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

export const isInternalEan13 = (code: string) => isValidEan13(code) && code.startsWith(INTERNAL_PREFIX);

// Genera un código interno que no exista todavía. `exists` revisa el catálogo; `random` se puede fijar en pruebas.
export function generateInternalEan13(exists: (code: string) => boolean, random: () => number = Math.random): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let body = INTERNAL_PREFIX;
    while (body.length < 12) body += Math.floor(random() * 10);
    const code = body + ean13CheckDigit(body);
    if (!exists(code)) return code;
  }
  throw new Error('No se pudo generar un código libre');
}
