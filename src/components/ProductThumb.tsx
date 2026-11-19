import { categoryColor, initials, type Product } from '../data/models';

export function ProductThumb({ product, size = 40 }: { product: Pick<Product, 'name' | 'category' | 'photo'>; size?: number }) {
  const color = categoryColor(product.category);
  return (
    <span
      className="pthumb"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.34),
        color: `color-mix(in srgb, ${color} 75%, var(--ion-text-color))`,
        background: `color-mix(in srgb, ${color} 16%, var(--t-surface))`,
      }}
      aria-hidden="true"
    >
      {product.photo ? <img src={product.photo} alt="" /> : initials(product.name)}
    </span>
  );
}
