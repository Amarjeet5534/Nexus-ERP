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

function toAppRole(value: unknown): AppRole | null {
  if (value === "admin" || value === "sales" || value === "warehouse" || value === "accounts") {
    return value;
  }
  return null;
}

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

      const dbRoles = ((rolesRes.data ?? []) as { role: AppRole }[]).map((r) => r.role);
      const metadataRole = toAppRole(session?.user?.user_metadata?.role);
      const fallbackRole = metadataRole ?? "sales";
      const nextRoles = dbRoles.length ? dbRoles : [fallbackRole];
      setRoles(nextRoles);

      const nameFromMetadata = String(
        session?.user?.user_metadata?.full_name ?? session?.user?.email?.split("@")[0] ?? "",
      );
      setProfileName(profileRes.data?.full_name ?? (nameFromMetadata || null));

      // Best-effort backfill for accounts created before DB triggers/policies were applied.
      if (dbRoles.length === 0) {
        await supabase.from("user_roles").upsert({ user_id: userId, role: fallbackRole });
      }

      if (!profileRes.data?.full_name) {
        await supabase
          .from("profiles")
          .upsert({ id: userId, full_name: nameFromMetadata, email: session?.user?.email ?? null });
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, session?.user?.email, session?.user?.user_metadata]);

  const value: AuthState = {
    user: session?.user ?? null,
    session,
    roles,
    profileName,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    can: (...allowed) => {
      if (!session?.user) return false;
      if (!allowed.length) return true;
      if (!roles.length) return true;
      return allowed.some((role) => roles.includes(role));
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
