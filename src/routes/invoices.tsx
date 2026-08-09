import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/erp/Shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { currency, dateTime, downloadCsv } from "@/lib/format";
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

export const Route = createFileRoute("/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — Nexus ERP" },
      { name: "description", content: "GST invoices generated from confirmed challans, with payment status tracking." },
      { property: "og:title", content: "Invoices — Nexus ERP" },
      { property: "og:description", content: "Track issued, paid and cancelled invoices." },
    ],
  }),
  component: InvoicesPage,
});

type InvoiceRow = {
  id: string;
  invoice_number: string;
  challan_id: string | null;
  status: string;
  subtotal: number;
  tax_percent: number;
  total: number;
  created_at: string;
  customer_snapshot: Record<string, string | null> | null;
};

function InvoicesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as InvoiceRow[];
    },
  });

  const mark = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "paid" | "cancelled" }) => {
      const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice updated");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell
      title="Invoices"
      description={`${invoices.length} invoices · ${currency(invoices.reduce((s, i) => s + Number(i.total), 0))} billed`}
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                "invoices.csv",
                invoices.map((i) => ({
                  Invoice: i.invoice_number,
                  Customer: i.customer_snapshot?.["name"] ?? "",
                  Subtotal: i.subtotal,
                  Tax: i.tax_percent,
                  Total: i.total,
                  Status: i.status,
                  Date: i.created_at,
                })),
              )
            }
          >
            <Download className="size-4" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
        </>
      }
    >
      <div className="card-surface overflow-x-auto p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">Tax %</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : invoices.length ? (
              invoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.invoice_number}</TableCell>
                  <TableCell>{i.customer_snapshot?.["name"] ?? "—"}</TableCell>
                  <TableCell className="text-right">{currency(i.subtotal)}</TableCell>
                  <TableCell className="text-right">{i.tax_percent}%</TableCell>
                  <TableCell className="text-right font-semibold">{currency(i.total)}</TableCell>
                  <TableCell>
                    <Badge variant={i.status === "paid" ? "default" : "secondary"} className="capitalize">
                      {i.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{dateTime(i.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {i.challan_id ? (
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/challans/$challanId" params={{ challanId: i.challan_id }}>
                            Challan
                          </Link>
                        </Button>
                      ) : null}
                      {can("accounts") && i.status !== "paid" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => mark.mutate({ id: i.id, status: "paid" })}
                        >
                          Mark paid
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No invoices yet — confirm a challan and generate one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Shell>
  );
}