import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Nexus ERP Operations Portal" },
      {
        name: "description",
        content: "Employee sign in for the Nexus ERP wholesale operations portal with Admin, Sales, Warehouse and Accounts roles.",
      },
      { property: "og:title", content: "Sign in — Nexus ERP Operations Portal" },
      {
        property: "og:description",
        content: "Role-based employee access to customers, inventory, challans and invoices.",
      },
    ],
  }),
  component: AuthPage,
});

const ROLES: { value: AppRole; label: string; blurb: string }[] = [
  { value: "admin", label: "Admin", blurb: "Full access to every module" },
  { value: "sales", label: "Sales", blurb: "Customers, CRM and sales challans" },
  { value: "warehouse", label: "Warehouse", blurb: "Products and stock movements" },
  { value: "accounts", label: "Accounts", blurb: "Invoices and payment status" },
];

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("sales");

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back");
    navigate({ to: "/" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName || email.split("@")[0], role },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Account created — you can sign in now");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div
        className="hidden flex-col justify-between p-10 text-sidebar-foreground lg:flex"
        style={{ background: "var(--sidebar-gradient)" }}
      >
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-md bg-sidebar-primary font-display text-sm font-bold text-sidebar-primary-foreground">
            NX
          </div>
          <span className="font-display font-semibold">Nexus ERP</span>
        </div>
        <div className="max-w-md space-y-4">
          <h2 className="text-3xl font-semibold leading-tight">
            One portal for customers, stock and dispatch.
          </h2>
          <p className="text-sm opacity-80">
            Wholesale CRM, live inventory with negative-stock protection, auto-numbered sales challans and
            GST invoices — scoped to each team's role.
          </p>
          <ul className="space-y-2 text-sm opacity-80">
            {ROLES.map((r) => (
              <li key={r.value}>
                <span className="font-medium">{r.label}</span> — {r.blurb}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs opacity-60">Internal use only</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm card-surface p-6">
          <h1 className="text-2xl font-semibold">Employee access</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in, or register a role-based account.</p>
          <Tabs defaultValue="signin" className="mt-6">
            <TabsList className="w-full">
              <TabsTrigger value="signin" className="flex-1">
                Sign in
              </TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">
                Register
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form className="space-y-4" onSubmit={signIn}>
                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form className="space-y-4" onSubmit={signUp}>
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email2">Work email</Label>
                  <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">Password</Label>
                  <Input
                    id="password2"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Creating…" : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}