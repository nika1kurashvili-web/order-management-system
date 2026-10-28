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

// ---- Display helpers for the new-order picker (read-only; never changes data) ----
export const stockNum = (stock: number | string | null | undefined): number | null =>
  stock === null || stock === undefined || stock === "" || !Number.isFinite(Number(stock)) ? null : Number(stock);

// Stock shown for a product: the sum of its variants' stock, or its own stock without variants.
export function productStock(
  p: {id: string; stock?: number | string | null},
  variants: {product_id: string; stock?: number | string | null}[],
): number | null {
  const vs = variants.filter(v => v.product_id === p.id);
  if (!vs.length) return stockNum(p.stock);
  const known = vs.map(v => stockNum(v.stock)).filter((n): n is number => n !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}

export const withStock = (label: string, stock: number | null): string =>
  stock === null ? label : `${label} · მარაგი: ${stock}`;
