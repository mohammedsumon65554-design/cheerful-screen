import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function adm() {
  const s = await import("./admin.server");
  await s.requireAdmin();
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  return { s, db };
}

const STATUSES = ["pending", "processing", "completed", "partial", "rejected", "canceled"] as const;

export const adminListApiOrders = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ status: z.enum(["all", ...STATUSES]), q: z.string().max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await adm();
    let q = db.from("orders").select("id,order_code,user_id,service_name,platform_name,link,quantity,delivered_qty,charge,refunded,status,admin_note,created_at")
      .eq("source", "api").order("created_at", { ascending: false }).limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const term = data.q.trim();
    if (term) q = q.or(`order_code.ilike.%${term.replace(/[%,()]/g, "")}%,link.ilike.%${term.replace(/[%,()]/g, "")}%`);
    const { data: orders } = await q;
    const ids = [...new Set((orders ?? []).map((o) => o.user_id))];
    const { data: profs } = ids.length ? await db.from("profiles").select("id,public_id,username").in("id", ids) : { data: [] };
    const pm = new Map((profs ?? []).map((p) => [p.id, p]));
    const { count: pending } = await db.from("orders").select("id", { count: "exact", head: true }).eq("source", "api").in("status", ["pending", "processing"]);
    return { pending: pending ?? 0, orders: (orders ?? []).map((o) => ({ ...o, reseller: pm.get(o.user_id) ?? null })) };
  });

export const adminSetOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    id: z.string().uuid(), status: z.enum(STATUSES), delivered: z.number().int().min(0).nullable(), note: z.string().max(500).nullable(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { s, db } = await adm();
    const { data: r, error } = await db.rpc("admin_set_order_status", { _order: data.id, _status: data.status, ...(data.delivered != null ? { _delivered: data.delivered } : {}), ...(data.note ? { _note: data.note } : {}) });
    if (error) {
      const msg = error.message.includes("ORDER_FINAL") ? "This order is already closed and refunded." : error.message.includes("BAD_DELIVERED") ? "Delivered amount must be between 0 and less than the quantity." : "Could not update order";
      return { ok: false as const, error: msg };
    }
    const res = r as { refunded: number; old_status: string };
    const { data: o } = await db.from("orders").select("user_id,order_code").eq("id", data.id).single();
    if (o) await db.from("notifications").insert({ user_id: o.user_id, kind: "notification", title: `Order ${o.order_code}: ${data.status}`,
      body: Number(res.refunded) > 0 ? `$${Number(res.refunded).toFixed(2)} was refunded to your balance.` : `Your order is now ${data.status}.` });
    await s.logAdmin("order_status_changed", { id: data.id, refunded: res.refunded }, { status: res.old_status }, { status: data.status, delivered: data.delivered });
    return { ok: true as const, refunded: Number(res.refunded) };
  });

export const adminListApiKeys = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ q: z.string().max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await adm();
    let q = db.from("profiles").select("id,public_id,username,full_name,email,balance,api_key,api_enabled,api_key_created_at")
      .not("api_key_hash", "is", null).order("api_key_created_at", { ascending: false }).limit(200);
    const t = data.q.trim().replace(/[%,()]/g, "");
    if (t) q = q.or(`public_id.ilike.%${t}%,username.ilike.%${t}%,email.ilike.%${t}%,full_name.ilike.%${t}%`);
    const { data: rows } = await q;
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const ids = (rows ?? []).map((r) => r.id);
    const { data: reqs } = ids.length ? await db.from("api_requests").select("user_id").in("user_id", ids).gte("created_at", since) : { data: [] };
    const cnt = new Map<string, number>();
    (reqs ?? []).forEach((r) => cnt.set(r.user_id, (cnt.get(r.user_id) ?? 0) + 1));
    return (rows ?? []).map((r) => ({ ...r, requests24h: cnt.get(r.id) ?? 0 }));
  });
