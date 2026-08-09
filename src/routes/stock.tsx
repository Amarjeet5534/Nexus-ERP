import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { Shell } from "@/components/erp/Shell";
import { supabase } from "@/integrations/supabase/client";
import { dateTime, downloadCsv } from "@/lib/format";
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

export const Route = createFileRoute("/stock")({
  head: () => ({
    meta: [
      { title: "Stock movements — Nexus ERP" },
      {
        name: "description",
        content: "Audit log of every stock IN and stock OUT movement with reason, user and timestamp.",
      },
      { property: "og:title", content: "Stock movements — Nexus ERP" },
      { property: "og:description", content: "Full inventory audit trail across warehouses." },
    ],
  }),
  component: StockPage,
});

type Movement = {
  id: string;
  quantity: number;
  movement_type: "in" | "out";
  reason: string | null;
  created_at: string;
  created_by: string | null;
  products: { name: string; sku: string } | null;
  createdByName?: string | null;
};

function StockPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id,quantity,movement_type,reason,created_at,created_by,products(name,sku)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Movement[];
      const { data: profiles } = await supabase.from("profiles").select("id,full_name");
      const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      return rows.map((r) => ({ ...r, createdByName: r.created_by ? names.get(r.created_by) ?? null : null }));
    },
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return movements.filter((m) => {
      const match =
        !needle ||
        [m.products?.name, m.products?.sku, m.reason]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle));
      return match && (type === "all" || m.movement_type === type);
    });
  }, [movements, q, type]);

  return (
    <Shell
      title="Stock movements"
      description={`${filtered.length} movements logged`}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCsv(
              "stock-movements.csv",
              filtered.map((m) => ({
                Date: m.created_at,
                Product: m.products?.name ?? "",
                SKU: m.products?.sku ?? "",
                Type: m.movement_type.toUpperCase(),
                Quantity: m.quantity,
                Reason: m.reason ?? "",
                By: m.createdByName ?? "",
              })),
            )
          }
        >
          <Download className="size-4" /> Export CSV
        </Button>
      }
    >
      <div className="card-surface p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search product, SKU or reason…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All movements</SelectItem>
              <SelectItem value="in">Stock IN</SelectItem>
              <SelectItem value="out">Stock OUT</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Created by</TableHead>
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
                filtered.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">{dateTime(m.created_at)}</TableCell>
                    <TableCell>
                      <p className="font-medium">{m.products?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{m.products?.sku ?? ""}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.movement_type === "in" ? "secondary" : "outline"}>
                        {m.movement_type.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{m.quantity}</TableCell>
                    <TableCell>{m.reason ?? "—"}</TableCell>
                    <TableCell>{m.createdByName ?? "—"}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No movements recorded yet.
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