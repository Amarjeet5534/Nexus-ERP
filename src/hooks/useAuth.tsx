import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "sales" | "warehouse" | "accounts";

type AuthState = {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  profileName: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  can: (...allowed: AppRole[]) => boolean;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setRoles([]);
        setProfileName(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const [rolesRes, profileRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      ]);
      if (!active) return;
      setRoles(((rolesRes.data ?? []) as { role: AppRole }[]).map((r) => r.role));
      setProfileName(profileRes.data?.full_name ?? null);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const value: AuthState = {
    user: session?.user ?? null,
    session,
    roles,
    profileName,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    can: (...allowed) => roles.includes("admin") || allowed.some((r) => roles.includes(r)),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}