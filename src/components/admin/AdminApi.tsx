import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Eye, EyeOff, RefreshCw, Search, Power, KeyRound, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { adminListApiOrders, adminSetOrderStatus, adminListApiKeys } from "@/lib/admin-api.functions";
import { adminApiKey } from "@/lib/admin-users.functions";
import { copy, money } from "@/lib/format";
import { Card, Empty, PageTitle, Spinner, StatusBadge, inputCls, labelCls } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUSES = ["pending", "processing", "completed", "partial", "rejected", "canceled"] as const;
type Status = (typeof STATUSES)[number];

export function AdminApi() {
  return (
    <div className="space-y-4">
      <PageTitle sub="Orders placed through the reseller API are delivered manually here.">API (Reseller)</PageTitle>
      <Tabs defaultValue="orders">
        <TabsList><TabsTrigger value="orders"><ShoppingCart className="mr-1.5 h-4 w-4" />API Orders</TabsTrigger><TabsTrigger value="keys"><KeyRound className="mr-1.5 h-4 w-4" />API Keys</TabsTrigger></TabsList>
        <TabsContent value="orders"><ApiOrders /></TabsContent>
        <TabsContent value="keys"><ApiKeys /></TabsContent>
      </Tabs>
    </div>
  );
}

type Order = Awaited<ReturnType<typeof adminListApiOrders>>["orders"][number];

