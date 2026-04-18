import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { LogOut, Wand2, Save, Check } from "lucide-react";
import { toast } from "sonner";

const Settings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const currentName = user?.user_metadata?.display_name ?? "";
  const [displayName, setDisplayName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const saveDisplayName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) { toast.error("Planeswalker name cannot be empty."); return; }
    if (trimmed === currentName) { toast.info("No changes to save."); return; }

    setSaving(true);
    try {
      // 1. Update auth user_metadata
      const { error: metaErr } = await supabase.auth.updateUser({
        data: { display_name: trimmed },
      });
      if (metaErr) throw metaErr;

      // 2. Sync to profiles table so sign-in by name resolves correctly
      const { error: profileErr } = await supabase
        .from("profiles")
        .upsert({ id: user!.id, display_name: trimmed }, { onConflict: "id" });
      if (profileErr) throw profileErr;

      toast.success("Planeswalker name updated.");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update name";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">Settings</h1>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="font-fantasy">Account</CardTitle>
          <CardDescription>Your identity in the multiverse.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Email — read-only */}
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Email</p>
            <p className="text-sm text-foreground">{user?.email}</p>
          </div>

          {/* Planeswalker name — editable */}
          <div className="space-y-2">
            <Label htmlFor="displayName" className="text-xs uppercase tracking-wider text-muted-foreground">
              Planeswalker name
            </Label>
            <p className="text-[11px] text-muted-foreground/60 -mt-1">
              You can sign in with this name instead of your email address.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Wand2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => { setDisplayName(e.target.value); setSaved(false); }}
                  placeholder="Jace, the Mind Sculptor"
                  maxLength={50}
                  className="h-10 pl-9 bg-secondary/30 border-border/50 focus-visible:ring-primary/50"
                />
              </div>
              <Button
                onClick={saveDisplayName}
                disabled={saving || displayName.trim() === currentName}
                className="h-10 px-4 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 shrink-0"
              >
                {saving ? (
                  <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                ) : saved ? (
                  <><Check className="h-4 w-4 mr-1.5" /> Saved</>
                ) : (
                  <><Save className="h-4 w-4 mr-1.5" /> Save</>
                )}
              </Button>
            </div>
          </div>

          <div className="pt-1 border-t border-border/50">
            <Button variant="outline" onClick={signOut} className="border-destructive/40 text-destructive hover:bg-destructive/10">
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="font-fantasy">Preferences</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Currency, language, and API preferences are coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
