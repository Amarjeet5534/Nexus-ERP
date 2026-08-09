import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, IndianRupee, Package, Users, FileText } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Shell } from "@/components/erp/Shell";
import { supabase } from "@/integrations/supabase/client";
import { currency, shortDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Nexus ERP Operations Portal" },
      {
        name: "description",
        content:
          "Live overview of customers, stock levels, low-stock alerts, dispatch volume and pending follow-ups.",
      },
      { property: "og:title", content: "Dashboard — Nexus ERP Operations Portal" },
      {
        property: "og:description",
        content: "Live overview of customers, inventory, dispatches and follow-ups.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [customers, products, challans, followUps, invoices] = await Promise.all([
        supabase.from("customers").select("id,name,status,follow_up_date,business_name"),
        supabase.from("products").select("id,name,sku,current_stock,min_stock_alert,unit_price"),
        supabase
          .from("challans")
          .select("id,challan_number,status,total_quantity,total_amount,created_at,customer_snapshot")
          .order("created_at", { ascending: false }),
        supabase.from("follow_ups").select("id,note,next_follow_up,created_at,customer_id").order("created_at", {
          ascending: false,
        }),
        supabase.from("invoices").select("id,total,status"),
      ]);
      return {
        customers: customers.data ?? [],
        products: products.data ?? [],
        challans: challans.data ?? [],
        followUps: followUps.data ?? [],
        invoices: invoices.data ?? [],
      };
    },
  });

  const products = data?.products ?? [];
  const challans = data?.challans ?? [];
  const lowStock = products.filter((p) => p.current_stock <= p.min_stock_alert);
  const stockValue = products.reduce((s, p) => s + Number(p.unit_price) * p.current_stock, 0);
  const confirmed = challans.filter((c) => c.status === "confirmed");
  const outstanding = (data?.invoices ?? [])
    .filter((i) => i.status === "unpaid")
    .reduce((s, i) => s + Number(i.total), 0);
  const upcoming = (data?.customers ?? [])
    .filter((c) => c.follow_up_date)
    .sort((a, b) => String(a.follow_up_date).localeCompare(String(b.follow_up_date)))
    .slice(0, 5);

  const chart = Object.entries(
    confirmed.reduce<Record<string, number>>((acc, c) => {
      const key = new Date(c.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      acc[key] = (acc[key] ?? 0) + Number(c.total_amount);
      return acc;
    }, {}),
  )
    .slice(-7)
    .map(([label, value]) => ({ label, value }));

  const stats = [
    { label: "Customers", value: String(data?.customers.length ?? 0), icon: Users, to: "/customers" as const },
    { label: "Products", value: String(products.length), icon: Package, to: "/products" as const },
    { label: "Confirmed challans", value: String(confirmed.length), icon: FileText, to: "/challans" as const },
    { label: "Stock value", value: currency(stockValue), icon: IndianRupee, to: "/products" as const },
  ];

  return (
    <Shell title="Dashboard" description="Operations at a glance across sales, warehouse and accounts.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, to }) => (
          <Link key={label} to={to} className="card-surface p-4 transition-shadow hover:shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{label}</span>
              <Icon className="size-4 text-primary" />
            </div>
            <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="card-surface p-5 lg:col-span-2">
          <h2 className="text-base font-semibold">Dispatch value (recent confirmed challans)</h2>
          <div className="mt-4 h-64">
            {chart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <ReTooltip formatter={(v: number) => currency(v)} />
                  <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Confirm a challan to see dispatch trends.
              </div>
            )}
          </div>
        </div>

        <div className="card-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Low stock alerts</h2>
            <AlertTriangle className="size-4 text-warning" />
          </div>
          <ul className="mt-3 space-y-3">
            {lowStock.length ? (
              lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.sku}</p>
                  </div>
                  <Badge variant="destructive">
                    {p.current_stock} / {p.min_stock_alert}
                  </Badge>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">All products are above their alert level.</li>
            )}
          </ul>
          <Button asChild variant="outline" size="sm" className="mt-4 w-full">
            <Link to="/products">
              Manage inventory <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card-surface p-5">
          <h2 className="text-base font-semibold">Upcoming follow-ups</h2>
          <ul className="mt-3 divide-y divide-border">
            {upcoming.length ? (
              upcoming.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <Link to="/customers/$customerId" params={{ customerId: c.id }} className="hover:underline">
                    {c.name}
                    <span className="text-muted-foreground"> · {c.business_name ?? "—"}</span>
                  </Link>
                  <span className="text-muted-foreground">{shortDate(c.follow_up_date)}</span>
                </li>
              ))
            ) : (
              <li className="py-2 text-sm text-muted-foreground">No follow-ups scheduled.</li>
            )}
          </ul>
        </div>

        <div className="card-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Recent challans</h2>
            <span className="text-sm text-muted-foreground">Unpaid invoices: {currency(outstanding)}</span>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {challans.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <Link to="/challans/$challanId" params={{ challanId: c.id }} className="hover:underline">
                  {c.challan_number}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">{currency(c.total_amount)}</span>
                  <Badge variant={c.status === "confirmed" ? "default" : "secondary"} className="capitalize">
                    {c.status}
                  </Badge>
                </div>
              </li>
            ))}
            {!challans.length ? (
              <li className="py-2 text-sm text-muted-foreground">No challans yet.</li>
            ) : null}
          </ul>
        </div>
      </div>
    </Shell>
  );
}
