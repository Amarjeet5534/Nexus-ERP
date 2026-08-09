import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export type CustomerRow = {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  business_name: string | null;
  gst_number: string | null;
  customer_type: "retail" | "wholesale" | "distributor";
  address: string | null;
  status: "lead" | "active" | "inactive";
  follow_up_date: string | null;
  notes: string | null;
  created_at: string;
};

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  mobile: z.string().regex(/^[0-9+\-\s]{7,15}$/, "Enter a valid mobile number"),
  email: z.string().email("Enter a valid email").or(z.literal("")),
  business_name: z.string().optional(),
  gst_number: z
    .string()
    .regex(/^[0-9A-Z]{15}$/, "GST number must be 15 characters (A-Z, 0-9)")
    .or(z.literal("")),
  customer_type: z.enum(["retail", "wholesale", "distributor"]),
  address: z.string().optional(),
  status: z.enum(["lead", "active", "inactive"]),
  follow_up_date: z.string().optional(),
  notes: z.string().optional(),
});

type FormState = {
  name: string;
  mobile: string;
  email: string;
  business_name: string;
  gst_number: string;
  customer_type: "retail" | "wholesale" | "distributor";
  address: string;
  status: "lead" | "active" | "inactive";
  follow_up_date: string;
  notes: string;
};

const EMPTY: FormState = {
  name: "",
  mobile: "",
  email: "",
  business_name: "",
  gst_number: "",
  customer_type: "retail",
  address: "",
  status: "lead",
  follow_up_date: "",
  notes: "",
};

export function CustomerDialog({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: CustomerRow | null;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      customer
        ? {
            name: customer.name,
            mobile: customer.mobile,
            email: customer.email ?? "",
            business_name: customer.business_name ?? "",
            gst_number: customer.gst_number ?? "",
            customer_type: customer.customer_type,
            address: customer.address ?? "",
            status: customer.status,
            follow_up_date: customer.follow_up_date ?? "",
            notes: customer.notes ?? "",
          }
        : EMPTY,
    );
  }, [open, customer]);

  const save = useMutation({
    mutationFn: async (values: z.infer<typeof schema>) => {
      const payload = {
        name: values.name,
        mobile: values.mobile,
        email: values.email || null,
        business_name: values.business_name || null,
        gst_number: values.gst_number || null,
        customer_type: values.customer_type,
        address: values.address || null,
        status: values.status,
        follow_up_date: values.follow_up_date || null,
        notes: values.notes || null,
      };
      if (customer) {
        const { error } = await supabase.from("customers").update(payload).eq("id", customer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(customer ? "Customer updated" : "Customer added");
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) map[String(issue.path[0])] = issue.message;
      setErrors(map);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  const field = (key: keyof FormState) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit customer" : "Add customer"}</DialogTitle>
          <DialogDescription>CRM record used across challans and invoices.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <Field label="Customer name" error={errors["name"]}>
            <Input {...field("name")} required />
          </Field>
          <Field label="Mobile number" error={errors["mobile"]}>
            <Input {...field("mobile")} required />
          </Field>
          <Field label="Email" error={errors["email"]}>
            <Input type="email" {...field("email")} />
          </Field>
          <Field label="Business name" error={errors["business_name"]}>
            <Input {...field("business_name")} />
          </Field>
          <Field label="GST number (optional)" error={errors["gst_number"]}>
            <Input {...field("gst_number")} placeholder="27AABCU9603R1ZM" />
          </Field>
          <Field label="Customer type">
            <Select
              value={form.customer_type}
              onValueChange={(v) => setForm((f) => ({ ...f, customer_type: v as typeof f.customer_type }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retail">Retail</SelectItem>
                <SelectItem value="wholesale">Wholesale</SelectItem>
                <SelectItem value="distributor">Distributor</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof f.status }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Follow-up date">
            <Input type="date" {...field("follow_up_date")} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address">
              <Textarea rows={2} {...field("address")} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea rows={3} {...field("notes")} />
            </Field>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}