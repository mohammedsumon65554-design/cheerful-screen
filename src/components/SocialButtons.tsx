import { useState } from "react";
import { SiGoogle, SiApple } from "react-icons/si";
import { toast } from "sonner";
import { lovable } from "@/integrations/lovable/index";

export function SocialButtons() {
  const [busy, setBusy] = useState<string | null>(null);
  const go = async (provider: "google" | "apple") => {
    setBusy(provider);
    const r = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (r.error) { toast.error("Sign-in failed. Please try again."); setBusy(null); return; }
    if (r.redirected) return;
    toast.success("Signed in");
    window.location.assign("/");
  };
  return (
    <div className="mt-5 space-y-2.5">
      <div className="flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />or<div className="h-px flex-1 bg-border" /></div>
      <button type="button" disabled={!!busy} onClick={() => go("google")} className="btn-ghost-glow w-full"><SiGoogle className="h-4 w-4" /> Continue with Google</button>
      <button type="button" disabled={!!busy} onClick={() => go("apple")} className="btn-ghost-glow w-full"><SiApple className="h-4 w-4" /> Continue with Apple</button>
    </div>
  );
}
