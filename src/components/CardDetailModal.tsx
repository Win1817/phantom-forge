import { useCurrency } from "@/contexts/CurrencyContext";
import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, Library, Sparkles, X, Loader2, ExternalLink, Zap, Layers } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { getCardById, getCardImageLarge, type ScryfallCard } from "@/lib/scryfall";
import { supabase } from "@/integrations/supabase/client";
import { explainCard, type AIExplanation } from "@/lib/gemini";
import {
  classifyRole,
  findRelatedCards,
  findCombos,
  type CardRole,
} from "@/lib/cardAnalytics";
import { toast } from "sonner";

interface Props {
  cardId: string | null;
  siblingIds?: string[];
  onChangeCardId?: (id: string) => void;
  onClose: () => void;
}

const RARITY_CLASS: Record<string, string> = {
  common:   "border-rarity-common/40 text-rarity-common",
  uncommon: "border-rarity-uncommon/50 text-rarity-uncommon",
  rare:     "border-rarity-rare/60 text-rarity-rare",
  mythic:   "border-rarity-mythic/60 text-rarity-mythic",
};

const FORMATS = ["standard", "pioneer", "modern", "legacy", "vintage", "commander", "pauper", "brawl"];

const aiCache  = new Map<string, AIExplanation>();
const mathCache = new Map<string, MathAnalysis>();

interface MathAnalysis {
  role: CardRole;
  simple: string;
  howToUse: string;
  related: string[];
  combos: string[];
}

