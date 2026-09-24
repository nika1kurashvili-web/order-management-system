export type Status =
  | "current"
  | "shipping"
  | "delivered"
  | "cancelled"
  | "return_pending"
  | "returned"
  | "exchange";

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
