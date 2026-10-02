import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, LogOut, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { adminLogout, adminStatus, changeAdminPassword } from "@/lib/admin.functions";
import { Card, PageTitle, Spinner, inputCls, labelCls } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin | Premium SMM Store" },
      { name: "description", content: "Store administration." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Admin | Premium SMM Store" },
      { property: "og:description", content: "Store administration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  ssr: false,
  component: AdminPage,
});

function AdminPage() {
  const status = useServerFn(adminStatus);
  const { data, isLoading } = useQuery({ queryKey: ["admin-status"], queryFn: () => status(), staleTime: 0 });
  if (isLoading) return <Skeleton className="h-64 rounded-3xl" />;
  if (!data?.admin) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-warning" />
        <p className="mt-3 font-semibold">Admin session required or expired.</p>
      </Card>
    );
  }
  return <AdminHome />;
}

function AdminHome() {
  const logout = useServerFn(adminLogout);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const out = async () => {
    await logout();
    qc.removeQueries({ queryKey: ["admin-status"] });
    toast.success("Logged out from admin");
    navigate({ to: "/" });
  };
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle sub="Full admin tools are being added step by step.">Admin Panel</PageTitle>
        <button onClick={out} className="btn-ghost-glow text-sm"><LogOut className="h-4 w-4" /> Logout from admin</button>
      </div>
      <ChangePassword />
    </div>
  );
}

function ChangePassword() {
  const change = useServerFn(changeAdminPassword);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.next.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (f.next !== f.confirm) { toast.error("Passwords do not match"); return; }
    setBusy(true);
    try {
      const r = await change({ data: { current: f.current, next: f.next } });
      if (!r.ok) toast.error(r.error);
      else { toast.success("Admin password changed"); setEditing(false); setF({ current: "", next: "", confirm: "" }); }
    } catch { toast.error("Session expired — log in again"); }
    finally { setBusy(false); }
  };
  return (
    <Card>
      <h2 className="label-premium mb-3 flex items-center gap-2 text-lg"><KeyRound className="h-5 w-5 text-primary" /> Change Admin Password</h2>
      {!editing ? (
        <div className="flex items-center justify-between">
          <span className="font-mono text-lg tracking-widest">••••••••</span>
          <button onClick={() => setEditing(true)} className="btn-glow !px-4 !py-2 text-sm">Change</button>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-3">
          {(["current", "next", "confirm"] as const).map((k) => (
            <div key={k}>
              <label className={labelCls} htmlFor={`pw-${k}`}>{k === "current" ? "Current password" : k === "next" ? "New password" : "Confirm new password"}</label>
              <input id={`pw-${k}`} type="password" autoComplete={k === "current" ? "current-password" : "new-password"} className={inputCls} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setEditing(false)} className="btn-ghost-glow">Cancel</button>
            <button disabled={busy} className="btn-glow">{busy && <Spinner />} Save</button>
          </div>
        </form>
      )}
    </Card>
  );
}
