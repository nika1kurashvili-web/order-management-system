"use client";

import {useEffect, useState} from "react";
import {createClient} from "@/lib/supabase-browser";
import {parseDeliveryFee} from "@/lib/order-options";

export function useOnwayQuote({enabled, destination, weight, itemKey, onQuote}: {
  enabled: boolean; destination: number | null; weight: number | null; itemKey: string;
  onQuote: (value: string) => void;
}) {
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setPrice(null); setError(""); setLoading(false);
    if (!enabled || destination === null || weight === null) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const {data: {session}} = await createClient().auth.getSession();
        if (cancelled) return;
        if (!session?.access_token) throw new Error("session");
        const response = await fetch("/api/onway/price", {
          method: "POST", headers: {"Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`},
          body: JSON.stringify({to_city_id: destination, weight}), signal: controller.signal,
        });
        const data = await response.json();
        const result = parseDeliveryFee(data?.shipping_amount);
        if (!response.ok || result === null) throw new Error("quote");
        if (cancelled) return;
        setPrice(result);
        onQuote(result.toFixed(2));
      } catch {
        if (!cancelled) setError("OnWay-ის ფასის მიღება ვერ მოხერხდა. მიტანის საფასური მიუთითეთ ხელით.");
      } finally { if (!cancelled) setLoading(false); }
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [enabled, destination, weight, itemKey, onQuote]);
  return {price, loading, error};
}
