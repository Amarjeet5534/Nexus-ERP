import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/erp/Shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { downloadCsv, shortDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CustomerDialog, type CustomerRow } from "@/components/erp/CustomerDialog";
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

export const Route = createFileRoute("/customers/")({
  head: () => ({
    meta: [
      { title: "Customers — Nexus ERP CRM" },
      {
        name: "description",
        content: "Search, add and edit wholesale, retail and distributor customers with follow-up tracking.",
      },
      { property: "og:title", content: "Customers — Nexus ERP CRM" },
      { property: "og:description", content: "Wholesale CRM with customer types, statuses and follow-ups." },
    ],
  }),
  component: CustomersPage,
});

const PAGE_SIZE = 8;

function CustomersPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [open, setOpen] = useState(false);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as CustomerRow[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Customer deleted");
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return customers.filter((c) => {
      const matches =
        !needle ||
        [c.name, c.mobile, c.email, c.business_name, c.gst_number]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle));
      return matches && (status === "all" || c.status === status) && (type === "all" || c.customer_type === type);
    });
  }, [customers, q, status, type]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <Shell
      title="Customers"
      description={`${filtered.length} of ${customers.length} customers`}
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                "customers.csv",
                filtered.map((c) => ({
                  Name: c.name,
                  Mobile: c.mobile,
                  Email: c.email ?? "",
                  Business: c.business_name ?? "",
                  GST: c.gst_number ?? "",
                  Type: c.customer_type,
                  Status: c.status,
                  FollowUp: c.follow_up_date ?? "",
                })),
              )
            }
          >
            <Download className="size-4" /> Export CSV
          </Button>
          {can("sales") ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="size-4" /> Add customer
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
              placeholder="Search name, mobile, business, GST…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <Select value={status} onValueChange={(v) => (setStatus(v), setPage(0))}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(v) => (setType(v), setPage(0))}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="retail">Retail</SelectItem>
              <SelectItem value="wholesale">Wholesale</SelectItem>
              <SelectItem value="distributor">Distributor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Follow-up</TableHead>
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
              ) : current.length ? (
                current.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        to="/customers/$customerId"
                        params={{ customerId: c.id }}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{c.business_name ?? "—"}</p>
                    </TableCell>
                    <TableCell>
                      <p>{c.mobile}</p>
                      <p className="text-xs text-muted-foreground">{c.email ?? "—"}</p>
                    </TableCell>
                    <TableCell className="capitalize">{c.customer_type}</TableCell>
                    <TableCell>
                      <Badge
                        variant={c.status === "active" ? "default" : c.status === "lead" ? "secondary" : "outline"}
                        className="capitalize"
                      >
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{shortDate(c.follow_up_date)}</TableCell>
                    <TableCell className="text-right">
                      {can("sales") ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditing(c);
                              setOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => remove.mutate(c.id)}
                            disabled={remove.isPending}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">View only</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No customers match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page + 1} of {pages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <CustomerDialog open={open} onOpenChange={setOpen} customer={editing} />
    </Shell>
  );
}