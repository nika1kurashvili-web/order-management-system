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

export type StoredOrderItem = {product_name?: unknown; variant_name?: unknown; quantity: unknown; weight_kg: unknown};

// Real shipment weight from the weights saved on the order items (kg x quantity).
// No default weight: items without a positive weight are reported by name instead.
export function orderItemsWeight(items: StoredOrderItem[]): {weight: number | null; missing: string[]} {
  const missing: string[] = [];
  let total = 0;
  for (const item of items) {
    const unit = positiveWeight(item.weight_kg);
    const quantity = Number(item.quantity);
    if (unit === null || !Number.isFinite(quantity) || quantity <= 0) {
      const name = [item.product_name, item.variant_name].filter(part => typeof part === "string" && part.trim()).join(" / ");
      missing.push(name || "უცნობი პროდუქტი");
    } else total += unit * quantity;
  }
  const result = Number(total.toFixed(12));
  return {weight: missing.length || !items.length || !(result > 0) ? null : result, missing};
}
