import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Eye, EyeOff, ArrowLeft, Sparkles } from "lucide-react";

const emailSchema = z.string().trim().email("Invalid email").max(255);
const passwordSchema = z.string().min(6, "At least 6 characters").max(72);

const MANA_COLORS = [
  { symbol: "W", bg: "hsl(48 90% 88%)", shadow: "hsl(48 90% 75% / 0.7)", color: "#78350f" },
  { symbol: "U", bg: "hsl(210 90% 60%)", shadow: "hsl(210 90% 60% / 0.7)", color: "#fff" },
  { symbol: "B", bg: "hsl(270 30% 35%)", shadow: "hsl(270 30% 25% / 0.7)", color: "#fff" },
  { symbol: "R", bg: "hsl(8 85% 58%)",   shadow: "hsl(8 85% 58% / 0.7)",   color: "#fff" },
  { symbol: "G", bg: "hsl(135 55% 48%)", shadow: "hsl(135 55% 48% / 0.7)", color: "#fff" },
];

const Auth = () => {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<"signin" | "signup">(
    params.get("mode") === "signup" ? "signup" : "signin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPw, setShowPw] = useState(false);
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
    <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center">

      {/* ── Full-screen atmospheric background ── */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_100%_at_50%_0%,hsl(270_60%_12%),hsl(240_14%_5%)_40%,hsl(240_14%_4%))]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_20%_80%,hsl(210_70%_15%/0.5),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_20%,hsl(42_78%_28%/0.12),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_50%_50%,hsl(270_50%_20%/0.25),transparent)]" />

      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(hsl(42 78% 60% / 1) 1px, transparent 1px),
                            linear-gradient(90deg, hsl(42 78% 60% / 1) 1px, transparent 1px)`,
          backgroundSize: "72px 72px",
        }}
      />

      {/* Central glow orb behind logo */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(ellipse, hsl(270 60% 30% / 0.18) 0%, transparent 70%)", animation: "glow-pulse 5s ease-in-out infinite" }}
      />

      {/* Back to home */}
      <Link
        to="/"
        className="absolute top-5 left-6 flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-foreground transition-colors z-20"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to home
      </Link>

      {/* ── Main card ── */}
      <div className="relative z-10 w-full max-w-md mx-auto px-4 py-10 animate-scale-in flex flex-col items-center gap-8">

        {/* Brand hero */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-5">
            <div
              className="absolute inset-0 rounded-full blur-3xl scale-150 pointer-events-none"
              style={{ background: "radial-gradient(circle, hsl(42 78% 50% / 0.28), hsl(270 60% 40% / 0.15))", animation: "glow-pulse 4s ease-in-out infinite" }}
            />
            <img
              src="/logo.png"
              alt="PhantomMTG"
              className="relative w-28 h-auto object-contain drop-shadow-[0_0_32px_hsl(42_78%_50%/0.45)]"
              style={{ animation: "float 6s ease-in-out infinite" }}
            />
          </div>

          <h1 className="font-fantasy text-4xl font-bold text-gradient-gold leading-tight">PhantomMTG</h1>
          <p className="mt-1 text-xs tracking-[0.3em] uppercase text-muted-foreground">Arcane Inventory & Deck Forge</p>

          {/* Mana orbs */}
          <div className="flex items-center gap-2.5 mt-5">
            {MANA_COLORS.map((m, i) => (
              <div
                key={m.symbol}
                className="flex items-center justify-center w-8 h-8 rounded-full font-bold text-xs ring-1 ring-black/30 select-none"
                style={{
                  background: m.bg,
                  color: m.color,
                  boxShadow: `0 0 16px ${m.shadow}`,
                  animation: `float ${4 + i * 0.35}s ease-in-out infinite`,
                  animationDelay: `${i * 0.18}s`,
                }}
              >
                {m.symbol}
              </div>
            ))}
          </div>
        </div>

        {/* Glass form card */}
        <div
          className="w-full rounded-2xl border border-white/[0.07] p-7 shadow-2xl"
          style={{
            background: "hsl(240 14% 8% / 0.75)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 25px 60px hsl(240 30% 0% / 0.5), 0 0 0 1px hsl(42 78% 60% / 0.07) inset",
          }}
        >
          {/* Heading */}
          <div className="mb-6 text-center">
            <h2 className="font-fantasy text-2xl font-bold text-foreground">
              {tab === "signin" ? "Welcome back" : "Join the forge"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tab === "signin" ? "Enter your credentials to access your grimoire" : "Create your account and start building"}
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 p-1 rounded-lg bg-secondary/40 border border-border/50 mb-5">
            {(["signin", "signup"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-all duration-200 ${
                  tab === t
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === "signup" && (
              <div className="space-y-1.5 animate-fade-in">
                <Label htmlFor="displayName" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Planeswalker name
                </Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jace, the Mind Sculptor"
                  maxLength={50}
                  className="h-11 bg-secondary/30 border-border/50 focus-visible:ring-primary/50"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@multiverse.com"
                autoComplete="email"
                className="h-11 bg-secondary/30 border-border/50 focus-visible:ring-primary/50"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={tab === "signin" ? "current-password" : "new-password"}
                  className="h-11 bg-secondary/30 border-border/50 focus-visible:ring-primary/50 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {tab === "signup" && (
                <p className="text-[11px] text-muted-foreground/60">Minimum 6 characters</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="w-full h-11 mt-1 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 font-semibold tracking-wide glow-gold transition-all"
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  Casting…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  {tab === "signup" ? "Forge account" : "Enter the grimoire"}
                </span>
              )}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {tab === "signin" ? (
              <>No account?{" "}<button type="button" onClick={() => setTab("signup")} className="text-primary hover:text-primary/80 font-medium transition-colors">Create one free</button></>
            ) : (
              <>Already have an account?{" "}<button type="button" onClick={() => setTab("signin")} className="text-primary hover:text-primary/80 font-medium transition-colors">Sign in</button></>
            )}
          </p>
        </div>

        {/* Legal */}
        <p className="text-[10px] text-muted-foreground/30 text-center px-4">
          PhantomMTG is an unofficial fan tool. Magic: The Gathering is a trademark of Wizards of the Coast.
        </p>
      </div>
    </div>
  );
};

export default Auth;
