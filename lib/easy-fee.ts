// What we charge the customer for delivery, by Easy's published tariff.
// (Fixed for now: weight is not priced yet.)  5.9 and 6 -> 6, 8 and 8.5 and 10 -> 9, 12 -> 13.
// Any other tariff is passed through unchanged.
export function easyCustomerFee(tariff: unknown): number | null {
  if (tariff === null || tariff === undefined || tariff === "") return null;
  const t = Math.round(Number(tariff) * 100) / 100;
  if (!Number.isFinite(t) || t < 0) return null;
  if (t === 5.9 || t === 6) return 6;
  if (t === 8 || t === 8.5 || t === 10) return 9;
  if (t === 12) return 13;
  return t;
}
