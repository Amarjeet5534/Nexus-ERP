import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Plus, Search } from "lucide-react";
import { Shell } from "@/components/erp/Shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { currency, dateTime, downloadCsv } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/challans/")({
  head: () => ({
    meta: [
      { title: "Sales challans — Nexus ERP" },
      {
        name: "description",
        content: "Auto-numbered delivery challans with draft, confirmed and cancelled states and stock-safe dispatch.",
      },
      { property: "og:title", content: "Sales challans — Nexus ERP" },
      { property: "og:description", content: "Create, confirm and track delivery challans." },
    ],
  }),
  component: ChallansPage,
});

type ChallanRow = {
  id: string;
  challan_number: string;
  status: "draft" | "confirmed" | "cancelled";
  total_quantity: number;
  total_amount: number;
  created_at: string;
  customer_snapshot: { name?: string; business_name?: string } | null;
};

function ChallansPage() {
  const { can } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const { data: challans = [], isLoading } = useQuery({
    queryKey: ["challans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("challans")
        .select("id,challan_number,status,total_quantity,total_amount,created_at,customer_snapshot")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ChallanRow[];
    },
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return challans.filter((c) => {
      const match =
        !needle ||
        [c.challan_number, c.customer_snapshot?.name, c.customer_snapshot?.business_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle));
      return match && (status === "all" || c.status === status);
    });
  }, [challans, q, status]);

  return (
    <Shell
      title="Sales challans"
      description={`${filtered.length} challans`}
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                "challans.csv",
                filtered.map((c) => ({
                  Challan: c.challan_number,
                  Customer: c.customer_snapshot?.name ?? "",
                  Status: c.status,
                  Quantity: c.total_quantity,
                  Amount: c.total_amount,
                  Date: c.created_at,
                })),
              )
            }
          >
            <Download className="size-4" /> Export CSV
          </Button>
          {can("sales") ? (
            <Button asChild size="sm">
              <Link to="/challans/new">
                <Plus className="size-4" /> New challan
              </Link>
            </Button>
          ) : null}
        </>
      }
    >
      <div className="card-surface p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search challan number or customer…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Challan</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : filtered.length ? (
                filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        to="/challans/$challanId"
                        params={{ challanId: c.id }}
                        className="font-medium hover:underline"
                      >
                        {c.challan_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <p>{c.customer_snapshot?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{c.customer_snapshot?.business_name ?? ""}</p>
                    </TableCell>
                    <TableCell className="text-right">{c.total_quantity}</TableCell>
                    <TableCell className="text-right">{currency(c.total_amount)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          c.status === "confirmed" ? "default" : c.status === "draft" ? "secondary" : "outline"
                        }
                        className="capitalize"
                      >
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{dateTime(c.created_at)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No challans yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Shell>
  );
}