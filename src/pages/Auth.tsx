import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const emailSchema = z.string().trim().email("Invalid email").max(255);
const passwordSchema = z.string().min(6, "At least 6 characters").max(72);

const Auth = () => {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/app", { replace: true });
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailResult = emailSchema.safeParse(email);
    const pwResult = passwordSchema.safeParse(password);
    if (!emailResult.success) { toast.error(emailResult.error.issues[0].message); return; }
    if (!pwResult.success) { toast.error(pwResult.error.issues[0].message); return; }

    setBusy(true);
    try {
      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({
          email: emailResult.data,
          password: pwResult.data,
          options: {
            emailRedirectTo: `${window.location.origin}/app`,
            data: { display_name: displayName.trim() || undefined },
          },
        });
        if (error) throw error;
        toast.success("Welcome, Planeswalker. Check your inbox if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailResult.data,
          password: pwResult.data,
        });
        if (error) throw error;
        toast.success("Welcome back.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/"><Logo /></Link>
        <Button asChild variant="ghost" size="sm"><Link to="/">← Home</Link></Button>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="relative w-full max-w-md animate-scale-in">
          <div className="pointer-events-none absolute -inset-8 rounded-3xl bg-primary/10 blur-3xl" />
          <div className="relative rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-elevated)] arcane-border">
            <div className="mb-6 text-center">
              <h1 className="font-fantasy text-2xl font-bold text-gradient-gold">Enter the Grimoire</h1>
              <p className="mt-1 text-sm text-muted-foreground">Sign in or forge a new account</p>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-2 bg-secondary/50">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <TabsContent value="signup" className="m-0 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="displayName">Planeswalker name</Label>
                    <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jace, the Mind Sculptor" maxLength={50} />
                  </div>
                </TabsContent>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@multiverse.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                </div>

                <Button type="submit" disabled={busy} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 glow-gold">
                  {busy ? "Casting…" : tab === "signup" ? "Forge account" : "Sign in"}
                </Button>
              </form>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Auth;
