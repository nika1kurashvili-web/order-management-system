// Pure helpers for the Easy (easy.online.ge) status webhook (no I/O, easy to test).
// Same business rules as OnWay: only two outcomes change anything.
//   "ჩაბარებულია" -> delivered      "არ ჩაიბარა" -> return_pending (უნდა დაბრუნდეს)
export type EasyWebhookInfo = {
  tracking: string | null;
  statusName: string;
  statusId: string;
  delivered: boolean;
  notDelivered: boolean;
};

const DELIVERED_NAMES = ["ჩაბარებულია"];
// "არ ჩაიბარა", "დასაბრუნებელია გამგზავნთან" (7) and "ბრუნდება გამგზავნთან" (21) all mean the parcel is going back.
const NOT_DELIVERED_NAMES = ["არ ჩაიბარა", "დასაბრუნებელია გამგზავნთან", "ბრუნდება გამგზავნთან"];
// Status codes are used only when the payload carries no status name (the docs example
// shows 5 for "ჩაბარებულია" while the real list has 6, so a name always wins).
const DELIVERED_CODES = ["6"];
const NOT_DELIVERED_CODES = ["8", "7", "21"];

const clean = (v: unknown) =>
  (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/\s+/g, " ").trim();

export function parseEasyWebhook(body: unknown): EasyWebhookInfo {
  const root = body && typeof body === "object" ? (body as any) : {};
  const data = root.data && typeof root.data === "object" ? root.data : {};
  const tracking = clean(data.tracking_code) || null;
  const statusName = clean(data.new_status);
  const statusId = clean(data.new_status_code);
  const named = statusName !== "";
  const delivered = named ? DELIVERED_NAMES.includes(statusName) : DELIVERED_CODES.includes(statusId);
  const notDelivered = !delivered && (named ? NOT_DELIVERED_NAMES.includes(statusName) : NOT_DELIVERED_CODES.includes(statusId));
  return { tracking, statusName, statusId, delivered, notDelivered };
}
