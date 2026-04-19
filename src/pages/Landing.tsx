import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Sparkles, Library, LayersIcon, Wand2, ScanLine, Heart } from "lucide-react";

/* ─── Injected keyframes ──────────────────────────────────── */
const KEYFRAMES = `
  @keyframes drift-a {
    0%,100% { transform: translate(0,0) scale(1); opacity:0.55; }
    35% { transform: translate(40px,-30px) scale(1.08); opacity:0.7; }
    70% { transform: translate(-20px,35px) scale(0.94); opacity:0.45; }
  }
  @keyframes drift-b {
    0%,100% { transform: translate(0,0) scale(1); opacity:0.45; }
    40% { transform: translate(-35px,20px) scale(1.1); opacity:0.65; }
    75% { transform: translate(25px,-40px) scale(0.9); opacity:0.35; }
  }
  @keyframes drift-c {
    0%,100% { transform: translate(0,0) scale(1); opacity:0.3; }
    50% { transform: translate(20px,25px) scale(1.15); opacity:0.5; }
  }
  @keyframes card-l {
    0%,100% { transform: perspective(900px) rotateY(-22deg) rotateX(6deg) translateY(0px); }
    50%      { transform: perspective(900px) rotateY(-18deg) rotateX(9deg) translateY(-18px); }
  }
  @keyframes card-r {
    0%,100% { transform: perspective(900px) rotateY(22deg) rotateX(-6deg) translateY(0px); }
    50%      { transform: perspective(900px) rotateY(18deg) rotateX(-9deg) translateY(-22px); }
  }
  @keyframes card-sm {
    0%,100% { transform: perspective(600px) rotateY(-18deg) rotateX(4deg) translateY(0px) scale(0.85); }
    50%      { transform: perspective(600px) rotateY(-14deg) rotateX(7deg) translateY(-12px) scale(0.85); }
  }
  @keyframes rune-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes rune-spin-rev {
    from { transform: rotate(0deg); }
    to   { transform: rotate(-360deg); }
  }
  @keyframes orbit {
    from { transform: rotate(0deg) translateX(var(--r)) rotate(0deg); }
    to   { transform: rotate(360deg) translateX(var(--r)) rotate(-360deg); }
  }
  @keyframes particle {
    0%   { transform: translateY(0) translateX(0) scale(1); opacity: 0.9; }
    100% { transform: translateY(-100px) translateX(var(--dx)) scale(0); opacity: 0; }
  }
  @keyframes hero-in {
    from { opacity:0; transform: translateY(28px); }
    to   { opacity:1; transform: translateY(0); }
  }
  @keyframes badge-in {
    from { opacity:0; transform: scale(0.85) translateY(10px); }
    to   { opacity:1; transform: scale(1) translateY(0); }
  }
  @keyframes gold-shimmer {
    0%   { background-position: -300% center; }
    100% { background-position: 300% center; }
  }
  @keyframes scan {
    0%   { transform: translateX(-100%) skewX(-12deg); }
    100% { transform: translateX(250%) skewX(-12deg); }
  }
  @keyframes feature-in {
    from { opacity:0; transform: translateY(20px) scale(0.97); }
    to   { opacity:1; transform: translateY(0) scale(1); }
  }
  @keyframes arcane-ring {
    0%,100% { box-shadow: 0 0 60px hsl(42 78% 50%/0.18), 0 0 120px hsl(270 60% 45%/0.1), inset 0 0 40px hsl(42 78% 50%/0.05); }
    50%      { box-shadow: 0 0 80px hsl(42 78% 50%/0.3),  0 0 160px hsl(270 60% 45%/0.18), inset 0 0 60px hsl(42 78% 50%/0.1); }
  }
  @keyframes cta-glow {
    0%,100% { box-shadow: 0 0 40px hsl(42 78% 50%/0.2), 0 0 80px hsl(270 60% 45%/0.1); }
    50%      { box-shadow: 0 0 80px hsl(42 78% 50%/0.4), 0 0 140px hsl(270 60% 45%/0.2); }
  }
`;

