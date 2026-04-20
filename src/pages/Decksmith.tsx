import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Download, Copy, Check, Loader2, Wand2, Zap, Library, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { generateDeckNarrative, type DeckNarrative } from "@/lib/gemini";
import { buildDeck, type BuiltDeck } from "@/lib/mtgmath";
import type { CollectionCard } from "@/lib/deckBuilder";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { parseDeckText } from "@/lib/deckImportExport";
import { getCardImage } from "@/lib/scryfall";

const FORMATS = ["Standard", "Pioneer", "Modern", "Commander", "Pauper", "Casual"];
const STYLES  = ["Aggro", "Control", "Midrange", "Combo", "Tempo", "Ramp"];
const COLORS  = [
  { code: "W", label: "White", bg: "bg-mana-white text-amber-900" },
  { code: "U", label: "Blue",  bg: "bg-mana-blue text-white" },
  { code: "B", label: "Black", bg: "bg-mana-black text-white" },
  { code: "R", label: "Red",   bg: "bg-mana-red text-white" },
  { code: "G", label: "Green", bg: "bg-mana-green text-white" },
];
const BUDGETS = [
  { v: "budget", l: "Budget (<$30)" },
  { v: "mid",    l: "Mid ($30–$100)" },
  { v: "competitive", l: "Competitive ($100+)" },
  { v: "any",    l: "No limit" },
];

interface GeneratedResult {
  deckList: string;
  cardCount: number;
  roleBreakdown: Partial<Record<string, number>>;
  narrative: DeckNarrative;
}

// Build progress steps
type BuildStep = "idle" | "fetching" | "narrative" | "done";

