import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ManaSymbol } from "@/components/ManaSymbol";
import { Sparkles, Library, LayersIcon, Wand2, ScanLine, Heart } from "lucide-react";

const features = [
  { icon: Library, title: "Smart Inventory", desc: "Track every card. Filter by set, rarity, color, condition, foil. Bulk import / export CSV." },
  { icon: Wand2, title: "AI Decksmith", desc: "Build the strongest deck possible from cards you already own. Combo & meta-aware." },
  { icon: LayersIcon, title: "Deck Workshop", desc: "Drag-and-drop builder for Commander, Standard, Modern, Pioneer & more, with mana curve and color pie." },
  { icon: ScanLine, title: "Card Scanner", desc: "Snap a photo and add it to your collection in seconds." },
  { icon: Sparkles, title: "Daily Insights", desc: "AI surfaces combos, upgrades, missing pieces, and meta matchups every day." },
  { icon: Heart, title: "Wishlist & Trades", desc: "Track what you want, what you'll trade, and how the value compares." },
];

const Landing = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="container mx-auto flex h-16 items-center justify-between px-4">
        <Logo />
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
          <Button asChild className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 glow-gold">
            <Link to="/auth?mode=signup">Get started</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="container mx-auto px-4 py-20 md:py-32">
          <div className="mx-auto max-w-3xl text-center animate-fade-in">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-primary">
              <Sparkles className="h-3 w-3" /> AI-Powered MTG Assistant
            </div>
            <h1 className="font-fantasy text-5xl font-bold leading-tight md:text-7xl">
              <span className="text-gradient-gold">Master Your Collection.</span><br />
              <span className="text-foreground">Build Smarter Decks.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
              PhantomMTG is the premium inventory & deck-building forge for serious Planeswalkers.
              Track every card, search the multiverse, and let arcane AI craft the best deck from what you already own.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 glow-gold h-12 px-8 text-base">
                <Link to="/auth?mode=signup">Start your grimoire</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 border-primary/30 px-8 text-base hover:bg-primary/10">
                <Link to="/auth">I have an account</Link>
              </Button>
            </div>

            <div className="mt-10 flex items-center justify-center gap-3">
              {(["W", "U", "B", "R", "G"] as const).map((s) => (
                <ManaSymbol key={s} symbol={s} size="lg" className="animate-float" />
              ))}
            </div>
          </div>
        </div>

        {/* Decorative glow */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="font-fantasy text-3xl font-bold md:text-4xl">An entire arcane workshop</h2>
          <p className="mt-3 text-muted-foreground">Everything a collector and competitive player needs, in one obsidian-dark interface.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 card-hover arcane-border">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-arcane ring-1 ring-primary/30">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-fantasy text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 pb-24">
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-arcane p-10 text-center md:p-16">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.25),transparent_60%)]" />
          <h2 className="font-fantasy text-3xl font-bold md:text-5xl text-gradient-gold relative">Summon the Decksmith</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-muted-foreground">Free to start. Your collection, your strategy, supercharged by AI.</p>
          <Button asChild size="lg" className="relative mt-8 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 glow-gold h-12 px-10 text-base">
            <Link to="/auth?mode=signup">Create free account</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        PhantomMTG is an unofficial fan tool. Magic: The Gathering is a trademark of Wizards of the Coast.
      </footer>
    </div>
  );
};

export default Landing;
