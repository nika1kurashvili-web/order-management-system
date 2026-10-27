export type RegionKey = "tbilisi" | "rustavi" | "other";
export const regionLabels: Record<RegionKey, string> = { tbilisi: "თბილისი", rustavi: "რუსთავი", other: "სხვა რეგიონები" };
export const regionKeys = Object.keys(regionLabels) as RegionKey[];

// Everything that is not Tbilisi or Rustavi (including an empty city) is "other".
export function regionOf(city: unknown): RegionKey {
  const s = String(city ?? "").toLowerCase();
  if (s.includes("თბილის") || s.includes("tbilisi")) return "tbilisi";
  if (s.includes("რუსთავ") || s.includes("rustavi")) return "rustavi";
  return "other";
}
