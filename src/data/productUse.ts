import { ACTIVE_STATUSES, type PickupOrder } from './pickup';

type Line = { product: { id: string } };

// Por qué no se puede borrar un producto todavía (null = se puede). Se revisa en la caja y en el servidor:
// un producto en una cuenta abierta o apartado en un pedido sin entregar se quedaría sin poder cobrarse.
export function productInUse(
  id: string,
  s: { ticket: Line[]; parked: { name: string; lines: Line[] }[]; orders: Pick<PickupOrder, 'folio' | 'status' | 'items'>[] },
): string | null {
  if (s.ticket.some((l) => l.product.id === id)) return 'Está en la cuenta que tienes en pantalla. Quítalo de la cuenta antes de borrarlo.';
  const account = s.parked.find((a) => a.lines.some((l) => l.product.id === id));
  if (account) return `Está en la cuenta «${account.name}». Quítalo de esa cuenta antes de borrarlo.`;
  const order = s.orders.find((o) => ACTIVE_STATUSES.includes(o.status) && o.items.some((i) => i.productId === id));
  if (order) return `Está apartado en el pedido ${order.folio}. Entrégalo o cancélalo antes de borrarlo.`;
  return null;
}