/* ─── Floating card component ─────────────────────────────── */
type CardSide = "left" | "right";
const FloatCard = ({ side, colors, title, type, delay = 0 }: {
  side: CardSide; colors: string[]; title: string; type: string; delay?: number;
}) => {
  const isLeft = side === "left";
  const animName = isLeft ? "card-l" : "card-r";
  const gradColors = colors.join(", ");

  return (
    <div
      style={{
        animation: `${animName} ${6 + delay * 0.5}s ease-in-out infinite`,
        animationDelay: `${delay}s`,
        width: 200,
        flexShrink: 0,
      }}
    >
      {/* Card frame */}
      <div style={{
        borderRadius: 12,
        border: "2px solid hsl(42 78% 55% / 0.6)",
        background: "hsl(240 14% 6% / 0.95)",
        boxShadow: `0 30px 80px hsl(240 30% 0% / 0.7), 0 0 30px hsl(42 78% 50% / 0.15)`,
        overflow: "hidden",
        position: "relative",
      }}>
        {/* Card art area */}
        <div style={{
          height: 130,
          background: `linear-gradient(135deg, ${gradColors})`,
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Shimmer overlay */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(45deg, transparent 30%, hsl(0 0% 100%/0.08) 50%, transparent 70%)",
            animation: "scan 3s ease-in-out infinite",
            animationDelay: `${delay + 1}s`,
          }} />
          {/* Art texture */}
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: "radial-gradient(circle at 30% 40%, hsl(0 0% 100%/0.12) 0%, transparent 50%)",
          }} />
        </div>

        {/* Name bar */}
        <div style={{
          padding: "6px 10px",
          borderTop: "1px solid hsl(42 78% 50%/0.3)",
          borderBottom: "1px solid hsl(42 78% 50%/0.15)",
          background: "hsl(240 14% 8%/0.9)",
          fontSize: 11, fontWeight: 600,
          color: "hsl(42 78% 80%)",
          fontFamily: "Cinzel, serif",
          letterSpacing: "0.05em",
          display: "flex", justifyContent: "space-between",
        }}>
          <span>{title}</span>
          <span style={{ color: "hsl(42 78% 60%)", fontSize: 10 }}>{"{3}"}</span>
        </div>

        {/* Text box */}
        <div style={{
          padding: "8px 10px 10px",
          background: "hsl(240 12% 7%/0.95)",
        }}>
          <div style={{ fontSize: 9, color: "hsl(240 8% 50%)", fontStyle: "italic", marginBottom: 4 }}>
            {type}
          </div>
          <div style={{ fontSize: 9, color: "hsl(240 8% 65%)", lineHeight: 1.5 }}>
            When this enters the battlefield, draw a card and gain 2 life.
          </div>
        </div>

        {/* Gold inset border */}
        <div style={{
          position: "absolute", inset: 3,
          borderRadius: 9,
          border: "1px solid hsl(42 78% 50%/0.2)",
          pointerEvents: "none",
        }} />
      </div>
    </div>
  );
};

/* ─── Particle component ──────────────────────────────────── */
const Particle = ({ x, y, color, delay, dx }: {
  x: number; y: number; color: string; delay: number; dx: number;
}) => (
  <div style={{
    position: "absolute", left: `${x}%`, top: `${y}%`,
    width: 3, height: 3, borderRadius: "50%",
    background: color,
    boxShadow: `0 0 6px ${color}`,
    animation: `particle ${2 + Math.random() * 2}s ease-out infinite`,
    animationDelay: `${delay}s`,
    "--dx": `${dx}px`,
  } as React.CSSProperties} />
);

