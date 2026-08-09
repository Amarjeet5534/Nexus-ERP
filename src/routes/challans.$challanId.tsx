import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/erp/Shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { currency, dateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/challans/$challanId")({
  head: () => ({
    meta: [
      { title: "Challan detail — Nexus ERP" },
      { name: "description", content: "Review challan lines, confirm dispatch, cancel or raise an invoice." },
      { property: "og:title", content: "Challan detail — Nexus ERP" },
      { property: "og:description", content: "Challan lines, dispatch status and invoicing." },
    ],
  }),
  component: ChallanDetail,
});

function ChallanDetail() {
  const { challanId } = Route.useParams();
  const { can } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["challan", challanId],
    queryFn: async () => {
      const { data: challan, error } = await supabase
        .from("challans")
        .select("*")
        .eq("id", challanId)
        .single();
      if (error) throw error;
      const { data: items, error: itemsError } = await supabase
        .from("challan_items")
        .select("*")
        .eq("challan_id", challanId);
      if (itemsError) throw itemsError;
      const { data: invoice } = await supabase
        .from("invoices")
        .select("id,invoice_number")
        .eq("challan_id", challanId)
        .maybeSingle();
      return { challan, items: items ?? [], invoice };
    },
  });

  const setStatus = useMutation({
    mutationFn: async (action: "confirm" | "cancel") => {
      if (action === "confirm") {
        const { error } = await supabase.rpc("confirm_challan", { _challan_id: challanId });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("challans").update({ status: "cancelled" }).eq("id", challanId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Challan updated");
      qc.invalidateQueries({ queryKey: ["challan", challanId] });
      qc.invalidateQueries({ queryKey: ["challans"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const makeInvoice = useMutation({
    mutationFn: async () => {
      if (!data) return;
      const subtotal = Number(data.challan.total_amount);
      const { error } = await supabase.from("invoices").insert({
        challan_id: challanId,
        customer_snapshot: data.challan.customer_snapshot,
        subtotal,
        tax_percent: 18,
        total: Number((subtotal * 1.18).toFixed(2)),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice generated");
      qc.invalidateQueries({ queryKey: ["challan", challanId] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const snapshot = (data?.challan.customer_snapshot ?? {}) as Record<string, string | null>;

  return (
    <Shell
      title={data?.challan.challan_number ?? "Challan"}
      description={data ? `Created ${dateTime(data.challan.created_at)}` : "Loading…"}
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link to="/challans">
              <ArrowLeft className="size-4" /> Back
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
        </>
      }
    >
      {isLoading || !data ? (
        <p className="text-muted-foreground">Loading challan…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="card-surface p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      <p className="font-medium">{it.product_name}</p>
                      <p className="text-xs text-muted-foreground">{it.sku ?? ""}</p>
                    </TableCell>
                    <TableCell className="text-right">{it.quantity}</TableCell>
                    <TableCell className="text-right">{currency(it.unit_price)}</TableCell>
                    <TableCell className="text-right">{currency(it.line_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-4">
            <div className="card-surface space-y-2 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Status</h2>
                <Badge className="capitalize">{data.challan.status}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total quantity</span>
                <span>{data.challan.total_quantity}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total amount</span>
                <span className="font-semibold">{currency(data.challan.total_amount)}</span>
              </div>
              {data.challan.status === "draft" && can("warehouse") ? (
                <div className="grid gap-2 pt-2">
                  <Button onClick={() => setStatus.mutate("confirm")} disabled={setStatus.isPending}>
                    Confirm dispatch
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setStatus.mutate("cancel")}
                    disabled={setStatus.isPending}
                  >
                    Cancel challan
                  </Button>
                </div>
              ) : null}
              {data.challan.status === "confirmed" && !data.invoice && can("accounts") ? (
                <Button className="mt-2 w-full" onClick={() => makeInvoice.mutate()} disabled={makeInvoice.isPending}>
                  Generate invoice (18% GST)
                </Button>
              ) : null}
              {data.invoice ? (
                <p className="pt-2 text-sm text-muted-foreground">
                  Invoice <span className="font-medium text-foreground">{data.invoice.invoice_number}</span> raised.
                </p>
              ) : null}
            </div>

            <div className="card-surface space-y-1 p-4 text-sm">
              <h2 className="font-semibold">Customer</h2>
              <p>{snapshot["name"] ?? "—"}</p>
              <p className="text-muted-foreground">{snapshot["business_name"] ?? ""}</p>
              <p className="text-muted-foreground">{snapshot["phone"] ?? ""}</p>
              <p className="text-muted-foreground">{snapshot["address"] ?? ""}</p>
              {snapshot["gst_number"] ? (
                <p className="text-muted-foreground">GST: {snapshot["gst_number"]}</p>
              ) : null}
            </div>

            {data.challan.notes ? (
              <div className="card-surface p-4 text-sm">
                <h2 className="font-semibold">Notes</h2>
                <p className="mt-1 text-muted-foreground">{data.challan.notes}</p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Shell>
  );
}