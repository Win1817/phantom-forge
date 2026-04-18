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
  { symbol: "W", bg: "hsl(48 90% 88%)", shadow: "hsl(48 90% 75% / 0.6)" },
  { symbol: "U", bg: "hsl(210 90% 60%)", shadow: "hsl(210 90% 60% / 0.6)" },
  { symbol: "B", bg: "hsl(270 30% 35%)", shadow: "hsl(270 30% 25% / 0.6)" },
  { symbol: "R", bg: "hsl(8 85% 58%)", shadow: "hsl(8 85% 58% / 0.6)" },
  { symbol: "G", bg: "hsl(135 55% 48%)", shadow: "hsl(135 55% 48% / 0.6)" },
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
    <div className="min-h-screen flex bg-background overflow-hidden">

      {/* ── LEFT PANEL — Brand ── */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col items-center justify-center p-12 overflow-hidden">

        {/* Layered atmospheric background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_50%_50%,hsl(270_60%_12%),hsl(240_14%_4%))]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_20%_80%,hsl(210_70%_15%/0.6),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_30%_at_80%_20%,hsl(42_78%_30%/0.15),transparent)]" />

        {/* Grid texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(hsl(42 78% 60% / 0.5) 1px, transparent 1px),
                              linear-gradient(90deg, hsl(42 78% 60% / 0.5) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />

        {/* Animated orb glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full"
          style={{ background: "radial-gradient(circle, hsl(270 60% 30% / 0.2) 0%, transparent 70%)", animation: "glow-pulse 4s ease-in-out infinite" }} />

        {/* Vertical divider line */}
        <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-primary/30 to-transparent" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-sm">

          {/* Logo — large hero treatment */}
          <div className="mb-8 relative">
            <div className="absolute inset-0 rounded-full blur-3xl scale-150"
              style={{ background: "radial-gradient(circle, hsl(42 78% 50% / 0.3), hsl(270 60% 40% / 0.2))", animation: "glow-pulse 3s ease-in-out infinite" }} />
            <img
              src="/logo.png"
              alt="PhantomMTG"
              className="relative w-64 h-auto object-contain drop-shadow-[0_0_40px_hsl(42_78%_50%/0.4)]"
              style={{ animation: "float 6s ease-in-out infinite" }}
            />
          </div>

          <h1 className="font-fantasy text-4xl font-bold text-gradient-gold leading-tight mb-3">
            PhantomMTG
          </h1>
          <p className="text-sm tracking-[0.25em] uppercase text-muted-foreground mb-8">
            Arcane Inventory & Deck Forge
          </p>

          {/* Mana symbols */}
          <div className="flex items-center gap-3 mb-10">
            {MANA_COLORS.map((m, i) => (
              <div
                key={m.symbol}
                className="flex items-center justify-center w-8 h-8 rounded-full font-bold text-xs ring-1 ring-black/30"
                style={{
                  background: m.bg,
                  color: m.symbol === "W" ? "#78350f" : "#fff",
                  boxShadow: `0 0 14px ${m.shadow}`,
                  animation: `float ${4 + i * 0.4}s ease-in-out infinite`,
                  animationDelay: `${i * 0.2}s`,
                }}
              >
                {m.symbol}
              </div>
            ))}
          </div>

          {/* Feature blurbs */}
          <div className="space-y-3 text-left w-full">
            {[
              { icon: "⚔️", text: "Track your entire collection" },
              { icon: "✨", text: "AI-powered deck building" },
              { icon: "🔍", text: "Search the full Scryfall database" },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="text-base">{f.icon}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom legal */}
        <p className="absolute bottom-6 text-[10px] text-muted-foreground/40 text-center px-8">
          PhantomMTG is an unofficial fan tool. Magic: The Gathering is a trademark of Wizards of the Coast.
        </p>
      </div>

      {/* ── RIGHT PANEL — Form ── */}
      <div className="flex-1 flex flex-col min-h-screen">

        {/* Mobile header */}
        <header className="flex items-center justify-between px-6 py-4 lg:hidden border-b border-border">
          <img src="/logo.png" alt="PhantomMTG" className="h-8 w-auto" />
          <Link to="/" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Home
          </Link>
        </header>

        {/* Desktop back link */}
        <div className="hidden lg:flex px-8 pt-6">
          <Link to="/" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to home
          </Link>
        </div>

        {/* Form area */}
        <div className="flex-1 flex items-center justify-center px-6 py-8">
          <div className="w-full max-w-sm animate-scale-in">

            {/* Mobile logo */}
            <div className="lg:hidden text-center mb-8">
              <img src="/logo.png" alt="PhantomMTG" className="w-28 h-auto mx-auto mb-4 drop-shadow-[0_0_20px_hsl(42_78%_50%/0.3)]" />
              <h1 className="font-fantasy text-2xl font-bold text-gradient-gold">PhantomMTG</h1>
            </div>

            {/* Heading */}
            <div className="mb-8">
              <h2 className="font-fantasy text-3xl font-bold text-foreground">
                {tab === "signin" ? "Welcome back" : "Join the forge"}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {tab === "signin"
                  ? "Enter your credentials to access your grimoire"
                  : "Create your account and start building"}
              </p>
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 p-1 rounded-lg bg-secondary/60 border border-border mb-6">
              {(["signin", "signup"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-all duration-200 ${
                    tab === t
                      ? "bg-card text-foreground shadow-sm ring-1 ring-border"
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
                    className="h-11 bg-secondary/40 border-border/60 focus-visible:ring-primary/50"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@multiverse.com"
                  autoComplete="email"
                  className="h-11 bg-secondary/40 border-border/60 focus-visible:ring-primary/50"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={tab === "signin" ? "current-password" : "new-password"}
                    className="h-11 bg-secondary/40 border-border/60 focus-visible:ring-primary/50 pr-11"
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
                  <p className="text-[11px] text-muted-foreground/70">Minimum 6 characters</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="w-full h-11 mt-2 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 font-semibold tracking-wide glow-gold transition-all"
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

            {/* Switch mode */}
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {tab === "signin" ? (
                <>
                  No account?{" "}
                  <button type="button" onClick={() => setTab("signup")} className="text-primary hover:text-primary/80 font-medium transition-colors">
                    Create one free
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button type="button" onClick={() => setTab("signin")} className="text-primary hover:text-primary/80 font-medium transition-colors">
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
