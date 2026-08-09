import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Shell } from "@/components/erp/Shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { currency, downloadCsv } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "Products & Inventory — Nexus ERP" },
      {
        name: "description",
        content: "Manage SKUs, unit prices, warehouse locations and stock levels with minimum-stock alerts.",
      },
      { property: "og:title", content: "Products & Inventory — Nexus ERP" },
      { property: "og:description", content: "SKU catalogue, live stock levels and stock-in/stock-out control." },
    ],
  }),
  component: ProductsPage,
});

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  unit_price: number;
  current_stock: number;
  min_stock_alert: number;
  location: string | null;
  image_url: string | null;
};

const schema = z.object({
  name: z.string().min(2, "Product name is required"),
  sku: z.string().min(2, "SKU is required"),
  category: z.string().optional(),
  unit_price: z.coerce.number().min(0, "Price cannot be negative"),
  current_stock: z.coerce.number().int().min(0, "Stock cannot be negative"),
  min_stock_alert: z.coerce.number().int().min(0, "Alert quantity cannot be negative"),
  location: z.string().optional(),
  image_url: z.string().url("Enter a valid URL").or(z.literal("")),
});

const EMPTY = {
  name: "",
  sku: "",
  category: "",
  unit_price: "0",
  current_stock: "0",
  min_stock_alert: "0",
  location: "",
  image_url: "",
};

function ProductsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [adjust, setAdjust] = useState<ProductRow | null>(null);
  const [adjustQty, setAdjustQty] = useState("1");
  const [adjustType, setAdjustType] = useState<"in" | "out">("in");
  const [adjustReason, setAdjustReason] = useState("");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data as ProductRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) {
        const map: Record<string, string> = {};
        for (const issue of parsed.error.issues) map[String(issue.path[0])] = issue.message;
        setErrors(map);
        throw new Error("Please fix the highlighted fields");
      }
      setErrors({});
      const v = parsed.data;
      const payload = {
        name: v.name,
        sku: v.sku.toUpperCase(),
        category: v.category || null,
        unit_price: v.unit_price,
        current_stock: v.current_stock,
        min_stock_alert: v.min_stock_alert,
        location: v.location || null,
        image_url: v.image_url || null,
      };
      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Product updated" : "Product added");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doAdjust = useMutation({
    mutationFn: async () => {
      if (!adjust) return;
      const { error } = await supabase.rpc("adjust_stock", {
        _product_id: adjust.id,
        _quantity: Number(adjustQty),
        _type: adjustType,
        _reason: adjustReason || (adjustType === "in" ? "Stock received" : "Manual issue"),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stock updated");
      setAdjust(null);
      setAdjustQty("1");
      setAdjustReason("");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter((p) => {
      const match =
        !needle ||
        [p.name, p.sku, p.category, p.location]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle));
      return match && (!onlyLow || p.current_stock <= p.min_stock_alert);
    });
  }, [products, q, onlyLow]);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY });
    setErrors({});
    setOpen(true);
  }

  function openEdit(p: ProductRow) {
    setEditing(p);
    setErrors({});
    setForm({
      name: p.name,
      sku: p.sku,
      category: p.category ?? "",
      unit_price: String(p.unit_price),
      current_stock: String(p.current_stock),
      min_stock_alert: String(p.min_stock_alert),
      location: p.location ?? "",
      image_url: p.image_url ?? "",
    });
    setOpen(true);
  }

  return (
    <Shell
      title="Products & inventory"
      description={`${filtered.length} SKUs · ${products.filter((p) => p.current_stock <= p.min_stock_alert).length} below alert level`}
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                "inventory.csv",
                filtered.map((p) => ({
                  Name: p.name,
                  SKU: p.sku,
                  Category: p.category ?? "",
                  UnitPrice: p.unit_price,
                  Stock: p.current_stock,
                  MinAlert: p.min_stock_alert,
                  Location: p.location ?? "",
                })),
              )
            }
          >
            <Download className="size-4" /> Export CSV
          </Button>
          {can("warehouse") ? (
            <Button size="sm" onClick={openNew}>
              <Plus className="size-4" /> Add product
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
              placeholder="Search product, SKU, category, location…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button variant={onlyLow ? "default" : "outline"} size="sm" onClick={() => setOnlyLow((v) => !v)}>
            Low stock only
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                filtered.map((p) => {
                  const low = p.current_stock <= p.min_stock_alert;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.sku}</p>
                      </TableCell>
                      <TableCell>{p.category ?? "—"}</TableCell>
                      <TableCell className="text-right">{currency(p.unit_price)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={low ? "destructive" : "secondary"}>
                          {p.current_stock} / min {p.min_stock_alert}
                        </Badge>
                      </TableCell>
                      <TableCell>{p.location ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {can("warehouse") ? (
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                              Edit
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setAdjust(p)}>
                              Adjust stock
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">View only</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No products found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit product" : "Add product"}</DialogTitle>
            <DialogDescription>SKU must be unique across the catalogue.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            {(
              [
                ["name", "Product name", "text"],
                ["sku", "SKU / code", "text"],
                ["category", "Category", "text"],
                ["unit_price", "Unit price (INR)", "number"],
                ["current_stock", "Current stock", "number"],
                ["min_stock_alert", "Minimum stock alert", "number"],
                ["location", "Warehouse / location", "text"],
                ["image_url", "Image URL (optional)", "text"],
              ] as const
            ).map(([key, label, type]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  type={type}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
                {errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : null}
              </div>
            ))}
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                Save product
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjust} onOpenChange={(v) => !v && setAdjust(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust stock — {adjust?.name}</DialogTitle>
            <DialogDescription>
              Every adjustment is written to the stock movement log. Stock can never go negative.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              doAdjust.mutate();
            }}
          >
            <div className="space-y-2">
              <Label>Movement type</Label>
              <Select value={adjustType} onValueChange={(v) => setAdjustType(v as "in" | "out")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Stock IN</SelectItem>
                  <SelectItem value="out">Stock OUT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Input id="reason" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdjust(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={doAdjust.isPending}>
                Apply movement
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}