export default function Decksmith() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [format, setFormat]               = useState("Commander");
  const [style, setStyle]                 = useState("Midrange");
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [budget, setBudget]               = useState("any");
  const [notes, setNotes]                 = useState("");
  const [buildStep, setBuildStep]         = useState<BuildStep>("idle");
  const [buildProgress, setBuildProgress] = useState(0);
  const [generated, setGenerated]         = useState<GeneratedResult | null>(null);
  const [exportOpen, setExportOpen]       = useState(false);
  const [copied, setCopied]               = useState(false);
  const [saving, setSaving]               = useState(false);
  const [lastGenerated, setLastGenerated] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const COOLDOWN_MS = 10_000;
  const [useCollection, setUseCollection]   = useState(false);
  const [collection, setCollection]         = useState<CollectionCard[]>([]);
  const [collectionLoaded, setCollectionLoaded] = useState(false);
  const [collectionCount, setCollectionCount]   = useState(0);

  useEffect(() => {
    if (lastGenerated === 0) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((COOLDOWN_MS - (Date.now() - lastGenerated)) / 1000));
      setCooldownRemaining(remaining);
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [lastGenerated]);

  // Load collection when toggle is turned on
  useEffect(() => {
    if (!useCollection || collectionLoaded || !user) return;
    (async () => {
      const { data } = await supabase
        .from("collection_cards")
        .select("scryfall_id, card_name, set_code, collector_number, mana_cost, type_line, colors, cmc, quantity")
        .order("card_name");
      if (data) {
        setCollection(data as CollectionCard[]);
        setCollectionCount(data.length);
        setCollectionLoaded(true);
      }
    })();
  }, [useCollection, collectionLoaded, user]);

  const toggleColor = (c: string) =>
    setSelectedColors((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  const generate = async () => {
    if (!user) { toast.error("Sign in required"); return; }
    if (Date.now() - lastGenerated < COOLDOWN_MS) {
      toast.error(`Please wait ${cooldownRemaining}s before generating again.`); return;
    }
    setLastGenerated(Date.now());
    setGenerated(null);
    setBuildStep("fetching");
    setBuildProgress(10);

    try {
      // Step 1 — Math: build real deck from Scryfall data
      setBuildProgress(20);
      const built: BuiltDeck = await buildDeck(format, style, selectedColors, budget, useCollection ? collection : undefined, useCollection);
      setBuildProgress(75);

      // Step 2 — AI: generate name + narrative only
      setBuildStep("narrative");
      setBuildProgress(82);
      const narrative = await generateDeckNarrative({
        format, style, colors: selectedColors, budget,
        notes: notes.trim(),
        roleBreakdown: built.roleBreakdown,
      });
      setBuildProgress(100);
      setBuildStep("done");

      setGenerated({
        deckList: built.deckList,
        cardCount: built.cardCount,
        roleBreakdown: built.roleBreakdown,
        narrative,
      });
    } catch (e) {
      toast.error((e as Error).message || "Generation failed");
      setBuildStep("idle");
    }
  };

  const exportTextareaRef = useRef<HTMLTextAreaElement>(null);

  const copyExport = () => {
    if (!generated) return;
    const el = exportTextareaRef.current;
    if (!el) return;
    el.removeAttribute("readonly");
    el.focus();
    el.select();
    el.setSelectionRange(0, el.value.length);
    const ok = document.execCommand("copy");
    el.setAttribute("readonly", "true");
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      navigator.clipboard?.writeText(generated.deckList).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }).catch(() => toast.error("Copy failed — please select and copy manually"));
    }
  };

  const downloadExport = () => {
    if (!generated) return;
    const blob = new Blob([generated.deckList], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `${generated.narrative.name.replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveToDeckWorkshop = async () => {
    if (!generated || !user) return;
    setSaving(true);
    try {
      const parsed = parseDeckText(generated.deckList);
      const { data: deck, error: deckErr } = await supabase
        .from("decks")
        .insert({
          user_id: user.id,
          name: generated.narrative.name,
          format: format.toLowerCase(),
          description: generated.narrative.description,
        })
        .select().single();
      if (deckErr || !deck) throw new Error(deckErr?.message ?? "Failed to create deck");

      const allLines = [
        ...parsed.main.map((l) => ({ ...l, isCommander: false, isSideboard: false })),
        ...parsed.sideboard.map((l) => ({ ...l, isCommander: false, isSideboard: true })),
        ...(parsed.commander ? [{ ...parsed.commander, isCommander: true, isSideboard: false }] : []),
      ];

      const inserts = await Promise.all(
        allLines.map(async (line) => {
          let card = null;
          try {
            if (line.set && line.collectorNumber) {
              const r = await fetch(`https://api.scryfall.com/cards/${line.set.toLowerCase()}/${line.collectorNumber}`);
              if (r.ok) card = await r.json();
            }
          } catch {}
          return {
            deck_id: deck.id,
            scryfall_id: card?.id ?? "unknown",
            card_name: line.name,
            quantity: line.quantity,
            set_code: card?.set ?? line.set ?? null,
            collector_number: card?.collector_number ?? line.collectorNumber ?? null,
            image_url: card ? getCardImage(card) : null,
            mana_cost: card?.mana_cost ?? null,
            cmc: card?.cmc ?? null,
            type_line: card?.type_line ?? null,
            colors: card?.colors ?? [],
            is_commander: line.isCommander,
            is_sideboard: line.isSideboard,
            // Extra fields for collection sync
            set_name: card?.set_name ?? null,
            rarity: card?.rarity ?? null,
            price_usd: card?.prices?.usd ? Number(card.prices.usd) : null,
          };
        })
      );

      await supabase.from("deck_cards").insert(inserts);

      // ── Sync to collection_cards ──────────────────────────────────────────
      // Merge duplicates (same scryfall_id) summing quantities
      const uniqueMap: Record<string, typeof inserts[0] & { total: number }> = {};
      for (const c of inserts) {
        if (c.scryfall_id === "unknown") continue;
        if (!uniqueMap[c.scryfall_id]) uniqueMap[c.scryfall_id] = { ...c, total: 0 };
        uniqueMap[c.scryfall_id].total += c.quantity;
      }

      for (const c of Object.values(uniqueMap)) {
        const { data: existing } = await supabase
          .from("collection_cards")
          .select("id, quantity")
          .eq("user_id", user.id)
          .eq("scryfall_id", c.scryfall_id)
          .maybeSingle();

        if (existing) {
          await supabase.from("collection_cards")
            .update({ quantity: existing.quantity + c.total })
            .eq("id", existing.id);
        } else {
          await supabase.from("collection_cards").insert({
            user_id: user.id,
            scryfall_id: c.scryfall_id,
            card_name: c.card_name,
            set_code: c.set_code,
            set_name: (c as any).set_name ?? null,
            collector_number: c.collector_number,
            rarity: (c as any).rarity ?? null,
            image_url: c.image_url,
            mana_cost: c.mana_cost,
            cmc: c.cmc,
            type_line: c.type_line,
            colors: c.colors,
            price_usd: (c as any).price_usd ?? null,
            quantity: c.total,
          });
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      toast.success(`"${generated.narrative.name}" saved — ${inserts.length} cards added to Decks & Collection`);
      navigate(`/app/decks/${deck.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const isBuilding = buildStep === "fetching" || buildStep === "narrative";

  const STEP_LABELS: Record<BuildStep, string> = {
    idle:      "",
    fetching:  "Fetching real cards from Scryfall…",
    narrative: "AI writing deck name & strategy…",
    done:      "",
  };

  const tabBtn = (label: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-all ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">AI Decksmith</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real cards from Scryfall, mana-curve-optimized. AI writes the name & strategy.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">

        {/* ── Config panel ── */}
        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Format</Label>
            <div className="flex flex-wrap gap-2">{FORMATS.map((f) => tabBtn(f, format === f, () => setFormat(f)))}</div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Playstyle</Label>
            <div className="flex flex-wrap gap-2">{STYLES.map((s) => tabBtn(s, style === s, () => setStyle(s)))}</div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Colors (optional)</Label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button key={c.code} onClick={() => toggleColor(c.code)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ring-2 transition-all ${c.bg} ${
                    selectedColors.includes(c.code)
                      ? "ring-primary scale-110 shadow-[0_0_12px_hsl(var(--primary)/0.5)]"
                      : "ring-transparent opacity-50 hover:opacity-80"
                  }`} title={c.label}>
                  {c.code}
                </button>
              ))}
              {selectedColors.length > 0 && (
                <button onClick={() => setSelectedColors([])}
                  className="px-3 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Budget</Label>
            <div className="flex flex-wrap gap-2">
              {BUDGETS.map(({ v, l }) => tabBtn(l, budget === v, () => setBudget(v)))}
            </div>
          </div>

          {/* ── Collection toggle ── */}
          <div
            onClick={() => setUseCollection(v => !v)}
            className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all ${
              useCollection
                ? "border-primary/50 bg-primary/8 ring-1 ring-primary/20"
                : "border-border/50 bg-secondary/20 hover:border-border"
            }`}
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
              useCollection ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
            }`}>
              <Library className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${useCollection ? "text-foreground" : "text-muted-foreground"}`}>
                Forge from my collection
              </p>
              <p className="text-[11px] text-muted-foreground/70 leading-tight">
                {useCollection && collectionLoaded
                  ? `Prioritising ${collectionCount} cards you own — fills gaps from Scryfall`
                  : "Prioritise cards you already own before pulling from Scryfall"}
              </p>
            </div>
            {/* Toggle pill */}
            <div className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              useCollection ? "bg-primary" : "bg-secondary-foreground/20"
            }`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                useCollection ? "translate-x-4" : "translate-x-0.5"
              }`} />
            </div>
          </div>

          {useCollection && collectionLoaded && collectionCount === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
              <BookOpen className="h-4 w-4 shrink-0" />
              Your collection is empty — head to Collection to add cards first.
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Additional notes <span className="normal-case tracking-normal text-muted-foreground/60">(optional)</span>
            </Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. tribal goblins theme, focus on burn spells, include Krenko as commander…"
              className="min-h-[80px] bg-secondary/40 border-border/60 resize-none text-sm" maxLength={500} />
          </div>

          {/* Build progress */}
          {isBuilding && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {buildStep === "fetching"
                  ? <Zap className="h-3.5 w-3.5 text-primary animate-pulse" />
                  : <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />}
                {STEP_LABELS[buildStep]}
              </div>
              <Progress value={buildProgress} className="h-1.5" />
            </div>
          )}

          <Button onClick={generate} disabled={isBuilding || cooldownRemaining > 0}
            className="w-full h-11 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 font-semibold disabled:opacity-50">
            {isBuilding ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {buildStep === "fetching" ? "Pulling cards…" : "Naming deck…"}</>
            ) : cooldownRemaining > 0 ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ready in {cooldownRemaining}s…</>
            ) : (
              <><Wand2 className="mr-2 h-4 w-4" /> Forge Deck</>
            )}
          </Button>

          {/* How it works callout */}
          <div className="rounded-lg border border-border/40 bg-secondary/20 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground text-[11px] uppercase tracking-wider">How it works</p>
            {useCollection && <p><Library className="inline h-3 w-3 text-primary mr-1" />Your owned cards are prioritised first per slot</p>}
            <p><Zap className="inline h-3 w-3 text-primary mr-1" />Math engine pulls real Scryfall cards by role + mana curve</p>
            <p><Sparkles className="inline h-3 w-3 text-primary mr-1" />AI writes the deck name, description & strategy only</p>
            <p>No hallucinated cards. No invalid set codes.</p>
          </div>
        </div>

        {/* ── Result panel ── */}
        <div>
          {!generated && !isBuilding && (
            <Card className="border-primary/20 bg-arcane h-full min-h-[300px] relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.2),transparent_60%)] rounded-xl" />
              <CardContent className="relative flex flex-col items-center justify-center gap-4 py-16 text-center h-full">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-card ring-1 ring-primary/40">
                  <Wand2 className="h-7 w-7 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Configure your preferences and hit <strong className="text-foreground">Forge Deck</strong>.<br />
                  Real cards, real set codes, math-optimised curve.
                </p>
              </CardContent>
            </Card>
          )}

          {isBuilding && (
            <Card className="border-primary/20 bg-arcane h-full min-h-[300px]">
              <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center h-full">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {buildStep === "fetching"
                    ? "Querying Scryfall for real cards…"
                    : "Gemini is naming your deck…"}
                </p>
              </CardContent>
            </Card>
          )}

          {generated && (
            <Card className="border-primary/30 bg-card h-full">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="font-fantasy text-lg text-gradient-gold">{generated.narrative.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">{generated.narrative.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">{format}</Badge>
                    <Badge variant="outline" className="border-border text-muted-foreground text-[10px]">{generated.cardCount} cards</Badge>
                    {useCollection && collectionCount > 0 && (
                      <Badge variant="outline" className="border-mana-green/40 text-mana-green text-[10px]">
                        <Library className="mr-1 h-2.5 w-2.5" /> From collection
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {generated.narrative.strategy && (
                  <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground leading-relaxed">
                    <p className="font-semibold text-foreground mb-1 uppercase tracking-wider text-[10px]">Strategy</p>
                    {generated.narrative.strategy}
                  </div>
                )}

                {/* Role breakdown */}
                {Object.keys(generated.roleBreakdown).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(generated.roleBreakdown)
                      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                      .map(([role, count]) => (
                        <Badge key={role} variant="outline" className="text-[10px] capitalize border-border/60 text-muted-foreground">
                          {role} ×{count}
                        </Badge>
                      ))}
                  </div>
                )}

                <pre className="rounded-lg border border-border bg-secondary/20 p-3 text-xs font-mono text-muted-foreground overflow-auto max-h-[280px] whitespace-pre-wrap">
                  {generated.deckList}
                </pre>

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1 border-border/60 text-xs"
                    onClick={() => { setExportOpen(true); setCopied(false); }}>
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Export
                  </Button>
                  <Button size="sm" onClick={saveToDeckWorkshop} disabled={saving}
                    className="flex-1 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 text-xs">
                    {saving
                      ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…</>
                      : <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Save to Decks</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Export dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-fantasy text-xl text-gradient-gold flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" /> Export — {generated?.narrative.name}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Arena / MTGO format. Copy or download.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Textarea ref={exportTextareaRef} value={generated?.deckList ?? ""} readOnly
              className="min-h-[260px] font-mono text-xs bg-secondary/40 border-border/60 resize-none" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={downloadExport} className="border-border/60">
                <Download className="mr-1.5 h-4 w-4" /> Download .txt
              </Button>
              <Button onClick={copyExport}
                className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
                {copied ? <><Check className="mr-1.5 h-4 w-4" /> Copied!</> : <><Copy className="mr-1.5 h-4 w-4" /> Copy</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
