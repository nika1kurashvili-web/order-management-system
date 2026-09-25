export const deliveryMethods = {
  onway: "OnWay",
  private_courier: "პირადი კურიერი",
  warehouse_pickup: "საწყობიდან გაიტანეს",
} as const;

export type DeliveryMethod = keyof typeof deliveryMethods;
export type Role = "admin" | "operator" | "manager";
export const canEditOrders = (role: string) => role === "admin" || role === "operator";
export const canViewReports = (role: string) => role === "admin" || role === "manager";
export const isDeliveryMethod = (value: unknown): value is DeliveryMethod =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(deliveryMethods, value);
export const deliveryLabel = (value: unknown) => isDeliveryMethod(value) ? deliveryMethods[value] : "უცნობი";

export function parseDeliveryFee(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
