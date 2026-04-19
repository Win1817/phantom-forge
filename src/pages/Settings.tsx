import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { LogOut, Wand2, Save, Check, Camera, Loader2, User, Mail, Shield, Palette } from "lucide-react";
import { toast } from "sonner";

const Settings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentName   = user?.user_metadata?.display_name ?? "";
  const currentAvatar = user?.user_metadata?.avatar_url   ?? "";

  const [displayName, setDisplayName] = useState(currentName);
  const [avatarUrl,   setAvatarUrl]   = useState(currentAvatar);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [uploading,   setUploading]   = useState(false);

  const initial = (displayName || user?.email || "P")[0].toUpperCase();

  // Sync if auth reloads
  useEffect(() => {
    setDisplayName(user?.user_metadata?.display_name ?? "");
    setAvatarUrl(user?.user_metadata?.avatar_url ?? "");
  }, [user]);

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const ext  = file.name.split(".").pop() ?? "jpg";
      const path = `avatars/${user.id}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

      setAvatarUrl(publicUrl);
      setAvatarPreview(null);

      // Persist to auth metadata
      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
      // Update profiles row if it exists (ignore error if it doesn't)
      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);

      toast.success("Profile picture updated.");
    } catch (err) {
      setAvatarPreview(null);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const saveProfile = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) { toast.error("Planeswalker name cannot be empty."); return; }
    setSaving(true);
    try {
      const { error: metaErr } = await supabase.auth.updateUser({ data: { display_name: trimmed } });
      if (metaErr) throw metaErr;
      // Update profiles row if it exists (ignore error if it doesn't)
      await supabase.from("profiles").update({ display_name: trimmed }).eq("id", user!.id);
      toast.success("Profile saved.");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const displayAvatar = avatarPreview ?? avatarUrl;

  return (
    <div className="space-y-8 animate-fade-in max-w-2xl">
      <div>
        <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your profile and account preferences.</p>
      </div>

      {/* ── Profile Card ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Banner */}
        <div className="h-24 bg-arcane relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,hsl(var(--primary)/0.25),transparent_70%)]" />
        </div>

        {/* Avatar + info */}
        <div className="px-6 pb-6">
          <div className="flex items-end gap-4 -mt-10 mb-5">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div
                onClick={handleAvatarClick}
                className="group relative h-20 w-20 rounded-full border-4 border-card bg-arcane ring-2 ring-primary/40 cursor-pointer overflow-hidden"
              >
                {displayAvatar ? (
                  <img src={displayAvatar} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-fantasy text-2xl font-bold text-primary">
                    {initial}
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploading
                    ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                    : <Camera className="h-5 w-5 text-white" />
                  }
                </div>
              </div>
              {/* Upload badge */}
              <button
                onClick={handleAvatarClick}
                className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card hover:bg-primary-glow transition-colors"
                title="Change photo"
              >
                <Camera className="h-3 w-3" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>

            <div className="mb-1 min-w-0">
              <p className="font-fantasy text-lg font-semibold leading-tight truncate">
                {displayName || "Unnamed Planeswalker"}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>

          <Separator className="mb-5 bg-border/60" />

          {/* Fields */}
          <div className="space-y-5">
            {/* Display name */}
            <div className="space-y-2">
              <Label htmlFor="displayName" className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                <User className="h-3.5 w-3.5" /> Planeswalker Name
              </Label>
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
                  onClick={saveProfile}
                  disabled={saving || displayName.trim() === currentName}
                  className="h-10 px-4 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 shrink-0"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : saved ? (
                    <><Check className="h-4 w-4 mr-1.5" /> Saved</>
                  ) : (
                    <><Save className="h-4 w-4 mr-1.5" /> Save</>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/60">
                Shown on your profile and used for sign-in instead of your email.
              </p>
            </div>

            {/* Email — read only */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                <Mail className="h-3.5 w-3.5" /> Email
              </Label>
              <div className="flex h-10 items-center rounded-md border border-border/40 bg-secondary/20 px-3 text-sm text-muted-foreground">
                {user?.email}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Security ── */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="h-4 w-4 text-primary" />
          <h2 className="font-fantasy text-lg">Security</h2>
        </div>
        <Separator className="bg-border/60" />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Sign out</p>
            <p className="text-xs text-muted-foreground">End your current session.</p>
          </div>
          <Button
            variant="outline"
            onClick={signOut}
            className="border-destructive/40 text-destructive hover:bg-destructive/10 shrink-0"
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>

      {/* ── Preferences (coming soon) ── */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4 opacity-60">
        <div className="flex items-center gap-2 mb-1">
          <Palette className="h-4 w-4 text-primary" />
          <h2 className="font-fantasy text-lg">Preferences</h2>
        </div>
        <Separator className="bg-border/60" />
        <p className="text-sm text-muted-foreground">Currency, language, and display preferences — coming soon.</p>
      </div>
    </div>
  );
};

export default Settings;
