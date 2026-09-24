"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { Status } from "@/lib/types";

const labels: Record<Status, string> = {
  new: "ახალი",
  confirmed: "დადასტურებული",
  shipping: "იგზავნება",
  delivered: "ჩაბარდა",
  returned: "დაბრუნდა",
  cancelled: "გაუქმდა",
};

const statusClass: Record<Status, string> = {
  new: "status-new",
  confirmed: "status-confirmed",
  shipping: "status-shipping",
  delivered: "status-delivered",
  returned: "status-returned",
  cancelled: "status-cancelled",
};

type Order = {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  total: number;
  status: Status;
  created_at: string;
  profiles?: { full_name: string | null } | null;
};

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [period, setPeriod] = useState<"all" | "today" | "7" | "30">("all");

  async function load() {
    setLoading(true);
    const { data, error } = await createClient()
      .from("orders")
      .select("*,profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(500);

    if (!error) setOrders((data || []) as Order[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filteredOrders = useMemo(() => {
    const now = new Date();

    return orders.filter((order) => {
      const q = search.trim().toLowerCase();

      const matchesSearch =
        !q ||
        String(order.order_number).toLowerCase().includes(q) ||
        (order.customer_name || "").toLowerCase().includes(q) ||
        (order.customer_phone || "").toLowerCase().includes(q) ||
        (order.profiles?.full_name || "").toLowerCase().includes(q);

      const matchesStatus = status === "all" || order.status === status;

      let matchesPeriod = true;
      if (period !== "all") {
        const days = period === "today" ? 1 : Number(period);
        const from = new Date(now);
        from.setDate(now.getDate() - (days - 1));
        from.setHours(0, 0, 0, 0);
        matchesPeriod = new Date(order.created_at) >= from;
      }

      return matchesSearch && matchesStatus && matchesPeriod;
    });
  }, [orders, search, status, period]);

  const count = (s: Status) => orders.filter((o) => o.status === s).length;

  const totalSales = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const deliveredSales = orders
    .filter((o) => o.status === "delivered")
    .reduce((sum, order) => sum + Number(order.total || 0), 0);

  return (
    <>
      <div className="top">
        <div>
          <div className="title">Dashboard</div>
          <div className="muted">შეკვეთების მართვის მთავარი გვერდი</div>
        </div>

        <div className="row">
          <button className="btn secondary" onClick={load}>
            ↻ განახლება
          </button>
          <Link className="btn" href="/orders/new">
            + ახალი შეკვეთა
          </Link>
        </div>
      </div>

      <div className="dashboard-summary">
        <div className="summary-card">
          <div className="muted">ყველა შეკვეთა</div>
          <div className="summary-value">{orders.length}</div>
        </div>
        <div className="summary-card">
          <div className="muted">საერთო გაყიდვები</div>
          <div className="summary-value">{totalSales.toFixed(2)} ₾</div>
        </div>
        <div className="summary-card">
          <div className="muted">ჩაბარებული თანხა</div>
          <div className="summary-value">{deliveredSales.toFixed(2)} ₾</div>
        </div>
      </div>

      <div className="cards">
        {(Object.keys(labels) as Status[]).map((s) => (
          <button
            className={`card card-button ${status === s ? "card-active" : ""}`}
            key={s}
            onClick={() => setStatus(status === s ? "all" : s)}
          >
            <div className="muted">{labels[s]}</div>
            <div className="num">{count(s)}</div>
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>შეკვეთები</h3>
            <div className="muted">ნაპოვნია: {filteredOrders.length}</div>
          </div>
        </div>

        <div className="filters">
          <div className="search-wrap">
            <span>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="მოძებნე №, სახელი, ტელეფონი ან თანამშრომელი..."
            />
          </div>

          <select value={status} onChange={(e) => setStatus(e.target.value as "all" | Status)}>
            <option value="all">ყველა სტატუსი</option>
            {(Object.keys(labels) as Status[]).map((s) => (
              <option key={s} value={s}>
                {labels[s]}
              </option>
            ))}
          </select>

          <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
            <option value="all">ყველა პერიოდი</option>
            <option value="today">დღეს</option>
            <option value="7">ბოლო 7 დღე</option>
            <option value="30">ბოლო 30 დღე</option>
          </select>

          <button
            className="btn secondary"
            onClick={() => {
              setSearch("");
              setStatus("all");
              setPeriod("all");
            }}
          >
            გასუფთავება
          </button>
        </div>

        {loading ? (
          <div className="empty">იტვირთება...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📭</div>
            <strong>შეკვეთები ვერ მოიძებნა</strong>
            <div className="muted">შეცვალე ფილტრები ან შექმენი ახალი შეკვეთა.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>მომხმარებელი</th>
                  <th>ტელეფონი</th>
                  <th>თანამშრომელი</th>
                  <th>ჯამი</th>
                  <th>სტატუსი</th>
                  <th>თარიღი</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <strong>#{order.order_number}</strong>
                    </td>
                    <td>{order.customer_name}</td>
                    <td className="muted">{order.customer_phone}</td>
                    <td>{order.profiles?.full_name || "—"}</td>
                    <td>
                      <strong>{Number(order.total).toFixed(2)} ₾</strong>
                    </td>
                    <td>
                      <span className={`badge ${statusClass[order.status]}`}>
                        {labels[order.status]}
                      </span>
                    </td>
                    <td className="muted">
                      {new Date(order.created_at).toLocaleDateString("ka-GE")}
                    </td>
                    <td>
                      <Link className="btn secondary" href={`/orders/${order.id}`}>
                        ნახვა
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
