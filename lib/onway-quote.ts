type WeightedProduct = {weight_kg?: unknown};
export type QuoteItem = {product: WeightedProduct; variant: WeightedProduct | null; quantity: number};

function positiveWeight(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const weight = Number(value);
  return Number.isFinite(weight) && weight > 0 ? weight : null;
}

export function quoteUnitWeight(product: WeightedProduct, variant: WeightedProduct | null): number | null {
  return positiveWeight(variant?.weight_kg) ?? positiveWeight(product.weight_kg);
}

export function quoteTotalWeight(items: QuoteItem[]): number | null {
  if (!items.length) return null;
  let total = 0;
  for (const item of items) {
    const weight = quoteUnitWeight(item.product, item.variant);
    if (weight === null || !Number.isFinite(item.quantity) || item.quantity <= 0) return null;
    total += weight * item.quantity;
  }
  // Avoid floating-point noise (e.g. 2.4000000000000004) in the quote payload.
  const result = Number(total.toFixed(12));
  return Number.isFinite(result) && result > 0 ? result : null;
}
