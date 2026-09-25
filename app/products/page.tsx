"use client";

import ExcelImport from "./ExcelImport";
import PurchasePriceField from "./PurchasePriceField";
import {
  parsePurchasePrice,
  readPurchasePrices,
  PurchasePrice,
} from "@/lib/purchase-prices";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase-browser";

type EditTarget = {
  id: string;
  kind: "product" | "variant";
  productId?: string;
  name: string;
  sku: string;
  price: string;
  purchasePrice: string;
  weight: string;
};

export default function Products() {
  const [items, setItems] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [role, setRole] = useState("operator");

  const [name, setName] = useState("");
  const [price, setPrice] = useState(0);
  const [sku, setSku] = useState("");
  const [weight, setWeight] = useState("1");
  const [search, setSearch] = useState("");

  const [open, setOpen] = useState<string | null>(null);

  const [vname, setVname] = useState("");
  const [vprice, setVprice] = useState(0);
  const [vsku, setVsku] = useState("");
  const [vweight, setVweight] = useState("");

  const [message, setMessage] = useState("");

  const [purchasePrice, setPurchasePrice] = useState("");
  const [variantPurchasePrice, setVariantPurchasePrice] = useState("");
  const [costs, setCosts] = useState<PurchasePrice[]>([]);
  const [costsReady, setCostsReady] = useState(false);

  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const deletingRef = useRef(false);

  const [pendingDeletion, setPendingDeletion] = useState<{
    id: string;
    name: string;
    kind: "product" | "variant";
  } | null>(null);

  const deleteDialog = useRef<HTMLDialogElement>(null);

  // EDIT POPUP
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const editRunning = useRef(false);
  const editDialog = useRef<HTMLDialogElement>(null);

  const costOf = (id: string, kind: "product" | "variant") => {
    const value = costs.find((c) =>
      kind === "product" ? c.product_id === id : c.variant_id === id
    )?.purchase_price;

    return value == null ? null : Number(value);
  };

  useEffect(() => {
    const dialog = deleteDialog.current;
    if (!dialog) return;

    if (pendingDeletion && role === "admin") {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [pendingDeletion, role]);

  useEffect(() => {
    const dialog = editDialog.current;
    if (!dialog) return;

    if (editTarget && role === "admin") {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [editTarget, role]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    return !q
      ? items
      : items.filter((p) =>
          (p.name || "").toLowerCase().includes(q)
        );
  }, [items, search]);

  async function load() {
    const c = createClient();

    setCosts([]);
    setCostsReady(false);

    const { data: u } = await c.auth.getUser();

    if (!u.user) {
      setRole("");
      return;
    }

    const { data: p } = await c
      .from("profiles")
      .select("role,active")
      .eq("id", u.user.id)
      .single();

    const currentRole = p?.active === true ? p.role : "";
    setRole(currentRole);

    const [
      { data, error },
      { data: v, error: ve },
    ] = await Promise.all([
      c.from("products").select("*").order("name"),
      c.from("product_variants").select("*").order("name"),
    ]);

    if (error || ve) {
      setMessage("პროდუქტების ჩატვირთვა ვერ მოხერხდა.");
    }

    setItems(data || []);
    setVariants(v || []);

    if (currentRole === "admin") {
      try {
        setCosts(await readPurchasePrices(c));
        setCostsReady(true);
      } catch (e) {
        setMessage(
          e instanceof Error
            ? e.message
            : "შესყიდვის ფასები ვერ ჩაიტვირთა."
        );
      }
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    if (role !== "admin" || !name.trim()) return;

    const w = Number(weight);

    if (!w || w <= 0) {
      setMessage("მიუთითე პროდუქტის წონა.");
      return;
    }

    let cost: number | null;

    try {
      cost = parsePurchasePrice(purchasePrice);
    } catch (e) {
      setMessage((e as Error).message);
      return;
    }

    const { error } = await createClient().rpc(
      "nexo_create_catalog_item",
      {
        p_kind: "product",
        p_item: {
          name: name.trim(),
          price: Number(price),
          sku: sku || null,
          weight_kg: w,
        },
        p_purchase_price: cost,
      }
    );

    if (error) {
      setMessage("პროდუქტი ვერ დაემატა: " + error.message);
      return;
    }

    setName("");
    setPurchasePrice("");
    setPrice(0);
    setSku("");
    setWeight("1");
    setMessage("პროდუქტი დაემატა.");

    await load();
  }

  async function updateProduct(p: any, patch: any) {
    if (role !== "admin") return;

    const { error } = await createClient()
      .from("products")
      .update(patch)
      .eq("id", p.id);

    if (error) {
      setMessage("ცვლილება ვერ შეინახა: " + error.message);
      return;
    }

    await load();
  }

  async function addVariant(product: any) {
    if (role !== "admin" || !vname.trim()) return;

    let cost: number | null;

    try {
      cost = parsePurchasePrice(variantPurchasePrice);
    } catch (e) {
      setMessage((e as Error).message);
      return;
    }

    const { error } = await createClient().rpc(
      "nexo_create_catalog_item",
      {
        p_kind: "variant",
        p_item: {
          product_id: product.id,
          name: vname.trim(),
          price: Number(vprice),
          sku: vsku || null,
          weight_kg: vweight === "" ? null : Number(vweight),
        },
        p_purchase_price: cost,
      }
    );

    if (error) {
      setMessage("ვარიანტი ვერ დაემატა: " + error.message);
      return;
    }

    setVname("");
    setVariantPurchasePrice("");
    setVprice(Number(product.price));
    setVsku("");
    setVweight("");

    await load();
  }

  async function toggleVariant(v: any) {
    if (role !== "admin") return;

    const { error } = await createClient()
      .from("product_variants")
      .update({ active: !v.active })
      .eq("id", v.id);

    if (error) {
      setMessage("ცვლილება ვერ შეინახა: " + error.message);
    } else {
      await load();
    }
  }

  // =========================================================
  // EDIT PRODUCT / VARIANT
  // =========================================================

  function openProductEdit(product: any) {
    if (role !== "admin") return;

    setEditError("");

    setEditTarget({
      id: product.id,
      kind: "product",
      name: product.name ?? "",
      sku: product.sku ?? "",
      price: String(product.price ?? ""),
      purchasePrice:
        costOf(product.id, "product") == null
          ? ""
          : String(costOf(product.id, "product")),
      weight: String(product.weight_kg ?? ""),
    });
  }

  function openVariantEdit(variant: any) {
    if (role !== "admin") return;

    setEditError("");

    setEditTarget({
      id: variant.id,
      kind: "variant",
      productId: variant.product_id,
      name: variant.name ?? "",
      sku: variant.sku ?? "",
      price: String(variant.price ?? ""),
      purchasePrice:
        costOf(variant.id, "variant") == null
          ? ""
          : String(costOf(variant.id, "variant")),
      weight:
        variant.weight_kg == null
          ? ""
          : String(variant.weight_kg),
    });
  }

  async function saveEdit() {
    if (!editTarget || role !== "admin") return;
    if (editRunning.current) return;

    editRunning.current = true;
    setEditBusy(true);
    setEditError("");

    try {
      const c = createClient();

      // Fresh admin check
      const {
        data: { user },
        error: authError,
      } = await c.auth.getUser();

      if (authError || !user) {
        throw new Error("სესია დასრულებულია. თავიდან შედით სისტემაში.");
      }

      const { data: profile, error: profileError } = await c
        .from("profiles")
        .select("role,active")
        .eq("id", user.id)
        .single();

      if (
        profileError ||
        profile?.role !== "admin" ||
        profile.active !== true
      ) {
        throw new Error("რედაქტირება მხოლოდ აქტიურ Admin-ს შეუძლია.");
      }

      const cleanName = editTarget.name.trim();
      const cleanSku = editTarget.sku.trim();

      if (!cleanName) {
        throw new Error("დასახელება სავალდებულოა.");
      }

      const sellingPrice = Number(editTarget.price);

      if (
        editTarget.price.trim() === "" ||
        !Number.isFinite(sellingPrice) ||
        sellingPrice < 0
      ) {
        throw new Error("ფასი უნდა იყოს არაუარყოფითი რიცხვი.");
      }

      let purchaseCost: number | null;

      try {
        purchaseCost = parsePurchasePrice(
          editTarget.purchasePrice
        );
      } catch (e) {
        throw e;
      }

      let itemWeight: number | null = null;

      if (editTarget.kind === "product") {
        itemWeight = Number(editTarget.weight);

        if (
          editTarget.weight.trim() === "" ||
          !Number.isFinite(itemWeight) ||
          itemWeight <= 0
        ) {
          throw new Error("პროდუქტის წონა უნდა იყოს ნულზე მეტი.");
        }
      } else {
        if (editTarget.weight.trim() !== "") {
          itemWeight = Number(editTarget.weight);

          if (
            !Number.isFinite(itemWeight) ||
            itemWeight <= 0
          ) {
            throw new Error(
              "ვარიანტის წონა უნდა იყოს ნულზე მეტი ან დატოვეთ ცარიელი საბაზისო წონის გამოსაყენებლად."
            );
          }
        }
      }

      const table =
        editTarget.kind === "product"
          ? "products"
          : "product_variants";

      const patch =
        editTarget.kind === "product"
          ? {
              name: cleanName,
              sku: cleanSku || null,
              price: sellingPrice,
              weight_kg: itemWeight,
            }
          : {
              name: cleanName,
              sku: cleanSku || null,
              price: sellingPrice,
              weight_kg: itemWeight,
            };

      const { data: updated, error: updateError } = await c
        .from(table)
        .update(patch)
        .eq("id", editTarget.id)
        .select("id")
        .single();

      if (updateError) {
        if (updateError.code === "23505") {
          throw new Error(
            "ეს კოდი უკვე გამოყენებულია სხვა პროდუქტზე ან ვარიანტზე."
          );
        }

        throw new Error(
          "პროდუქტის მონაცემები ვერ განახლდა: " +
            updateError.message
        );
      }

      if (!updated) {
        throw new Error("ცვლილების შენახვა ვერ დადასტურდა.");
      }

      const costColumn =
        editTarget.kind === "product"
          ? "product_id"
          : "variant_id";

      const { error: costError } = await c
        .from("product_purchase_prices")
        .upsert(
          {
            [costColumn]: editTarget.id,
            purchase_price: purchaseCost,
          },
          { onConflict: costColumn }
        );

      if (costError) {
        throw new Error(
          "ძირითადი მონაცემები განახლდა, მაგრამ შესყიდვის ფასი ვერ შეინახა: " +
            costError.message
        );
      }

      const editedName = cleanName;

      setEditTarget(null);
      setMessage(`„${editedName}“ წარმატებით განახლდა.`);

      await load();
    } catch (e) {
      setEditError(
        e instanceof Error
          ? e.message
          : "ცვლილებების შენახვა ვერ მოხერხდა."
      );
    } finally {
      editRunning.current = false;
      setEditBusy(false);
    }
  }

  // =========================================================
  // DELETE
  // =========================================================

  async function permanentlyDelete() {
    if (deletingRef.current) return;

    if (role !== "admin") {
      setDeleteError("წაშლა მხოლოდ Admin-ს შეუძლია.");
      return;
    }

    if (!pendingDeletion) return;

    const item = pendingDeletion;
    const kind = item.kind;

    deletingRef.current = true;
    setPendingDeletion(null);

    try {
      setDeletingKey(`${kind}:${item.id}`);
      setDeleteError("");
      setMessage("");

      const c = createClient();

      const {
        data: auth,
        error: authError,
      } = await c.auth.getUser();

      if (authError || !auth.user) {
        throw new Error(
          "სესია დასრულებულია. თავიდან შედით სისტემაში."
        );
      }

      const {
        data: profile,
        error: profileError,
      } = await c
        .from("profiles")
        .select("role,active")
        .eq("id", auth.user.id)
        .single();

      if (
        profileError ||
        profile?.role !== "admin" ||
        profile.active === false
      ) {
        throw new Error(
          "წაშლა მხოლოდ აქტიურ Admin-ს შეუძლია."
        );
      }

      const table =
        kind === "product"
          ? "products"
          : "product_variants";

      const {
        data: deleted,
        error,
      } = await c
        .from(table)
        .delete()
        .eq("id", item.id)
        .select("id")
        .single();

      if (error) {
        throw new Error(
          error.code === "23503"
            ? "ჩანაწერი სხვა მონაცემებთან არის დაკავშირებული; მონაცემთა ბაზა წაშლას ბლოკავს. " +
                error.message
            : error.message
        );
      }

      if (!deleted || deleted.id !== item.id) {
        throw new Error(
          "წაშლა ვერ დადასტურდა. ჩანაწერი აღარ არსებობს ან წვდომა შეზღუდულია."
        );
      }

      if (kind === "product") {
        setItems((current) =>
          current.filter((product) => product.id !== item.id)
        );

        setVariants((current) =>
          current.filter(
            (variant) => variant.product_id !== item.id
          )
        );

        setOpen((current) =>
          current === item.id ? null : current
        );
      } else {
        setVariants((current) =>
          current.filter((variant) => variant.id !== item.id)
        );
      }

      setMessage(
        `${kind === "product" ? "პროდუქტი" : "ვარიანტი"} „${
          item.name
        }“ სამუდამოდ წაიშალა. შეკვეთების ისტორია შენარჩუნებულია.`
      );

      try {
        await load();
      } catch {
        setDeleteError(
          "წაშლა შესრულდა, მაგრამ სია ვერ განახლდა. განაახლეთ გვერდი."
        );
      }
    } catch (error) {
      setDeleteError(
        "წაშლა ვერ შესრულდა: " +
          (error instanceof Error
            ? error.message
            : "უცნობი შეცდომა.")
      );
    } finally {
      deletingRef.current = false;
      setDeletingKey(null);
    }
  }

  function requestDeletion(
    item: any,
    kind: "product" | "variant"
  ) {
    if (deletingRef.current || pendingDeletion) return;

    if (role !== "admin") {
      setDeleteError("წაშლა მხოლოდ Admin-ს შეუძლია.");
      return;
    }

    setPendingDeletion({
      id: item.id,
      name: item.name,
      kind,
    });
  }

  function deleteProduct(p: any) {
    requestDeletion(p, "product");
  }

  function deleteVariant(v: any) {
    requestDeletion(v, "variant");
  }

  return (
    <>
      {/* EDIT POPUP */}
      {role === "admin" && (
        <dialog
          ref={editDialog}
          aria-labelledby="edit-title"
          onCancel={(event) => {
            event.preventDefault();
            if (!editBusy) {
              setEditTarget(null);
              setEditError("");
            }
          }}
          style={{
            border: 0,
            borderRadius: 12,
            padding: 24,
            maxWidth: 600,
            width: "calc(100% - 32px)",
          }}
        >
          <h3 id="edit-title">
            {editTarget?.kind === "variant"
              ? "ვარიანტის რედაქტირება"
              : "პროდუქტის რედაქტირება"}
          </h3>

          {editTarget && (
            <div
              style={{
                display: "grid",
                gap: 14,
                marginTop: 16,
              }}
            >
              <div className="field">
                <label>დასახელება</label>
                <input
                  disabled={editBusy}
                  value={editTarget.name}
                  onChange={(e) =>
                    setEditTarget((current) =>
                      current
                        ? {
                            ...current,
                            name: e.target.value,
                          }
                        : current
                    )
                  }
                />
              </div>

              <div className="field">
                <label>კოდი</label>
                <input
                  disabled={editBusy}
                  value={editTarget.sku}
                  onChange={(e) =>
                    setEditTarget((current) =>
                      current
                        ? {
                            ...current,
                            sku: e.target.value,
                          }
                        : current
                    )
                  }
                />
              </div>

              <div className="field">
                <label>ფასი (₾)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={editBusy}
                  value={editTarget.price}
                  onChange={(e) =>
                    setEditTarget((current) =>
                      current
                        ? {
                            ...current,
                            price: e.target.value,
                          }
                        : current
                    )
                  }
                />
              </div>

              <div className="field">
                <label>შესყიდვის ფასი (₾)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="არ არის მითითებული"
                  disabled={editBusy}
                  value={editTarget.purchasePrice}
                  onChange={(e) =>
                    setEditTarget((current) =>
                      current
                        ? {
                            ...current,
                            purchasePrice: e.target.value,
                          }
                        : current
                    )
                  }
                />
              </div>

              <div className="field">
                <label>წონა (კგ)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder={
                    editTarget.kind === "variant"
                      ? "ცარიელი = საბაზისო პროდუქტის წონა"
                      : ""
                  }
                  disabled={editBusy}
                  value={editTarget.weight}
                  onChange={(e) =>
                    setEditTarget((current) =>
                      current
                        ? {
                            ...current,
                            weight: e.target.value,
                          }
                        : current
                    )
                  }
                />
              </div>

              {editError && (
                <div className="error" role="alert">
                  {editError}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  justifyContent: "flex-end",
                  marginTop: 8,
                }}
              >
                <button
                  type="button"
                  className="btn secondary"
                  disabled={editBusy}
                  onClick={() => {
                    setEditTarget(null);
                    setEditError("");
                  }}
                >
                  გაუქმება
                </button>

                <button
                  type="button"
                  className="btn"
                  disabled={editBusy}
                  onClick={() => void saveEdit()}
                >
                  {editBusy
                    ? "ინახება..."
                    : "ცვლილებების შენახვა"}
                </button>
              </div>
            </div>
          )}
        </dialog>
      )}

      {/* DELETE POPUP */}
      {role === "admin" && (
        <dialog
          ref={deleteDialog}
          aria-labelledby="delete-title"
          aria-describedby="delete-description"
          onCancel={(event) => {
            event.preventDefault();
            setPendingDeletion(null);
          }}
          style={{
            border: 0,
            borderRadius: 12,
            padding: 24,
            maxWidth: 480,
            width: "calc(100% - 32px)",
          }}
        >
          <h3 id="delete-title">სამუდამო წაშლა</h3>

          <p id="delete-description">
            ნამდვილად გსურთ{" "}
            {pendingDeletion?.kind === "product"
              ? "პროდუქტის"
              : "ვარიანტის"}{" "}
            „{pendingDeletion?.name}“ სამუდამოდ წაშლა? ეს
            მოქმედება ვერ გაუქმდება.
            {pendingDeletion?.kind === "product" &&
              " პროდუქტის ყველა ვარიანტიც სამუდამოდ წაიშლება."}
          </p>

          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              className="btn secondary"
              autoFocus
              onClick={() => setPendingDeletion(null)}
            >
              გაუქმება
            </button>

            <button
              type="button"
              className="btn danger"
              disabled={
                deletingKey !== null || !pendingDeletion
              }
              onClick={() => void permanentlyDelete()}
            >
              წაშლა
            </button>
          </div>
        </dialog>
      )}

      <div className="top">
        <div>
          <div className="title">პროდუქტები</div>
          <div className="muted">
            წონა გამოიყენება OnWay-ში გაგზავნისას
          </div>
        </div>
      </div>

      {message && (
        <div className="success-box" role="status">
          {message}
        </div>
      )}

      {deleteError && (
        <div className="error" role="alert">
          {deleteError}
        </div>
      )}

      {role === "admin" && (
        <ExcelImport onImported={load} />
      )}

      {role === "admin" && (
        <div className="panel">
          <h3>პროდუქტის დამატება</h3>

          <div className="formline">
            <div className="field">
              <label>დასახელება</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="field">
              <label>ფასი</label>
              <input
                type="number"
                value={price}
                onChange={(e) =>
                  setPrice(Number(e.target.value))
                }
              />
            </div>

            <div className="field">
              <label>შესყიდვის ფასი (₾)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={purchasePrice}
                onChange={(e) =>
                  setPurchasePrice(e.target.value)
                }
                placeholder="არ არის მითითებული"
              />
            </div>

            <div className="field">
              <label>კოდი</label>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
              />
            </div>

            <div className="field">
              <label>წონა (კგ)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>

            <button className="btn" onClick={() => void add()}>
              დამატება
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <div
          className="field"
          style={{ marginBottom: 12 }}
        >
          <label>პროდუქტის ძებნა</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ჩაწერე პროდუქტის სახელი..."
          />
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>დასახელება / ვარიანტები</th>
              <th>პროდუქტის კოდი</th>
              <th>ფასი</th>
              {role === "admin" && (
                <th>შესყიდვის ფასი</th>
              )}
              <th>წონა</th>
              <th>ვარიანტები</th>
              <th>სტატუსი</th>
              {role === "admin" && <th>მოქმედება</th>}
            </tr>
          </thead>

          <tbody>
            {filteredItems.map((p) => {
              const vs = variants.filter(
                (v) => v.product_id === p.id
              );

              return (
                <>
                  <tr key={p.id}>
                    <td>
                      <b>{p.name}</b>

                      {vs.length > 0 && (
                        <ul
                          style={{
                            listStyle: "none",
                            padding: 0,
                            margin: "8px 0 0",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {vs.map((v) => (
                            <li key={v.id}>
                              <b>{v.name}</b> — კოდი:{" "}
                              <span>{v.sku ?? "—"}</span> —{" "}
                              {Number(v.price).toFixed(2)} ₾ —{" "}
                              {Number(
                                v.weight_kg ??
                                  p.weight_kg ??
                                  0
                              ).toFixed(2)}{" "}
                              კგ
                              {role === "admin" &&
                                costsReady && (
                                  <span>
                                    {" "}
                                    · შესყიდვის ფასი:{" "}
                                    {costOf(
                                      v.id,
                                      "variant"
                                    ) === null
                                      ? "—"
                                      : costOf(
                                          v.id,
                                          "variant"
                                        )!.toFixed(2) +
                                        " ₾"}
                                  </span>
                                )}
                              {!v.active &&
                                " · არააქტიური"}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>

                    <td>{p.sku || "—"}</td>

                    <td>
                      {Number(p.price).toFixed(2)} ₾
                    </td>

                    {role === "admin" && (
                      <td>
                        {costsReady ? (
                          <PurchasePriceField
                            id={p.id}
                            kind="product"
                            value={costOf(
                              p.id,
                              "product"
                            )}
                            onSaved={load}
                          />
                        ) : (
                          "შესყიდვის ფასი მიუწვდომელია"
                        )}
                      </td>
                    )}

                    <td>
                      {Number(
                        p.weight_kg || 1
                      ).toFixed(2)}{" "}
                      კგ
                    </td>

                    <td>
                      {vs.length ? (
                        <button
                          className="variant-count"
                          onClick={() =>
                            setOpen(
                              open === p.id
                                ? null
                                : p.id
                            )
                          }
                        >
                          {vs.length} ვარიანტი
                        </button>
                      ) : role === "admin" ? (
                        <button
                          className="variant-count"
                          onClick={() => {
                            setOpen(p.id);
                            setVprice(Number(p.price));
                          }}
                        >
                          + ვარიანტი
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td>
                      {p.active
                        ? "აქტიური"
                        : "არააქტიური"}
                    </td>

                    {role === "admin" && (
                      <td>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            className="btn"
                            disabled={
                              deletingKey !== null
                            }
                            onClick={() =>
                              openProductEdit(p)
                            }
                          >
                            რედაქტირება
                          </button>

                          <button
                            className="btn secondary"
                            disabled={
                              deletingKey !== null
                            }
                            onClick={() =>
                              void updateProduct(p, {
                                active: !p.active,
                              })
                            }
                          >
                            {p.active
                              ? "გახადე არააქტიური"
                              : "გააქტიურე"}
                          </button>

                          <button
                            className="btn danger"
                            disabled={
                              deletingKey !== null
                            }
                            title="პროდუქტის სამუდამოდ წაშლა"
                            onClick={() =>
                              deleteProduct(p)
                            }
                          >
                            {deletingKey ===
                            `product:${p.id}`
                              ? "მუშავდება..."
                              : "წაშლა"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>

                  {open === p.id && (
                    <tr key={p.id + "-variants"}>
                      <td
                        colSpan={
                          role === "admin" ? 8 : 6
                        }
                      >
                        <div className="variant-box">
                          <h4>
                            {p.name} — ვარიანტები
                          </h4>

                          {vs.map((v) => (
                            <div
                              className="variant-row"
                              key={v.id}
                            >
                              <span>
                                <b>{v.name}</b> · კოდი:{" "}
                                {v.sku ?? "—"}
                              </span>

                              <span>
                                {Number(
                                  v.price
                                ).toFixed(2)}{" "}
                                ₾
                              </span>

                              <span>
                                {v.weight_kg != null
                                  ? `${Number(
                                      v.weight_kg
                                    ).toFixed(2)} კგ`
                                  : "საბაზისო წონა"}
                              </span>

                              <span>
                                {v.active
                                  ? "აქტიური"
                                  : "არააქტიური"}
                              </span>

                              {role === "admin" &&
                                costsReady && (
                                  <span>
                                    შესყიდვა:{" "}
                                    {costOf(
                                      v.id,
                                      "variant"
                                    ) === null
                                      ? "—"
                                      : `${costOf(
                                          v.id,
                                          "variant"
                                        )!.toFixed(
                                          2
                                        )} ₾`}
                                  </span>
                                )}

                              {role === "admin" && (
                                <span
                                  style={{
                                    display: "flex",
                                    gap: 6,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <button
                                    className="btn"
                                    disabled={
                                      deletingKey !==
                                      null
                                    }
                                    onClick={() =>
                                      openVariantEdit(v)
                                    }
                                  >
                                    რედაქტირება
                                  </button>

                                  <button
                                    className="btn secondary"
                                    disabled={
                                      deletingKey !==
                                      null
                                    }
                                    onClick={() =>
                                      void toggleVariant(v)
                                    }
                                  >
                                    {v.active
                                      ? "გამორთვა"
                                      : "ჩართვა"}
                                  </button>

                                  <button
                                    className="btn danger"
                                    disabled={
                                      deletingKey !==
                                      null
                                    }
                                    title="ვარიანტის სამუდამოდ წაშლა"
                                    onClick={() =>
                                      deleteVariant(v)
                                    }
                                  >
                                    {deletingKey ===
                                    `variant:${v.id}`
                                      ? "მუშავდება..."
                                      : "წაშლა"}
                                  </button>
                                </span>
                              )}
                            </div>
                          ))}

                          {role === "admin" && (
                            <div className="variant-add">
                              <input
                                placeholder="მაგ. Honda"
                                value={vname}
                                onChange={(e) =>
                                  setVname(
                                    e.target.value
                                  )
                                }
                              />

                              <input
                                placeholder="კოდი"
                                value={vsku}
                                onChange={(e) =>
                                  setVsku(
                                    e.target.value
                                  )
                                }
                              />

                              <input
                                type="number"
                                placeholder="ფასი"
                                value={vprice}
                                onChange={(e) =>
                                  setVprice(
                                    Number(
                                      e.target.value
                                    )
                                  )
                                }
                              />

                              <label>
                                შესყიდვის ფასი (₾)
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="არ არის მითითებული"
                                  value={
                                    variantPurchasePrice
                                  }
                                  onChange={(e) =>
                                    setVariantPurchasePrice(
                                      e.target.value
                                    )
                                  }
                                />
                              </label>

                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                placeholder="წონა (ცარიელი = საბაზისო)"
                                value={vweight}
                                onChange={(e) =>
                                  setVweight(
                                    e.target.value
                                  )
                                }
                              />

                              <button
                                className="btn"
                                onClick={() =>
                                  void addVariant(p)
                                }
                              >
                                ვარიანტის დამატება
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}