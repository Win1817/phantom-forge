import { useState } from "react";
import { Loader2, BookOpen, Crown, Swords, Wand2, Lightbulb, ChevronDown, ChevronRight, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { generateDeck } from "@/lib/gemini";
import { cn } from "@/lib/utils";

// ── Static knowledge base ──────────────────────────────────────────────────

const COMMANDER_PILLARS = [
  {
    icon: "👑",
    title: "Choose Your Commander First",
    body: "Your commander defines the deck's identity, color identity, and win condition. Pick one you enjoy playing — you'll cast it dozens of times. Legendary creatures with built-in card advantage, protection, or a clear ability that shapes play are strongest.",
  },
  {
    icon: "⚖️",
    title: "The Rule of 99",
    body: "Commander decks are exactly 100 cards including your commander. 99 non-commander cards means every slot must earn its place. Cut ruthlessly — if a card doesn't advance your strategy, replace it.",
  },
  {
    icon: "🏔️",
    title: "Land Count: 36–38",
    body: "Most Commander decks run 36–38 lands. The Frank Karsten formula: (33 + avg CMC × 1.7) lands is a reliable baseline. Ramp spells like Sol Ring, Arcane Signet, and land-fetching sorceries let you go slightly lower.",
  },
  {
    icon: "🔄",
    title: "Card Advantage Wins Games",
    body: "Draw 8–12 cards worth of card advantage. Wheels, cantrips, creatures that draw on ETB, enchantments like Rhystic Study or Sylvan Library. Never assume you'll have what you need — draw into it.",
  },
  {
    icon: "⚡",
    title: "Removal & Interaction: 10–15 pieces",
    body: "Include 10–15 pieces of interaction: targeted removal, board wipes, counterspells (blue), and graveyard hate. Mix permanent removal (exile > destroy) with flexible answer cards like Chaos Warp, Beast Within, and Generous Gift.",
  },
  {
    icon: "🚀",
    title: "Ramp: 10–12 pieces",
    body: "Ramp lets you cast your commander early and rebuild after it gets removed. Prioritize 2-mana rocks (Arcane Signet, Talisman cycle), green ramp spells (Cultivate, Nature's Lore), and mana doublers. Avoid 3-mana rocks in competitive pods.",
  },
];

const PLAYSTYLE_ARCHETYPES = [
  {
    name: "Aggro/Combat",
    badge: "text-mana-red border-mana-red/40",
    summary: "Win fast through creature combat. Go wide (tokens) or go tall (voltron).",
    tips: [
      "Equipment and auras for voltron; token generators + anthems for go-wide",
      "Haste enablers let your commander attack immediately",
      "Fear opponents with trample, evasion, or unblockable",
      "Watch your curve — stay below CMC 4 for most threats",
    ],
    commanders: ["Atraxa, Praetors' Voice", "Krenko, Mob Boss", "Rafiq of the Many", "Wulfgar of Icewind Dale"],
  },
  {
    name: "Control",
    badge: "text-mana-blue border-mana-blue/40",
    summary: "Answer everything. Win with card advantage and a late-game finisher.",
    tips: [
      "8–12 counterspells; save them for haymakers and combo pieces",
      "Wraths reset the board — Cyclonic Rift, Austere Command are flexible",
      "Win conditions: Thassa's Oracle, Approach of the Second Sun, or combat",
      "Pillowfort pieces (Ghostly Prison, Propaganda) buy time",
    ],
    commanders: ["Talion, the Kindly Lord", "Esper Sentinel", "Oloro, Ageless Ascetic", "Zur the Enchanter"],
  },
  {
    name: "Combo",
    badge: "text-mana-purple border-purple-500/40",
    summary: "Assemble two or three pieces for an infinite loop or instant win.",
    tips: [
      "Tutor for your combo pieces — Demonic Tutor, Mystical Tutor, Worldly Tutor",
      "Redundancy: 3 copies of each combo role (e.g. 3 ways to go infinite)",
      "Protection: counterspells, Silence, Veil of Summer",
      "Fast mana wins races — Mana Crypt, Ancient Tomb, Jeweled Lotus",
    ],
    commanders: ["Thrasios + Tymna", "Kinnan, Bonder Prodigy", "Najeela, the Blade-Blossom", "Kenrith, the Returned King"],
  },
  {
    name: "Midrange",
    badge: "text-mana-green border-mana-green/40",
    summary: "Efficient threats, flexible answers, good at everything.",
    tips: [
      "Value engines — cards that generate multiple resources per cast",
      "'Goodstuff' piles around your commander's color strengths",
      "Adapt to the pod: more removal vs combo, more threats vs control",
      "Lands matter — Cultivate and Kodama's Reach make every land count",
    ],
    commanders: ["Muldrotha, the Gravetide", "Aesi, Tyrant of Gyre Strait", "Yarok, the Desecrated", "Korvold, Fae-Cursed King"],
  },
];

const DECKBUILDING_CHECKLIST = [
  { category: "Lands",         target: "36–38", icon: "🏔️" },
  { category: "Ramp",          target: "10–12", icon: "🚀" },
  { category: "Card draw",     target: "8–12",  icon: "📚" },
  { category: "Single removal",target: "8–10",  icon: "🗡️" },
  { category: "Board wipes",   target: "3–5",   icon: "💥" },
  { category: "Tutors",        target: "3–6",   icon: "🔍" },
  { category: "Win conditions",target: "3–5",   icon: "🏆" },
  { category: "Theme cards",   target: "20–25", icon: "⭐" },
];

const COMMON_MISTAKES = [
  { mistake: "Too many lands that enter tapped", fix: "Keep ETB-tapped lands under 10. Prioritize basics + fetch + shock lands." },
  { mistake: "Ignoring the average CMC", fix: "Keep avg CMC below 3.5 for smooth gameplay. Curve down aggressively." },
  { mistake: "No graveyard hate", fix: "Run at least 2–3 pieces: Tormod's Crypt, Soul-Guide Lantern, Rest in Peace." },
  { mistake: "All card draw, no threats", fix: "Drawing 10 cards helps nothing if you have nothing to cast. Balance threats and gas." },
  { mistake: "Building in a vacuum", fix: "Know your meta. Tune removal suite, counterspell count, and speed to your pod." },
  { mistake: "Neglecting the mana base", fix: "Dual lands, fetch lands, and color-fixing are investments that pay off every game." },
];

// ── AI Insight Panel ───────────────────────────────────────────────────────

interface AIInsight {
  question: string;
  answer: string;
}

const QUICK_QUESTIONS = [
  "How do I build a consistent Commander mana base on a $50 budget?",
  "What's the best way to recover after my commander gets removed 3 times?",
  "How do I tune my deck for a more competitive pod without going full cEDH?",
  "What are the best 2-card combos in Commander right now?",
  "How many tutors should I run and which ones are worth it?",
  "How do I build around a commander with a high mana cost?",
];

function AIPanel() {
  const [loading, setLoading]   = useState(false);
  const [insight, setInsight]   = useState<AIInsight | null>(null);
  const [custom, setCustom]     = useState("");

  const askGemini = async (question: string) => {
    if (!question.trim()) return;
    setLoading(true);
    setInsight(null);
    try {
      const { description } = await generateDeck({
        format: "commander",
        style: "midrange",
        colors: [],
        budget: "any",
        notes: `You are a Magic: The Gathering Commander expert. Answer this question in 3–5 sentences with concrete, actionable advice. No lists — prose only. Question: ${question}`,
      });
      setInsight({ question, answer: description });
    } catch {
      setInsight({ question, answer: "Could not fetch insight — check your Gemini API key." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/30 bg-arcane relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,hsl(var(--primary)/0.15),transparent_60%)]" />
      <CardHeader className="relative pb-3">
        <CardTitle className="font-fantasy text-lg text-gradient-gold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Ask the Arcane Oracle
        </CardTitle>
        <p className="text-xs text-muted-foreground">AI-powered Commander advice — tap a quick question or ask your own.</p>
      </CardHeader>
      <CardContent className="relative space-y-4">
        {/* Quick questions */}
        <div className="flex flex-wrap gap-2">
          {QUICK_QUESTIONS.map((q) => (
            <button key={q} type="button" onClick={() => askGemini(q)}
              disabled={loading}
              className="rounded-full border border-border/60 bg-secondary/40 px-3 py-1.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground transition-all disabled:opacity-50 text-left">
              {q.length > 55 ? q.slice(0, 55) + "…" : q}
            </button>
          ))}
        </div>

        {/* Custom input */}
        <div className="flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && askGemini(custom)}
            placeholder="Ask any Commander question…"
            className="flex-1 h-9 rounded-lg border border-border/60 bg-secondary/40 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <Button size="sm" onClick={() => askGemini(custom)} disabled={loading || !custom.trim()}
            className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 h-9 px-4">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          </Button>
        </div>

        {/* Answer */}
        {insight && (
          <div className="rounded-xl border border-primary/20 bg-background/50 p-4 space-y-2 animate-fade-in">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{insight.question}</p>
            <p className="text-sm text-foreground leading-relaxed">{insight.answer}</p>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => askGemini(insight.question)}>
              <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Collapsible section ────────────────────────────────────────────────────
function Section({ title, icon, children, defaultOpen = false }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2.5 font-fantasy text-lg font-semibold">
          {icon}{title}
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ForgeGuide() {
  const [activeArchetype, setActiveArchetype] = useState(0);
  const arch = PLAYSTYLE_ARCHETYPES[activeArchetype];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">Forge Guide</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Commander deckbuilding knowledge, archetypes, and AI-powered insights — all in one place.
        </p>
      </div>

      {/* AI Oracle — top of page for discoverability */}
      <AIPanel />

      {/* Commander Pillars */}
      <Section title="Commander Fundamentals" icon={<Crown className="h-5 w-5 text-primary" />} defaultOpen>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-2">
          {COMMANDER_PILLARS.map((p) => (
            <div key={p.title} className="rounded-lg border border-border/50 bg-secondary/20 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{p.icon}</span>
                <h3 className="font-fantasy text-sm font-semibold">{p.title}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Deckbuilding Checklist */}
      <Section title="The Commander Checklist" icon={<BookOpen className="h-5 w-5 text-primary" />}>
        <div className="mt-3 divide-y divide-border/40 rounded-lg border border-border/50 overflow-hidden">
          {DECKBUILDING_CHECKLIST.map((row) => (
            <div key={row.category} className="flex items-center justify-between px-4 py-3 bg-secondary/10 hover:bg-secondary/30 transition-colors">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">{row.icon}</span>
                <span className="text-sm font-medium">{row.category}</span>
              </div>
              <Badge variant="outline" className="border-primary/40 text-primary font-mono font-semibold text-xs">
                {row.target}
              </Badge>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">Targets are for a 100-card Commander deck. Adjust down for competitive builds and up for casual.</p>
      </Section>

      {/* Archetype Deep Dive */}
      <Section title="Playstyle Archetypes" icon={<Swords className="h-5 w-5 text-primary" />}>
        <div className="mt-3 space-y-4">
          {/* Archetype tabs */}
          <div className="flex flex-wrap gap-2">
            {PLAYSTYLE_ARCHETYPES.map((a, i) => (
              <button key={a.name} type="button" onClick={() => setActiveArchetype(i)}
                className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium transition-all",
                  i === activeArchetype ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/30"
                )}>{a.name}</button>
            ))}
          </div>

          {/* Active archetype details */}
          <div className="rounded-xl border border-border/50 bg-secondary/20 p-5 space-y-4 animate-fade-in">
            <div>
              <h3 className="font-fantasy text-xl font-bold">{arch.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{arch.summary}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Key tips</p>
              {arch.tips.map((tip, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm">
                  <span className="text-primary mt-0.5 shrink-0">→</span>
                  <span className="text-muted-foreground">{tip}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Example commanders</p>
              <div className="flex flex-wrap gap-1.5">
                {arch.commanders.map((c) => (
                  <span key={c} className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium", arch.badge)}>{c}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Common Mistakes */}
      <Section title="Common Mistakes & Fixes" icon={<Lightbulb className="h-5 w-5 text-primary" />}>
        <div className="mt-3 space-y-3">
          {COMMON_MISTAKES.map((m) => (
            <div key={m.mistake} className="rounded-lg border border-border/50 bg-secondary/10 p-4 grid sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-destructive font-semibold mb-1">Mistake</p>
                <p className="text-sm text-muted-foreground">{m.mistake}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-mana-green font-semibold mb-1">Fix</p>
                <p className="text-sm text-muted-foreground">{m.fix}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Pro Tips */}
      <Section title="Pro Tips" icon={<Wand2 className="h-5 w-5 text-primary" />}>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            { tip: "Proxy to playtest", detail: "Build your deck on paper with proxies before buying singles. Playtest 10+ games before finalizing the list." },
            { tip: "Know your win-speed", detail: "Know what turn you typically win. If your pod consistently wins on turn 8 and you win turn 12, you'll always lose." },
            { tip: "Political capital", detail: "Commander is a political game. Offer deals, hold back threats, and don't threaten the whole table at once." },
            { tip: "Track what gets countered", detail: "Note which of your spells get countered. If your commander always gets Counterspelled, add protection spells." },
            { tip: "Upgrades over rebuilds", detail: "Improve one section at a time: first mana base, then card draw, then removal. Don't rebuild the whole deck at once." },
            { tip: "Talk to your table", detail: "Communication prevents 'feel-bad' moments. Say what your deck does on turn 1. The table plays better when informed." },
          ].map((t) => (
            <div key={t.tip} className="rounded-lg border border-border/50 bg-secondary/10 p-4">
              <p className="font-fantasy text-sm font-semibold text-primary mb-1">{t.tip}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{t.detail}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
