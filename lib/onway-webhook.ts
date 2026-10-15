// Pure helpers for the OnWay status webhook (no I/O, easy to test).
export type OnwayWebhookInfo = {
  tracking: string | null;
  statusName: string;
  statusId: string;
  delivered: boolean;
  notDelivered: boolean;
};

// Exact (normalised) status names that mean "delivered". Anything else is ignored.
const DELIVERED_NAMES = ["ჩაბარებული"];
// OnWay status 34 "არ ჩაბარდა" (not delivered) -> the order must be returned.
const NOT_DELIVERED_NAMES = ["არ ჩაბარდა"];

const clean = (v: unknown) =>
  (typeof v === "string" || typeof v === "number" ? String(v) : "")
    .replace(/\s+/g, " ")
    .trim();

export function parseOnwayWebhook(body: unknown, deliveredIds: string[] = [], notDeliveredIds: string[] = []): OnwayWebhookInfo {
  const info = (body && typeof body === "object" ? (body as any).order_info : null) || {};
  const tracking = clean(info.trackingnumber) || clean(info.traking) || null;
  const statusName = clean(info.status);
  const statusId = clean(info.order_status_id);
  const ids = deliveredIds.map(clean).filter(Boolean);
  const delivered =
    DELIVERED_NAMES.includes(statusName.toLowerCase()) || (!!statusId && ids.includes(statusId));
  const failIds = notDeliveredIds.map(clean).filter(Boolean);
  const notDelivered =
    !delivered && (NOT_DELIVERED_NAMES.includes(statusName.toLowerCase()) || (!!statusId && failIds.includes(statusId)));
  return {tracking, statusName, statusId, delivered, notDelivered};
}
