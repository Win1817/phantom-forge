import { useState } from "react";
import { Sparkles, Download, Copy, Check, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { exportDeckText, parseDeckText } from "@/lib/deckImportExport";
import { getCardImage } from "@/lib/scryfall";

const FORMATS = ["Standard", "Pioneer", "Modern", "Commander", "Pauper", "Casual"];
const STYLES = ["Aggro", "Control", "Midrange", "Combo", "Tempo", "Ramp"];
const COLORS = [
  { code: "W", label: "White", bg: "bg-mana-white text-amber-900" },
  { code: "U", label: "Blue",  bg: "bg-mana-blue text-white" },
  { code: "B", label: "Black", bg: "bg-mana-black text-white" },
  { code: "R", label: "Red",   bg: "bg-mana-red text-white" },
  { code: "G", label: "Green", bg: "bg-mana-green text-white" },
];

interface GeneratedDeck {
  name: string;
  description: string;
  deckList: string;
  strategy: string;
}

export default function Decksmith() {
  const { user } = useAuth();
  const [format, setFormat] = useState("Commander");
  const [style, setStyle] = useState("Midrange");
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [budget, setBudget] = useState("any");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedDeck | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const COOLDOWN_MS = 15_000;

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

  const toggleColor = (c: string) =>
    setSelectedColors((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );

  const generate = async () => {
    if (!user) { toast.error("Sign in required"); return; }
    if (Date.now() - lastGenerated < COOLDOWN_MS) {
      toast.error(`Please wait ${cooldownRemaining}s before generating again.`);
      return;
    }
    setLastGenerated(Date.now());
    setGenerating(true);
    setGenerated(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-deck", {
        body: {
          format,
          style,
          colors: selectedColors,
          budget,
          notes: notes.trim(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setGenerated(data as GeneratedDeck);
    } catch (e) {
      toast.error((e as Error).message || "AI generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const openExport = () => {
    setExportOpen(true);
    setCopied(false);
  };

  const copyExport = () => {
    if (!generated) return;
    navigator.clipboard.writeText(generated.deckList);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadExport = () => {
    if (!generated) return;
    const blob = new Blob([generated.deckList], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${generated.name.replace(/\s+/g, "_")}.txt`;
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
          name: generated.name,
          format: format.toLowerCase(),
          description: generated.description,
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
          // Try to resolve via Scryfall
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
            image_url: card ? getCardImage(card) : null,
            mana_cost: card?.mana_cost ?? null,
            cmc: card?.cmc ?? null,
            type_line: card?.type_line ?? null,
            colors: card?.colors ?? [],
            is_commander: line.isCommander,
            is_sideboard: line.isSideboard,
          };
        })
      );

      await supabase.from("deck_cards").insert(inserts);
      toast.success(`"${generated.name}" saved to Deck Workshop`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">AI Decksmith</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe what you want — the Decksmith conjures a complete deck list.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Config panel */}
        <div className="space-y-5">
          {/* Format */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Format</Label>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-all ${
                    format === f
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Playstyle */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Playstyle</Label>
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-all ${
                    style === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Colors */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Colors (optional)</Label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.code}
                  onClick={() => toggleColor(c.code)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ring-2 transition-all ${c.bg} ${
                    selectedColors.includes(c.code)
                      ? "ring-primary scale-110 shadow-[0_0_12px_hsl(var(--primary)/0.5)]"
                      : "ring-transparent opacity-50 hover:opacity-80"
                  }`}
                  title={c.label}
                >
                  {c.code}
                </button>
              ))}
              {selectedColors.length > 0 && (
                <button
                  onClick={() => setSelectedColors([])}
                  className="px-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Budget */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Budget</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { v: "budget", l: "Budget (<$30)" },
                { v: "mid", l: "Mid ($30–$100)" },
                { v: "competitive", l: "Competitive ($100+)" },
                { v: "any", l: "No limit" },
              ].map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => setBudget(v)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-all ${
                    budget === v
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Additional notes <span className="normal-case tracking-normal text-muted-foreground/60">(optional)</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. tribal goblins theme, focus on burn spells, include Krenko as commander…"
              className="min-h-[80px] bg-secondary/40 border-border/60 resize-none text-sm"
              maxLength={500}
            />
          </div>

          <Button
            onClick={generate}
            disabled={generating || cooldownRemaining > 0}
            className="w-full h-11 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 font-semibold disabled:opacity-50"
          >
            {generating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Conjuring deck…</>
            ) : cooldownRemaining > 0 ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ready in {cooldownRemaining}s…</>
            ) : (
              <><Wand2 className="mr-2 h-4 w-4" /> Summon Deck</>
            )}
          </Button>
        </div>

        {/* Result panel */}
        <div>
          {!generated && !generating && (
            <Card className="border-primary/20 bg-arcane h-full min-h-[300px]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.2),transparent_60%)] rounded-xl" />
              <CardContent className="relative flex flex-col items-center justify-center gap-4 py-16 text-center h-full">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-card ring-1 ring-primary/40">
                  <Sparkles className="h-7 w-7 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Configure your deck preferences and hit <strong className="text-foreground">Summon Deck</strong> to generate a complete list.
                </p>
              </CardContent>
            </Card>
          )}

          {generating && (
            <Card className="border-primary/20 bg-arcane h-full min-h-[300px]">
              <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center h-full">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">The arcane archives are being consulted…</p>
              </CardContent>
            </Card>
          )}

          {generated && (
            <Card className="border-primary/30 bg-card h-full">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="font-fantasy text-lg text-gradient-gold">{generated.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">{generated.description}</p>
                  </div>
                  <Badge variant="outline" className="border-primary/40 text-primary shrink-0 text-[10px]">{format}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {generated.strategy && (
                  <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground leading-relaxed">
                    <p className="font-semibold text-foreground mb-1 uppercase tracking-wider text-[10px]">Strategy</p>
                    {generated.strategy}
                  </div>
                )}

                <pre className="rounded-lg border border-border bg-secondary/20 p-3 text-xs font-mono text-muted-foreground overflow-auto max-h-[280px] whitespace-pre-wrap">
                  {generated.deckList}
                </pre>

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-border/60 text-xs"
                    onClick={openExport}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Export
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 text-xs"
                    onClick={saveToDeckWorkshop}
                    disabled={saving}
                  >
                    {saving
                      ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…</>
                      : <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Save to Decks</>
                    }
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
              <Download className="h-5 w-5 text-primary" /> Export — {generated?.name}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Arena / MTGO format. Copy or download.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Textarea
              value={generated?.deckList ?? ""}
              readOnly
              className="min-h-[260px] font-mono text-xs bg-secondary/40 border-border/60 resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={downloadExport} className="border-border/60">
                <Download className="mr-1.5 h-4 w-4" /> Download .txt
              </Button>
              <Button
                onClick={copyExport}
                className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90"
              >
                {copied ? <><Check className="mr-1.5 h-4 w-4" /> Copied!</> : <><Copy className="mr-1.5 h-4 w-4" /> Copy</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
