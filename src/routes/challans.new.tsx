import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/erp/Shell";
import { supabase } from "@/integrations/supabase/client";
import { currency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/challans/new")({
  head: () => ({
    meta: [
      { title: "New sales challan — Nexus ERP" },
      {
        name: "description",
        content: "Build a multi-line delivery challan with live stock validation before confirming dispatch.",
      },
      { property: "og:title", content: "New sales challan — Nexus ERP" },
      { property: "og:description", content: "Multi-product challan builder with stock checks." },
    ],
  }),
  component: NewChallanPage,
});

type Line = { productId: string; quantity: string };

function NewChallanPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: "", quantity: "1" }]);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", "options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id,name,business_name,mobile,email,address,gst_number")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,sku,unit_price,current_stock")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const rows = useMemo(
    () =>
      lines.map((l) => {
        const product = products.find((p) => p.id === l.productId);
        const qty = Number(l.quantity) || 0;
        const price = product?.unit_price ?? 0;
        const stock = product?.current_stock ?? 0;
        return { ...l, product, qty, price, total: qty * price, insufficient: !!product && qty > stock, stock };
      }),
    [lines, products],
  );

  const totals = rows.reduce(
    (acc, r) => ({ qty: acc.qty + r.qty, amount: acc.amount + r.total }),
    { qty: 0, amount: 0 },
  );
  const blocked = rows.some((r) => r.insufficient);

  const create = useMutation({
    mutationFn: async (confirmNow: boolean) => {
      if (!customerId) throw new Error("Select a customer");
      const valid = rows.filter((r) => r.product && r.qty > 0);
      if (!valid.length) throw new Error("Add at least one product line");
      if (blocked) throw new Error("One or more lines exceed available stock");
      const customer = customers.find((c) => c.id === customerId);

      const { data: challan, error } = await supabase
        .from("challans")
        .insert({
          customer_id: customerId,
          customer_snapshot: {
            name: customer?.name,
            business_name: customer?.business_name,
            phone: customer?.mobile,
            email: customer?.email,
            address: customer?.address,
            gst_number: customer?.gst_number,
          },
          notes: notes || null,
          total_quantity: totals.qty,
          total_amount: totals.amount,
        })
        .select("id,challan_number")
        .single();
      if (error) throw error;

      const { error: itemsError } = await supabase.from("challan_items").insert(
        valid.map((r) => ({
          challan_id: challan.id,
          product_id: r.product!.id,
          product_name: r.product!.name,
          sku: r.product!.sku,
          quantity: r.qty,
          unit_price: r.price,
          line_total: r.total,
        })),
      );
      if (itemsError) throw itemsError;

      if (confirmNow) {
        const { error: confirmError } = await supabase.rpc("confirm_challan", { _challan_id: challan.id });
        if (confirmError) throw confirmError;
      }
      return challan.id;
    },
    onSuccess: (id) => {
      toast.success("Challan saved");
      qc.invalidateQueries({ queryKey: ["challans"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      navigate({ to: "/challans/$challanId", params: { challanId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell title="New sales challan" description="Stock is only deducted when you confirm the challan.">
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card-surface space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.business_name ? `· ${c.business_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Dispatch notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>

          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={i} className="grid items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <div className="space-y-2">
                  <Label>Product</Label>
                  <Select
                    value={r.productId}
                    onValueChange={(v) =>
                      setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, productId: v } : l)))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} · {p.sku} (stock {p.current_stock})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {r.insufficient ? (
                    <p className="text-xs text-destructive">Only {r.stock} in stock</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    value={r.quantity}
                    onChange={(e) =>
                      setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, quantity: e.target.value } : l)))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Line total</Label>
                  <p className="pb-2 font-medium">{currency(r.total)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                  aria-label="Remove line"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLines((ls) => [...ls, { productId: "", quantity: "1" }])}
            >
              <Plus className="size-4" /> Add line
            </Button>
          </div>
        </div>

        <div className="card-surface h-fit space-y-3 p-4">
          <h2 className="font-semibold">Summary</h2>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total quantity</span>
            <span>{totals.qty}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total amount</span>
            <span className="font-semibold">{currency(totals.amount)}</span>
          </div>
          <div className="space-y-2 pt-2">
            <Button className="w-full" disabled={create.isPending || blocked} onClick={() => create.mutate(true)}>
              Save & confirm dispatch
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={create.isPending}
              onClick={() => create.mutate(false)}
            >
              Save as draft
            </Button>
          </div>
        </div>
      </div>
    </Shell>
  );
}