/* ─── Orbiting mana dot ────────────────────────────────────── */
const OrbitDot = ({ color, radius, duration, delay, size = 8 }: {
  color: string; radius: number; duration: number; delay: number; size?: number;
}) => (
  <div style={{
    position: "absolute", top: "50%", left: "50%",
    width: size, height: size,
    marginTop: -size / 2, marginLeft: -size / 2,
    borderRadius: "50%",
    background: color,
    boxShadow: `0 0 ${size * 2}px ${color}`,
    animation: `orbit ${duration}s linear infinite`,
    animationDelay: `${delay}s`,
    "--r": `${radius}px`,
  } as React.CSSProperties} />
);

/* ─── Feature card ───────────────────────────────────────────*/
const features = [
  { icon: Library,    title: "Smart Inventory",  desc: "Track every card. Filter by set, rarity, color, condition, foil. Bulk import / export CSV.", delay: 0 },
  { icon: Wand2,      title: "AI Decksmith",     desc: "Build the strongest deck possible from cards you already own. Combo & meta-aware.",          delay: 0.08 },
  { icon: LayersIcon, title: "Deck Workshop",    desc: "Drag-and-drop builder for Commander, Standard, Modern & more, with mana curve and color pie.", delay: 0.16 },
  { icon: ScanLine,   title: "Card Scanner",     desc: "Snap a photo and add it to your collection in seconds.",                                       delay: 0.24 },
  { icon: Sparkles,   title: "Daily Insights",   desc: "AI surfaces combos, upgrades, missing pieces, and meta matchups every day.",                    delay: 0.32 },
  { icon: Heart,      title: "Wishlist & Trades", desc: "Track what you want, what you'll trade, and how the value compares.",                          delay: 0.40 },
];

const MANA = [
  { color: "hsl(48 90% 80%)",  shadow: "hsl(48 90% 70%/0.9)",  letter: "W" },
  { color: "hsl(210 90% 65%)", shadow: "hsl(210 90% 60%/0.9)", letter: "U" },
  { color: "hsl(270 45% 60%)", shadow: "hsl(270 45% 50%/0.9)", letter: "B" },
  { color: "hsl(8 85% 62%)",   shadow: "hsl(8 85% 58%/0.9)",   letter: "R" },
  { color: "hsl(135 55% 52%)", shadow: "hsl(135 55% 45%/0.9)", letter: "G" },
];

