// Stock is maintained by the POS. The site only HIDES out-of-stock items from the
// new-order picker; it never changes the shared `active` flag (the POS reads it too).
// Unknown stock (null/undefined) is treated as available.
export const hasStock = (stock: number | string | null | undefined): boolean =>
  stock === null || stock === undefined || stock === "" || !(Number(stock) <= 0);

export function sellable<P extends {id: string; stock?: number | string | null}, V extends {product_id: string; stock?: number | string | null}>(
  products: P[], variants: V[],
): {products: P[]; variants: V[]} {
  const okVariants = variants.filter(v => hasStock(v.stock));
  const withVariants = new Set(variants.map(v => v.product_id));
  const withStockVariants = new Set(okVariants.map(v => v.product_id));
  return {
    variants: okVariants,
    products: products.filter(p => (withVariants.has(p.id) ? withStockVariants.has(p.id) : hasStock(p.stock))),
  };
}
