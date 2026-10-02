import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, UserPlus, Wifi, Ban, Wallet, PlusCircle, ShoppingCart } from "lucide-react";
import { adminUserStats } from "@/lib/admin-users.functions";
import { Card, ErrorState, PageTitle } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { money } from "@/lib/format";

export function useUserStats() {
  const fn = useServerFn(adminUserStats);
  return useQuery({ queryKey: ["admin", "user-stats"], queryFn: () => fn(), refetchInterval: 60_000 });
}

export function Stat({ icon: Icon, label, value, onClick }: { icon: typeof Users; label: string; value: string | number; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="glass flex items-center gap-3 rounded-3xl p-4 text-left disabled:cursor-default">
      <span className="bg-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-primary-foreground"><Icon className="h-5 w-5" /></span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block truncate font-display text-xl font-bold">{value}</span>
      </span>
    </button>
  );
}

export function AdminDashboard({ onGo }: { onGo: (id: string) => void }) {
  const { data, isLoading, isError } = useUserStats();
  return (
    <div>
      <PageTitle sub="Quick overview of your store.">Dashboard</PageTitle>
      {isError ? <ErrorState /> : isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-3xl" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon={Users} label="Total users" value={data.total} onClick={() => onGo("users")} />
          <Stat icon={UserPlus} label="New today" value={data.newToday} onClick={() => onGo("users")} />
          <Stat icon={Wifi} label="Online now" value={data.online} />
          <Stat icon={Ban} label="Banned" value={data.banned} />
          <Stat icon={Wallet} label="All user balances" value={money(data.totalBalance)} />
          <Stat icon={PlusCircle} label="Pending add funds" value={data.pendingDeposits} />
          <Stat icon={ShoppingCart} label="Pending orders" value={data.pendingOrders} />
        </div>
      )}
      <Card className="mt-4 text-sm text-muted-foreground">
        Sections marked "Soon" in the menu are being built next.
      </Card>
    </div>
  );
}
