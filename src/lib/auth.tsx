import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;
type Ctx = {
  ready: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  verified: boolean;
  refreshProfile: () => Promise<void>;
};
const AuthCtx = createContext<Ctx>({
  ready: false, session: null, user: null, profile: null, verified: false, refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const user = session?.user ?? null;

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (!user) return setProfile(null);
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    setProfile(data);
  };

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    refreshProfile();
    const ch = supabase
      .channel(`profile-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (p) => setProfile(p.new as Profile))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <AuthCtx.Provider value={{ ready, session, user, profile, verified: !!user?.email_confirmed_at, refreshProfile }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