/* ─── Landing ─────────────────────────────────────────────── */
const Landing = () => {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    x: 10 + (i * 4.5) % 80,
    y: 30 + (i * 7) % 60,
    color: MANA[i % 5].shadow,
    delay: (i * 0.4) % 4,
    dx: -20 + (i % 5) * 10,
  }));

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <style>{KEYFRAMES}</style>

      {/* ── NAV ── */}
      <header className="relative z-50 container mx-auto flex h-16 items-center justify-between px-4">
        <Logo />
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="text-muted-foreground hover:text-foreground">
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 glow-gold">
            <Link to="/auth?mode=signup">Get started</Link>
          </Button>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════
          HERO SECTION
         ══════════════════════════════════════════════════════ */}
      <section style={{ position: "relative", minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", width: "100%" }}>

        {/* ── Deep background ── */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 120% 100% at 50% 0%, hsl(270 55% 10%), hsl(240 14% 5%) 50%, hsl(240 14% 4%))",
        }} />

        {/* ── Animated blob orbs ── */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <div style={{
            position: "absolute", top: "-10%", left: "5%",
            width: 700, height: 700, borderRadius: "50%",
            background: "radial-gradient(circle, hsl(270 60% 30%/0.25), transparent 70%)",
            animation: "drift-a 18s ease-in-out infinite",
          }} />
          <div style={{
            position: "absolute", top: "20%", right: "-5%",
            width: 600, height: 600, borderRadius: "50%",
            background: "radial-gradient(circle, hsl(210 70% 25%/0.2), transparent 70%)",
            animation: "drift-b 22s ease-in-out infinite",
          }} />
          <div style={{
            position: "absolute", bottom: "0%", left: "30%",
            width: 500, height: 500, borderRadius: "50%",
            background: "radial-gradient(circle, hsl(42 78% 30%/0.12), transparent 70%)",
            animation: "drift-c 16s ease-in-out infinite",
          }} />
        </div>

        {/* ── Hex/grid texture ── */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.03,
          backgroundImage: `
            linear-gradient(hsl(42 78% 60%) 1px, transparent 1px),
            linear-gradient(90deg, hsl(42 78% 60%) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }} />

        {/* ── Arcane rune rings ── */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 700, height: 700, pointerEvents: "none" }}>
          {/* Outer ring */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: "1px solid hsl(42 78% 50%/0.08)",
            animation: "rune-spin 60s linear infinite",
          }}>
            {[0, 60, 120, 180, 240, 300].map(deg => (
              <div key={deg} style={{
                position: "absolute", top: "50%", left: "50%",
                width: 6, height: 6, marginTop: -3, marginLeft: -3,
                borderRadius: "50%",
                background: "hsl(42 78% 60%/0.4)",
                transform: `rotate(${deg}deg) translateX(350px)`,
              }} />
            ))}
          </div>
          {/* Middle ring */}
          <div style={{
            position: "absolute", inset: 60, borderRadius: "50%",
            border: "1px solid hsl(270 60% 50%/0.1)",
            animation: "rune-spin-rev 40s linear infinite",
          }}>
            {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
              <div key={deg} style={{
                position: "absolute", top: "50%", left: "50%",
                width: 4, height: 4, marginTop: -2, marginLeft: -2,
                borderRadius: "50%",
                background: "hsl(270 60% 60%/0.5)",
                transform: `rotate(${deg}deg) translateX(290px)`,
              }} />
            ))}
          </div>
          {/* Inner ring */}
          <div style={{
            position: "absolute", inset: 130, borderRadius: "50%",
            border: "1px solid hsl(42 78% 50%/0.12)",
            animation: "rune-spin 25s linear infinite",
          }} />
        </div>

        {/* ── Orbiting mana dots ── */}
        <div style={{ position: "absolute", top: "50%", left: "50%", width: 0, height: 0, pointerEvents: "none" }}>
          <OrbitDot color="hsl(48 90% 80%)"  radius={260} duration={14} delay={0}   size={10} />
          <OrbitDot color="hsl(210 90% 65%)" radius={260} duration={14} delay={2.8} size={10} />
          <OrbitDot color="hsl(270 45% 65%)" radius={260} duration={14} delay={5.6} size={10} />
          <OrbitDot color="hsl(8 85% 62%)"   radius={260} duration={14} delay={8.4} size={10} />
          <OrbitDot color="hsl(135 55% 52%)" radius={260} duration={14} delay={11.2} size={10}/>
          {/* Inner orbit */}
          <OrbitDot color="hsl(42 78% 60%)"  radius={160} duration={9}  delay={0}   size={6} />
          <OrbitDot color="hsl(270 60% 55%)" radius={160} duration={9}  delay={4.5} size={6} />
        </div>

        {/* ── Floating particles ── */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {particles.map((p, i) => <Particle key={i} {...p} />)}
        </div>

        {/* ── Central glow ── */}
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          width: 400, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, hsl(42 78% 50%/0.1) 0%, hsl(270 60% 40%/0.05) 50%, transparent 70%)",
          animation: "arcane-ring 4s ease-in-out infinite",
          pointerEvents: "none",
        }} />

        {/* ── Layout: cards + content ── */}
        <div style={{
          position: "relative", zIndex: 10, width: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 40, padding: "80px 24px",
        }}>

          {/* Left card — hidden on mobile */}
          <div className="hidden lg:block" style={{ animation: "card-l 7s ease-in-out infinite" }}>
            <FloatCard
              side="left"
              title="Arcane Surge"
              type="Instant — Arcane"
              colors={["hsl(210 90% 25%)", "hsl(270 60% 20%)", "hsl(210 70% 15%)"]}
              delay={0}
            />
          </div>

          {/* Center content */}
          <div style={{ maxWidth: 680, width: "100%", textAlign: "center", flexShrink: 0, padding: "0 20px" }}>

            {/* Badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "6px 16px", borderRadius: 100,
              border: "1px solid hsl(42 78% 50%/0.3)",
              background: "hsl(42 78% 50%/0.08)",
              marginBottom: 32,
              animation: "badge-in 0.6s ease-out both",
            }}>
              <Sparkles style={{ width: 12, height: 12, color: "hsl(42 78% 65%)" }} />
              <span style={{
                fontSize: 11, fontWeight: 600, letterSpacing: "0.2em",
                textTransform: "uppercase", color: "hsl(42 78% 70%)",
              }}>AI-Powered MTG Assistant</span>
            </div>

            {/* Headline */}
            <h1 style={{
              fontFamily: "Cinzel, serif",
              fontSize: "clamp(2.2rem, 8vw, 5.5rem)",
              fontWeight: 800, lineHeight: 1.05,
              marginBottom: 12,
              animation: "hero-in 0.8s ease-out 0.15s both",
            }}>
              <span style={{
                display: "block",
                background: "linear-gradient(135deg, hsl(42 95% 75%), hsl(38 90% 60%), hsl(42 78% 50%), hsl(38 90% 70%), hsl(42 95% 75%))",
                backgroundSize: "300% auto",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                animation: "gold-shimmer 4s linear infinite",
                paddingBottom: 4,
              }}>
                Master Your
              </span>
              <span style={{
                display: "block",
                background: "linear-gradient(135deg, hsl(42 95% 75%), hsl(38 90% 60%), hsl(42 78% 50%), hsl(38 90% 70%), hsl(42 95% 75%))",
                backgroundSize: "300% auto",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                animation: "gold-shimmer 4s linear infinite",
                animationDelay: "0.5s",
                paddingBottom: 4,
              }}>
                Collection.
              </span>
              <span style={{
                display: "block",
                color: "hsl(40 30% 92%)",
                fontSize: "clamp(1.6rem, 6vw, 4rem)",
                fontWeight: 600, marginTop: 8,
                opacity: 0.9,
              }}>
                Build Smarter Decks.
              </span>
            </h1>

            {/* Scan line accent under title */}
            <div style={{
              position: "relative", height: 2, maxWidth: 320, margin: "0 auto 28px",
              background: "linear-gradient(90deg, transparent, hsl(42 78% 50%/0.4), transparent)",
              overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                background: "linear-gradient(90deg, transparent, hsl(42 95% 75%), transparent)",
                animation: "scan 2.5s ease-in-out infinite",
              }} />
            </div>

            {/* Subtext */}
            <p style={{
              fontSize: "clamp(0.95rem, 2vw, 1.15rem)",
              color: "hsl(240 8% 62%)", lineHeight: 1.7,
              maxWidth: 520, margin: "0 auto 36px",
              animation: "hero-in 0.8s ease-out 0.3s both",
            }}>
              The premium inventory & deck-building forge for serious Planeswalkers.
              Track every card, search the multiverse, and let arcane AI craft the
              best deck from what you already own.
            </p>

            {/* CTAs */}
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 12,
              justifyContent: "center", marginBottom: 48,
              animation: "hero-in 0.8s ease-out 0.45s both",
            }}>
              <Button asChild size="lg" style={{
                height: 52, padding: "0 32px", fontSize: 15,
                background: "linear-gradient(135deg, hsl(42 78% 55%), hsl(42 95% 68%))",
                color: "hsl(240 20% 8%)",
                boxShadow: "0 0 30px hsl(42 78% 50%/0.35), 0 4px 20px hsl(240 30% 0%/0.4)",
                fontWeight: 700, letterSpacing: "0.03em",
                border: "none", cursor: "pointer",
                transition: "all 0.2s",
              }}>
                <Link to="/auth?mode=signup">
                  <Sparkles style={{ width: 16, height: 16, marginRight: 8 }} />
                  Start your grimoire
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" style={{
                height: 52, padding: "0 32px", fontSize: 15,
                border: "1px solid hsl(42 78% 50%/0.3)",
                color: "hsl(40 30% 85%)",
                background: "hsl(240 14% 8%/0.6)",
                backdropFilter: "blur(12px)",
                transition: "all 0.2s",
              }}>
                <Link to="/auth">I have an account</Link>
              </Button>
            </div>

            {/* Mana symbols row */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 14, animation: "hero-in 0.8s ease-out 0.6s both",
            }}>
              {MANA.map((m, i) => (
                <div key={m.letter} style={{
                  width: 38, height: 38, borderRadius: "50%",
                  background: m.color,
                  boxShadow: `0 0 20px ${m.shadow}, 0 0 6px ${m.shadow}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "Cinzel, serif",
                  fontSize: 13, fontWeight: 700, color: "hsl(240 14% 6%)",
                  animation: `float ${4.5 + i * 0.3}s ease-in-out infinite`,
                  animationDelay: `${i * 0.2}s`,
                  border: "1px solid hsl(0 0% 100%/0.15)",
                  cursor: "default", userSelect: "none",
                }}>
                  {m.letter}
                </div>
              ))}
            </div>
          </div>

          {/* Right card — hidden on mobile */}
          <div className="hidden lg:block" style={{ animation: "card-r 8s ease-in-out infinite", animationDelay: "1s" }}>
            <FloatCard
              side="right"
              title="Void Walker"
              type="Creature — Specter"
              colors={["hsl(270 55% 20%)", "hsl(8 70% 18%)", "hsl(240 20% 10%)"]}
              delay={1}
            />
          </div>
        </div>

        {/* Scroll indicator */}
        <div style={{
          position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          opacity: 0.35, animation: "float 3s ease-in-out infinite",
        }}>
          <span style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "hsl(42 78% 60%)" }}>Scroll</span>
          <div style={{ width: 1, height: 32, background: "linear-gradient(to bottom, hsl(42 78% 50%/0.6), transparent)" }} />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FEATURES
         ══════════════════════════════════════════════════════ */}
      <section style={{
        padding: "100px 0",
        background: "linear-gradient(to bottom, hsl(240 14% 4%), hsl(240 14% 6%))",
        position: "relative",
      }}>
        {/* Top fade */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 120,
          background: "linear-gradient(to bottom, hsl(240 14% 4%), transparent)",
          pointerEvents: "none",
        }} />

        <div className="container mx-auto px-4">
          <div style={{ textAlign: "center", marginBottom: 64, animation: "hero-in 0.8s ease-out both" }}>
            <p style={{
              fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase",
              color: "hsl(42 78% 60%)", marginBottom: 16,
            }}>What awaits you</p>
            <h2 style={{
              fontFamily: "Cinzel, serif", fontSize: "clamp(1.8rem, 4vw, 3rem)",
              fontWeight: 700, color: "hsl(40 30% 92%)", marginBottom: 16,
            }}>
              An entire arcane workshop
            </h2>
            <p style={{ color: "hsl(240 8% 55%)", maxWidth: 480, margin: "0 auto", lineHeight: 1.7 }}>
              Everything a collector and competitive player needs, in one obsidian-dark interface.
            </p>
          </div>

          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {features.map((f) => (
              <div
                key={f.title}
                style={{
                  borderRadius: 16,
                  border: "1px solid hsl(42 78% 50%/0.1)",
                  background: "hsl(240 12% 8%/0.8)",
                  padding: "28px 24px",
                  position: "relative", overflow: "hidden",
                  backdropFilter: "blur(8px)",
                  transition: "border-color 0.3s, box-shadow 0.3s, transform 0.3s",
                  animation: `feature-in 0.6s ease-out ${f.delay + 0.3}s both`,
                  cursor: "default",
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = "hsl(42 78% 50%/0.35)";
                  el.style.boxShadow = "0 8px 40px hsl(42 78% 50%/0.08), 0 0 0 1px hsl(42 78% 50%/0.1)";
                  el.style.transform = "translateY(-4px)";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = "hsl(42 78% 50%/0.1)";
                  el.style.boxShadow = "none";
                  el.style.transform = "translateY(0)";
                }}
              >
                {/* Top gradient accent */}
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 1,
                  background: "linear-gradient(90deg, transparent, hsl(42 78% 50%/0.3), transparent)",
                }} />

                <div style={{
                  width: 44, height: 44, borderRadius: 12, marginBottom: 20,
                  background: "hsl(42 78% 50%/0.1)",
                  border: "1px solid hsl(42 78% 50%/0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <f.icon style={{ width: 20, height: 20, color: "hsl(42 78% 65%)" }} />
                </div>
                <h3 style={{
                  fontFamily: "Cinzel, serif", fontSize: 16, fontWeight: 600,
                  color: "hsl(40 30% 90%)", marginBottom: 10,
                }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: "hsl(240 8% 55%)", lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          CTA SECTION
         ══════════════════════════════════════════════════════ */}
      <section style={{ padding: "80px 0 120px", position: "relative" }}>
        <div className="container mx-auto px-4">
          <div style={{
            borderRadius: 24,
            border: "1px solid hsl(42 78% 50%/0.2)",
            background: "linear-gradient(135deg, hsl(270 40% 10%/0.8), hsl(240 14% 7%/0.95), hsl(210 50% 10%/0.8))",
            padding: "clamp(48px, 8vw, 80px) clamp(24px, 6vw, 80px)",
            textAlign: "center",
            position: "relative", overflow: "hidden",
            backdropFilter: "blur(20px)",
            animation: "cta-glow 5s ease-in-out infinite",
          }}>
            {/* Radial overlay */}
            <div style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(42 78% 50%/0.12), transparent 60%)",
              pointerEvents: "none",
            }} />
            {/* Corner rune dots */}
            {[["0","0"],["0","100%"],["100%","0"],["100%","100%"]].map(([t,l],i) => (
              <div key={i} style={{
                position: "absolute",
                top: t, left: l,
                transform: "translate(-50%,-50%)",
                width: 8, height: 8, borderRadius: "50%",
                background: "hsl(42 78% 60%/0.4)",
                boxShadow: "0 0 12px hsl(42 78% 50%/0.6)",
              }} />
            ))}

            <div style={{ position: "relative" }}>
              <h2 style={{
                fontFamily: "Cinzel, serif",
                fontSize: "clamp(2rem, 5vw, 3.5rem)",
                fontWeight: 800, marginBottom: 16,
                background: "linear-gradient(135deg, hsl(42 95% 75%), hsl(38 90% 60%), hsl(42 78% 50%), hsl(38 90% 70%))",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                animation: "gold-shimmer 3s linear infinite",
              }}>
                Summon the Decksmith
              </h2>
              <p style={{ color: "hsl(240 8% 60%)", marginBottom: 36, fontSize: 16, maxWidth: 420, margin: "0 auto 36px" }}>
                Free to start. Your collection, your strategy, supercharged by AI.
              </p>
              <Button asChild size="lg" style={{
                height: 54, padding: "0 40px", fontSize: 16,
                background: "linear-gradient(135deg, hsl(42 78% 55%), hsl(42 95% 68%))",
                color: "hsl(240 20% 8%)",
                boxShadow: "0 0 40px hsl(42 78% 50%/0.4), 0 8px 30px hsl(240 30% 0%/0.5)",
                fontWeight: 700, letterSpacing: "0.03em", border: "none",
              }}>
                <Link to="/auth?mode=signup">
                  <Sparkles style={{ width: 18, height: 18, marginRight: 10 }} />
                  Create free account
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        borderTop: "1px solid hsl(240 10% 12%)",
        padding: "32px 0", textAlign: "center",
        color: "hsl(240 8% 35%)", fontSize: 12,
      }}>
        PhantomMTG is an unofficial fan tool. Magic: The Gathering is a trademark of Wizards of the Coast.
      </footer>
    </div>
  );
};

export default Landing;
