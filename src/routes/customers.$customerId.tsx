import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/erp/Shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { currency, dateTime, shortDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerDialog, type CustomerRow } from "@/components/erp/CustomerDialog";

export const Route = createFileRoute("/customers/$customerId")({
  head: () => ({
    meta: [
      { title: "Customer detail — Nexus ERP CRM" },
      {
        name: "description",
        content: "Full customer profile with contact details, follow-up history and dispatch history.",
      },
      { property: "og:title", content: "Customer detail — Nexus ERP CRM" },
      { property: "og:description", content: "Customer profile, follow-up notes and challan history." },
    ],
  }),
  component: CustomerDetail,
});

function CustomerDetail() {
  const { customerId } = Route.useParams();
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [next, setNext] = useState("");
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const [customer, followUps, challans] = await Promise.all([
        supabase.from("customers").select("*").eq("id", customerId).maybeSingle(),
        supabase
          .from("follow_ups")
          .select("*")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("challans")
          .select("id,challan_number,status,total_amount,total_quantity,created_at")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
      ]);
      if (customer.error) throw customer.error;
      return {
        customer: customer.data as CustomerRow | null,
        followUps: followUps.data ?? [],
        challans: challans.data ?? [],
      };
    },
  });

  const addFollowUp = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("follow_ups").insert({
        customer_id: customerId,
        note,
        next_follow_up: next || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      if (next) {
        const { error: upErr } = await supabase
          .from("customers")
          .update({ follow_up_date: next })
          .eq("id", customerId);
        if (upErr) throw upErr;
      }
    },
    onSuccess: () => {
      toast.success("Follow-up saved");
      setNote("");
      setNext("");
      qc.invalidateQueries({ queryKey: ["customer", customerId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const customer = data?.customer;

  return (
    <Shell
      title={customer?.name ?? "Customer"}
      description={customer?.business_name ?? "Customer profile"}
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link to="/customers">
              <ArrowLeft className="size-4" /> Back
            </Link>
          </Button>
          {can("sales") && customer ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              Edit customer
            </Button>
          ) : null}
        </>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !customer ? (
        <p className="text-sm text-muted-foreground">This customer no longer exists.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card-surface p-5 lg:col-span-2">
            <h2 className="text-base font-semibold">Profile</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Detail label="Mobile" value={customer.mobile} />
              <Detail label="Email" value={customer.email ?? "—"} />
              <Detail label="Business" value={customer.business_name ?? "—"} />
              <Detail label="GST number" value={customer.gst_number ?? "—"} />
              <Detail label="Customer type" value={customer.customer_type} />
              <Detail label="Follow-up date" value={shortDate(customer.follow_up_date)} />
              <div className="sm:col-span-2">
                <Detail label="Address" value={customer.address ?? "—"} />
              </div>
              <div className="sm:col-span-2">
                <Detail label="Notes" value={customer.notes ?? "—"} />
              </div>
            </dl>
            <div className="mt-4">
              <Badge className="capitalize">{customer.status}</Badge>
            </div>

            <h3 className="mt-8 text-base font-semibold">Dispatch history</h3>
            <ul className="mt-3 divide-y divide-border">
              {data?.challans.length ? (
                data.challans.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                    <Link to="/challans/$challanId" params={{ challanId: c.id }} className="hover:underline">
                      {c.challan_number}
                    </Link>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{c.total_quantity} units</span>
                      <span>{currency(c.total_amount)}</span>
                      <Badge variant="secondary" className="capitalize">
                        {c.status}
                      </Badge>
                    </div>
                  </li>
                ))
              ) : (
                <li className="py-2 text-sm text-muted-foreground">No challans for this customer yet.</li>
              )}
            </ul>
          </div>

          <div className="card-surface p-5">
            <h2 className="text-base font-semibold">Follow-up notes</h2>
            {can("sales") ? (
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!note.trim()) {
                    toast.error("Write a note first");
                    return;
                  }
                  addFollowUp.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="note">New note</Label>
                  <Textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="next">Next follow-up</Label>
                  <Input id="next" type="date" value={next} onChange={(e) => setNext(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={addFollowUp.isPending}>
                  Add follow-up
                </Button>
              </form>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Only sales and admin users can add notes.</p>
            )}

            <ul className="mt-6 space-y-3">
              {data?.followUps.length ? (
                data.followUps.map((f) => (
                  <li key={f.id} className="rounded-md border border-border bg-secondary/40 p-3 text-sm">
                    <p>{f.note}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dateTime(f.created_at)}
                      {f.next_follow_up ? ` · next ${shortDate(f.next_follow_up)}` : ""}
                    </p>
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted-foreground">No follow-ups logged.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      <CustomerDialog open={open} onOpenChange={setOpen} customer={customer ?? null} />
    </Shell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}