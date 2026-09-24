export type Status =
  | "new"
  | "confirmed"
  | "shipping"
  | "delivered"
  | "returned"
  | "cancelled";

export type Product = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  stock: number;
  active: boolean;
};

export type Profile = {
  id: string;
  full_name: string;
  role: "admin" | "operator";
  phone: string | null;
  active: boolean;
};