const CardDetailModal = ({ cardId, siblingIds = [], onChangeCardId, onClose }: Props) => {
  const isMobile = useIsMobile();
  const [card, setCard]         = useState<ScryfallCard | null>(null);
  const [loading, setLoading]   = useState(false);
  const [math, setMath]         = useState<MathAnalysis | null>(null);
  const [mathLoading, setMathLoading] = useState(false);
  const [ai, setAi]             = useState<AIExplanation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]   = useState<string | null>(null);
  const [adding, setAdding]     = useState(false);

  const open = !!cardId;

  // Load card data
  useEffect(() => {
    if (!cardId) { setCard(null); setMath(null); setAi(null); setAiError(null); return; }
    let cancelled = false;
    setLoading(true);
    setMath(mathCache.get(cardId) ?? null);
    setAi(aiCache.get(cardId) ?? null);
    setAiError(null);
    getCardById(cardId)
      .then((c) => { if (!cancelled) setCard(c); })
      .catch(() => toast.error("Failed to load card"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [cardId]);

  // Auto-run math analysis once card loads
  useEffect(() => {
    if (!card || math) return;
    if (mathCache.has(card.id)) { setMath(mathCache.get(card.id)!); return; }

    setMathLoading(true);
    const run = async () => {
      const role    = classifyRole(card);
      const simple  = card.oracle_text
        ? `${card.name} is a ${role} card. ${card.oracle_text.split("\n")[0]}`
        : `${card.name} is a ${role} card.`;
      const howToUse = card.type_line?.toLowerCase().includes("creature")
        ? `Play ${card.name} to apply pressure. Use it to ${role === "removal" ? "answer threats" : role === "ramp" ? "accelerate your mana" : "advance your game plan"}.`
        : `Cast ${card.name} at the right moment to maximize value. Consider its interaction with your other spells.`;
      const [related, combosRaw] = await Promise.all([
        findRelatedCards(card, 5),
        findCombos(card.name),
      ]);
      const combos = combosRaw.slice(0, 3);
      const result: MathAnalysis = { role, simple, howToUse, related, combos };
      mathCache.set(card.id, result);
      setMath(result);
      setMathLoading(false);
    };
    run().catch(() => setMathLoading(false));
  }, [card, math]);

  const idx     = cardId ? siblingIds.indexOf(cardId) : -1;
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < siblingIds.length - 1;

  const goPrev = useCallback(() => { if (hasPrev && onChangeCardId) onChangeCardId(siblingIds[idx - 1]); }, [hasPrev, idx, siblingIds, onChangeCardId]);
  const goNext = useCallback(() => { if (hasNext && onChangeCardId) onChangeCardId(siblingIds[idx + 1]); }, [hasNext, idx, siblingIds, onChangeCardId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goPrev, goNext]);

  // Optional AI flavor enrichment
  const fetchAI = async () => {
    if (!card || aiLoading) return;
    if (aiCache.has(card.id)) { setAi(aiCache.get(card.id)!); return; }
    setAiLoading(true);
    setAiError(null);
    try {
      const face = card.card_faces?.[0];
      const result = await explainCard({
        name: card.name,
        type_line: card.type_line ?? face?.type_line,
        mana_cost: card.mana_cost ?? face?.mana_cost,
        oracle_text: card.oracle_text ?? face?.oracle_text,
        power: card.power ?? face?.power,
        toughness: card.toughness ?? face?.toughness,
        loyalty: card.loyalty ?? face?.loyalty,
      });
      aiCache.set(card.id, result);
      setAi(result);
    } catch (e) {
      setAiError((e as Error).message || "AI failed");
    } finally {
      setAiLoading(false);
    }
  };

  const addToCollection = async () => {
    if (!card) return;
    setAdding(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { toast.error("Sign in required"); setAdding(false); return; }
    const img = getCardImageLarge(card);
    const { error } = await supabase.from("collection_cards").insert({
      user_id: auth.user.id,
      scryfall_id: card.id,
      card_name: card.name,
      set_code: card.set,
      set_name: card.set_name,
      collector_number: card.collector_number,
      rarity: card.rarity,
      mana_cost: card.mana_cost,
      type_line: card.type_line,
      colors: card.colors ?? [],
      cmc: card.cmc,
      image_url: img,
      price_usd: card.prices?.usd ? Number(card.prices.usd) : null,
      quantity: 1,
    });
    setAdding(false);
    if (error) toast.error(error.message);
    else toast.success(`Added ${card.name} to your collection`);
  };

  const body = (
    <CardDetailBody
      card={card} loading={loading}
      math={math} mathLoading={mathLoading}
      ai={ai} aiLoading={aiLoading} aiError={aiError}
      onExplain={fetchAI} onAdd={addToCollection} adding={adding}
      hasPrev={hasPrev} hasNext={hasNext} onPrev={goPrev} onNext={goNext}
      isMobile={isMobile}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="h-[95vh]">
          <DrawerTitle className="sr-only">{card?.name ?? "Card details"}</DrawerTitle>
          <DrawerDescription className="sr-only">Card details and analysis</DrawerDescription>
          <ScrollArea className="h-full">
            <div className="p-4 pb-28">{body}</div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl border-border bg-card p-0 sm:rounded-xl">
        <DialogTitle className="sr-only">{card?.name ?? "Card details"}</DialogTitle>
        <DialogDescription className="sr-only">Card details and analysis</DialogDescription>
        <ScrollArea className="max-h-[88vh]">
          <div className="p-6">{body}</div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};


// ─── Versions Tab ────────────────────────────────────────────────────────────

interface Printing {
  id: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  image_uris?: { normal?: string; small?: string };
  card_faces?: Array<{ image_uris?: { normal?: string; small?: string } }>;
  prices?: { usd?: string; usd_foil?: string };
  released_at?: string;
  scryfall_uri?: string;
}

const printingsCache = new Map<string, Printing[]>();

const VersionsTab = ({ card }: { card: ScryfallCard }) => {
  const [printings, setPrintings] = useState<Printing[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!card.prints_search_uri) return;
    if (printingsCache.has(card.id)) { setPrintings(printingsCache.get(card.id)!); return; }
    setLoading(true);
    fetch(card.prints_search_uri + "&order=released&unique=prints")
      .then(r => r.json())
      .then(json => {
        const data: Printing[] = json.data ?? [];
        printingsCache.set(card.id, data);
        setPrintings(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [card.id, card.prints_search_uri]);

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  if (!printings.length) return (
    <p className="text-sm text-muted-foreground py-6 text-center">No printings found.</p>
  );

  const RARITY_C: Record<string, string> = {
    common: "text-rarity-common", uncommon: "text-rarity-uncommon",
    rare: "text-rarity-rare", mythic: "text-rarity-mythic",
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{printings.length} printing{printings.length !== 1 ? "s" : ""} found</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {printings.map(p => {
          const img = p.image_uris?.small ?? p.card_faces?.[0]?.image_uris?.small;
          const price = fmtScryfall(p.prices) || (fmtScryfall(p.prices, true) ? `✦ ${fmtScryfall(p.prices, true)}` : null);
          return (
            <a key={p.id} href={p.scryfall_uri} target="_blank" rel="noreferrer"
              className="group flex flex-col gap-1.5 rounded-xl border border-border/50 bg-secondary/20 p-2.5 hover:border-primary/40 hover:bg-secondary/40 transition-all">
              {img && (
                <div className="overflow-hidden rounded-lg">
                  <img src={img} alt={p.set_name} loading="lazy"
                    className="w-full h-auto object-cover group-hover:scale-[1.02] transition-transform duration-300" />
                </div>
              )}
              <div className="space-y-0.5">
                <p className="text-[11px] font-semibold text-foreground leading-tight truncate">{p.set_name}</p>
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[10px] uppercase font-medium ${RARITY_C[p.rarity] ?? ""}`}>{p.rarity}</span>
                  <span className="text-[10px] text-muted-foreground">#{p.collector_number}</span>
                </div>
                {price && <p className="text-[10px] text-mana-green font-medium">{price}</p>}
                {p.released_at && (
                  <p className="text-[10px] text-muted-foreground/50">{p.released_at.slice(0, 4)}</p>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
};

// ─── Body ───────────────────────────────────────────────────────────────────

interface BodyProps {
  card: ScryfallCard | null;
  loading: boolean;
  math: MathAnalysis | null;
  mathLoading: boolean;
  ai: AIExplanation | null;
  aiLoading: boolean;
  aiError: string | null;
  onExplain: () => void;
  onAdd: () => void;
  adding: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  isMobile: boolean;
}

const CardDetailBody = ({
  card, loading, math, mathLoading, ai, aiLoading, aiError,
  onExplain, onAdd, adding, hasPrev, hasNext, onPrev, onNext, isMobile,
}: BodyProps) => {
  if (loading || !card) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<"details" | "versions">("details");

  const face      = card.card_faces?.[0];
  const img       = getCardImageLarge(card);
  const oracle    = card.oracle_text ?? face?.oracle_text;
  const flavor    = card.flavor_text ?? face?.flavor_text;
  const power     = card.power ?? face?.power;
  const toughness = card.toughness ?? face?.toughness;
  const loyalty   = card.loyalty ?? face?.loyalty;
  const rarity    = card.rarity ?? "common";
  const legalities = card.legalities ?? {};

  // Merge math + AI: math is the base, AI can enrich simple/howToUse if available
  const displaySimple   = ai?.simple   || math?.simple   || null;
  const displayHowToUse = ai?.howToUse || math?.howToUse || null;
  const displayRole     = math?.role;
  const displayRelated  = math?.related  ?? ai?.related  ?? [];
  const displayCombos   = math?.combos   ?? [];

  const badgesEl = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className={`text-[10px] uppercase ${RARITY_CLASS[rarity] ?? RARITY_CLASS.common}`}>{rarity}</Badge>
      {(card.mana_cost ?? face?.mana_cost) && (
        <Badge variant="outline" className="font-mono text-[11px]">{card.mana_cost ?? face?.mana_cost}</Badge>
      )}
      {power && toughness && <Badge variant="outline" className="text-[11px]">{power}/{toughness}</Badge>}
      {loyalty && <Badge variant="outline" className="text-[11px]">Loyalty {loyalty}</Badge>}
      {displayRole && (
        <Badge variant="outline" className="text-[10px] capitalize border-primary/40 text-primary">{displayRole}</Badge>
      )}
    </div>
  );

  const priceEl = (card.prices?.usd || card.prices?.usd_foil) && (
    <div className="flex flex-wrap gap-1.5">
      {fmtScryfall(card.prices) && <Badge variant="outline" className="text-[11px] text-mana-green border-mana-green/40">{fmtScryfall(card.prices)}</Badge>}
      {fmtScryfall(card.prices, true) && <Badge variant="outline" className="text-[11px] text-primary border-primary/40">Foil {fmtScryfall(card.prices, true)}</Badge>}
    </div>
  );

  const actionEl = (compact: boolean) => (
    <div className={compact ? "flex flex-col gap-2 pt-1" : "grid grid-cols-2 gap-2"}>
      <Button onClick={onAdd} disabled={adding} size={compact ? "sm" : "default"}
        className={`${compact ? "w-full" : ""} bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90`}>
        {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Library className="mr-1.5 h-4 w-4" /> Inventory</>}
      </Button>
      <Button variant="secondary" size={compact ? "sm" : "default"} disabled title="Coming soon" className={compact ? "w-full" : ""}>
        <Plus className="mr-1.5 h-4 w-4" /> Deck
      </Button>
    </div>
  );

  const imageEl = (compact: boolean) => (
    <div
      className={
        compact
          ? "w-[140px] shrink-0 overflow-hidden rounded-xl border border-border bg-secondary ring-1 ring-border"
          : "overflow-hidden rounded-xl border border-border bg-secondary ring-1 ring-border"
      }
    >
      {img ? (
        <img src={img} alt={card.name} loading="eager" className="h-auto w-full" />
      ) : (
        <div className="aspect-[488/680] flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
          {card.name}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Nav header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" disabled={!hasPrev} onClick={onPrev} aria-label="Previous card"><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" disabled={!hasNext} onClick={onNext} aria-label="Next card"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <a href={card.scryfall_uri} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          Scryfall <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 p-1 rounded-lg bg-secondary/40 border border-border/50">
        {([
          { key: "details",  label: "Details",  icon: Zap },
          { key: "versions", label: "Versions", icon: Layers },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" onClick={() => setActiveTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-1.5 px-3 text-sm font-medium rounded-md transition-all duration-200 ${
              activeTab === key
                ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Versions tab ── */}
      {activeTab === "versions" && <VersionsTab card={card} />}

      {/* ── MOBILE layout ── */}
      {activeTab === "details" && isMobile ? (
        <>
          {/* Top row: image left, info right */}
          <div className="flex gap-3">
            {/* Card image — fixed width */}
            <div className="w-[130px] shrink-0 overflow-hidden rounded-lg border border-border bg-secondary ring-1 ring-border">
              {img ? (
                <img src={img} alt={card.name} loading="eager" className="h-auto w-full" />
              ) : (
                <div className="aspect-[488/680] flex items-center justify-center p-2 text-center text-xs text-muted-foreground">
                  {card.name}
                </div>
              )}
            </div>

            {/* Info column */}
            <div className="flex-1 min-w-0 flex flex-col gap-2 justify-between py-0.5">
              <div>
                <h2 className="font-fantasy text-lg font-bold text-gradient-gold leading-tight">{card.name}</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                  {card.type_line ?? face?.type_line}
                  {card.set_name && <><br /><span className="uppercase tracking-wide">{card.set_name}</span> · #{card.collector_number}</>}
                </p>
              </div>
              {badgesEl}
              {priceEl}
            </div>
          </div>

          {/* Action buttons — full width */}
          <div className="flex gap-2">
            <Button onClick={onAdd} disabled={adding}
              className="flex-1 h-11 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Library className="mr-2 h-4 w-4" /> Inventory</>}
            </Button>
            <Button variant="secondary" disabled className="flex-1 h-11">
              <Plus className="mr-2 h-4 w-4" /> Add to Deck
            </Button>
          </div>

          {/* Rest of content */}
          <DetailContent
            oracle={oracle} flavor={flavor} legalities={legalities}
            displaySimple={displaySimple} displayHowToUse={displayHowToUse}
            displayCombos={displayCombos} displayRelated={displayRelated}
            mathLoading={mathLoading}
            ai={ai} aiLoading={aiLoading} aiError={aiError} onExplain={onExplain}
          />
        </>
      ) : activeTab === "details" ? (
        /* ── DESKTOP 2-column layout ── */
        <div className="grid gap-6 md:grid-cols-[minmax(0,260px)_1fr] lg:grid-cols-[minmax(0,300px)_1fr]">
          <div className="space-y-3">
            {imageEl(false)}
            {actionEl(false)}
          </div>
          <div className="space-y-4">
            <div>
              <h2 className="font-fantasy text-2xl font-bold text-gradient-gold md:text-3xl">{card.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {card.type_line ?? face?.type_line}
                {card.set_name && <> · <span className="uppercase tracking-wide">{card.set_name}</span></>}
                {card.collector_number && <> · #{card.collector_number}</>}
              </p>
            </div>
            {badgesEl}
            {priceEl}
            <DetailContent
              oracle={oracle} flavor={flavor} legalities={legalities}
              displaySimple={displaySimple} displayHowToUse={displayHowToUse}
              displayCombos={displayCombos} displayRelated={displayRelated}
              mathLoading={mathLoading}
              ai={ai} aiLoading={aiLoading} aiError={aiError} onExplain={onExplain}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

// ─── Shared detail content ───────────────────────────────────────────────────

interface DetailProps {
  oracle?: string;
  flavor?: string;
  legalities: Record<string, string>;
  displaySimple: string | null;
  displayHowToUse: string | null;
  displayCombos: string[];
  displayRelated: string[];
  mathLoading: boolean;
  ai: AIExplanation | null;
  aiLoading: boolean;
  aiError: string | null;
  onExplain: () => void;
}

const DetailContent = ({
  oracle, flavor, legalities,
  displaySimple, displayHowToUse, displayCombos, displayRelated,
  mathLoading, ai, aiLoading, aiError, onExplain,
}: DetailProps) => (
  <div className="space-y-4">
    {/* Oracle text */}
    {oracle && (
      <div className="rounded-lg border border-border bg-secondary/40 p-4">
        <p className="whitespace-pre-line text-sm leading-relaxed">{oracle}</p>
        {flavor && <p className="mt-3 border-t border-border pt-3 text-xs italic text-muted-foreground">{flavor}</p>}
      </div>
    )}

    {/* Legalities */}
    <div>
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Legalities</p>
      <div className="flex flex-wrap gap-1.5">
        {FORMATS.map((f) => {
          const status = legalities[f] ?? "not_legal";
          return (
            <Badge key={f} variant="outline"
              className={`text-[10px] capitalize ${
                status === "legal"      ? "border-mana-green/40 text-mana-green" :
                status === "restricted" ? "border-primary/40 text-primary" :
                status === "banned"     ? "border-destructive/40 text-destructive" :
                "border-border text-muted-foreground/70"
              }`}>
              {f}
            </Badge>
          );
        })}
      </div>
    </div>

    <Separator className="bg-border" />

    {/* ── Math Analysis (always-on) ── */}
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        <h3 className="font-fantasy text-lg">Card Analysis</h3>
        {mathLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {mathLoading && (
        <p className="text-xs text-muted-foreground">Analysing oracle text…</p>
      )}

      {!mathLoading && displaySimple && (
        <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
          {displaySimple && (
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">What it does</p>
              <p className="text-sm leading-relaxed">{displaySimple}</p>
            </div>
          )}
          {displayHowToUse && (
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">How to use it</p>
              <p className="text-sm leading-relaxed">{displayHowToUse}</p>
            </div>
          )}
          {displayCombos.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">Known combos</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {displayCombos.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
          {displayRelated.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">Related cards</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {displayRelated.map((r) => (
                  <Badge key={r} variant="outline" className="border-accent/40 text-accent-foreground">{r}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>

    {/* ── AI Flavor (optional, on-demand) ── */}
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary/70" />
          <h3 className="font-fantasy text-sm text-muted-foreground">AI Flavor</h3>
        </div>
        {!ai && !aiLoading && (
          <Button size="sm" variant="ghost" onClick={onExplain}
            className="text-xs text-muted-foreground hover:text-foreground h-7 px-2">
            {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Enrich with AI"}
          </Button>
        )}
      </div>
      {aiError && <p className="text-xs text-destructive">{aiError}</p>}
      {aiLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consulting Gemini…
        </div>
      )}
      {ai?.simple && (
        <p className="text-xs text-muted-foreground italic leading-relaxed border-l-2 border-primary/30 pl-3">
          {ai.simple}
        </p>
      )}
    </div>
  </div>
);

export default CardDetailModal;