function ApiOrders() {
  const list = useServerFn(adminListApiOrders);
  const [status, setStatus] = useState<"all" | Status>("all");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ o: Order; to: Status } | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["admin-api-orders", status, q], queryFn: () => list({ data: { status, q } }), refetchInterval: 15_000 });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input aria-label="Search API orders" placeholder="Search order ID or link" className={`${inputCls} !py-2 pl-9`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label="Filter status" className={`${inputCls} !w-auto !py-2`} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        <span className="rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning">{data?.pending ?? 0} waiting</span>
      </div>
      {isLoading ? <Skeleton className="h-64 rounded-3xl" /> : !data?.orders.length ? <Card><Empty text="No API orders yet." /></Card> : (
        <div className="space-y-2">
          {data.orders.map((o) => {
            const closed = o.status === "rejected" || o.status === "canceled" || o.status === "partial";
            return (
              <Card key={o.id} className="!p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => copy(o.order_code)} className="font-mono font-bold hover:text-primary">#{o.order_code}</button>
                      <StatusBadge status={o.status} />
                    </div>
                    <div className="mt-1 text-sm">{o.platform_name} · {o.service_name}</div>
                    <div className="text-xs text-muted-foreground">
                      Reseller <span className="font-mono">{o.reseller?.public_id ?? "—"}</span> ({o.reseller?.username ?? "unknown"}) · {new Date(o.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-bold text-primary">{money(Number(o.charge))}</div>
                    <div className="text-xs text-muted-foreground">Qty {o.quantity}{o.delivered_qty != null ? ` · delivered ${o.delivered_qty}` : ""}</div>
                    {Number(o.refunded) > 0 && <div className="text-xs text-success">Refunded {money(Number(o.refunded))}</div>}
                  </div>
                </div>
                <button onClick={() => copy(o.link)} className="mt-2 flex w-full items-center gap-2 rounded-xl bg-accent/50 px-3 py-2 text-left text-xs" aria-label="Copy link">
                  <span className="min-w-0 flex-1 truncate font-mono">{o.link}</span><Copy className="h-3.5 w-3.5 shrink-0" />
                </button>
                {!closed && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {STATUSES.filter((s) => s !== o.status).map((s) => (
                      <button key={s} onClick={() => setEdit({ o, to: s })}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize hover:bg-accent ${s === "rejected" || s === "canceled" ? "border-destructive/40 text-destructive" : "border-border"}`}>
                        {s === "partial" ? "Partial (refund)" : s}
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {edit && <StatusDialog o={edit.o} to={edit.to} onClose={() => setEdit(null)} />}
    </div>
  );
}

function StatusDialog({ o, to, onClose }: { o: Order; to: Status; onClose: () => void }) {
  const set = useServerFn(adminSetOrderStatus);
  const qc = useQueryClient();
  const [delivered, setDelivered] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const d = Number(delivered);
  const partialOk = delivered !== "" && Number.isInteger(d) && d >= 0 && d < o.quantity;
  const refund = to === "partial" ? (partialOk ? Math.round(Number(o.charge) * (o.quantity - d) / o.quantity * 100) / 100 : 0)
    : to === "rejected" || to === "canceled" ? Number(o.charge) : 0;
  const save = async () => {
    if (to === "partial" && !partialOk) { toast.error(`Enter delivered amount from 0 to ${o.quantity - 1}`); return; }
    setBusy(true);
    try {
      const r = await set({ data: { id: o.id, status: to, delivered: to === "partial" ? d : null, note: note.trim() || null } });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(r.refunded > 0 ? `Marked ${to} · refunded ${money(r.refunded)}` : `Marked ${to}`);
      qc.invalidateQueries({ queryKey: ["admin-api-orders"] });
      onClose();
    } catch { toast.error("Admin session expired — log in again"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle className="capitalize">Mark #{o.order_code} as {to}</DialogTitle>
        <div className="space-y-3">
          {to === "partial" && (
            <div>
              <label className={labelCls} htmlFor="delivered">Delivered quantity (of {o.quantity})</label>
              <input id="delivered" type="number" min={0} max={o.quantity - 1} className={inputCls} value={delivered} onChange={(e) => setDelivered(e.target.value)} autoFocus />
            </div>
          )}
          <div>
            <label className={labelCls} htmlFor="note">Note (optional)</label>
            <input id="note" className={inputCls} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </div>
          {refund > 0 && <p className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">{money(refund - Number(o.refunded))} will be refunded to the reseller's balance.</p>}
          {(to === "rejected" || to === "canceled" || to === "partial") && <p className="text-xs text-muted-foreground">This closes the order — it can't be changed afterwards.</p>}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onClose} className="btn-ghost-glow">Cancel</button>
            <button onClick={save} disabled={busy} className="btn-glow">{busy && <Spinner />} Confirm</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ApiKeys() {
  const list = useServerFn(adminListApiKeys);
  const act = useServerFn(adminApiKey);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["admin-api-keys", q], queryFn: () => list({ data: { q } }) });
  const run = async (id: string, action: "disable" | "enable" | "regenerate") => {
    try {
      const r = await act({ data: { id, action } });
      toast.success(action === "regenerate" ? "New key created — the old key stopped working" : action === "disable" ? "API access disabled" : "API access enabled");
      if (r.key) setShown((s) => ({ ...s, [id]: true }));
      qc.invalidateQueries({ queryKey: ["admin-api-keys"] });
    } catch { toast.error("Admin session expired — log in again"); }
  };
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input aria-label="Search resellers" placeholder="Search by User ID, username, email or name" className={`${inputCls} !py-2 pl-9`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading ? <Skeleton className="h-48 rounded-3xl" /> : !data?.length ? <Card><Empty text="No user has created an API key yet." /></Card> : data.map((u) => (
        <Card key={u.id} className="!p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="label-premium truncate">{u.full_name || u.username} <span className="font-mono text-xs text-muted-foreground">ID {u.public_id}</span></div>
              <div className="truncate text-xs text-muted-foreground">{u.email} · balance {money(Number(u.balance))} · {u.requests24h} requests in 24h</div>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.api_enabled ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>{u.api_enabled ? "Enabled" : "Disabled"}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-accent/50 px-3 py-2 text-xs">{u.api_key ? (shown[u.id] ? u.api_key : u.api_key.slice(0, 6) + "•".repeat(16) + u.api_key.slice(-4)) : "Key hidden (created before key viewing) — regenerate to view"}</code>
            {u.api_key && <>
              <button aria-label="Show key" onClick={() => setShown((s) => ({ ...s, [u.id]: !s[u.id] }))} className="rounded-lg p-2 hover:bg-accent">{shown[u.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              <button aria-label="Copy key" onClick={() => copy(u.api_key!)} className="rounded-lg p-2 hover:bg-accent"><Copy className="h-4 w-4" /></button>
            </>}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => run(u.id, u.api_enabled ? "disable" : "enable")} className="btn-ghost-glow !px-3 !py-1.5 text-xs"><Power className="h-3.5 w-3.5" /> {u.api_enabled ? "Disable" : "Enable"}</button>
            <button onClick={() => setConfirm({ id: u.id, name: u.username })} className="btn-ghost-glow !px-3 !py-1.5 text-xs"><RefreshCw className="h-3.5 w-3.5" /> Regenerate</button>
          </div>
        </Card>
      ))}
      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate key for {confirm?.name}?</AlertDialogTitle>
            <AlertDialogDescription>The current key stops working immediately. The user will see the new key on their API page.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirm) run(confirm.id, "regenerate"); setConfirm(null); }}>Regenerate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
