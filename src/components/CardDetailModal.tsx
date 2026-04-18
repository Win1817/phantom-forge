import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, Library, Sparkles, X, Loader2, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { getCardById, getCardImageLarge, type ScryfallCard } from "@/lib/scryfall";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AIExplanation {
  simple?: string;
  howToUse?: string;
  combos?: string[];
  role?: string;
  related?: string[];
}

interface Props {
  cardId: string | null;
  /** Optional sibling ids for next/previous navigation */
  siblingIds?: string[];
  onChangeCardId?: (id: string) => void;
  onClose: () => void;
}

const RARITY_CLASS: Record<string, string> = {
  common: "border-rarity-common/40 text-rarity-common",
  uncommon: "border-rarity-uncommon/50 text-rarity-uncommon",
  rare: "border-rarity-rare/60 text-rarity-rare",
  mythic: "border-rarity-mythic/60 text-rarity-mythic",
};

const FORMATS = ["standard", "pioneer", "modern", "legacy", "vintage", "commander", "pauper", "brawl"];

const aiCache = new Map<string, AIExplanation>();

const CardDetailModal = ({ cardId, siblingIds = [], onChangeCardId, onClose }: Props) => {
  const isMobile = useIsMobile();
  const [card, setCard] = useState<ScryfallCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [ai, setAi] = useState<AIExplanation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const open = !!cardId;

  useEffect(() => {
    if (!cardId) {
      setCard(null);
      setAi(null);
      setAiError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setAi(aiCache.get(cardId) ?? null);
    setAiError(null);
    getCardById(cardId)
      .then((c) => {
        if (!cancelled) setCard(c);
      })
      .catch(() => toast.error("Failed to load card"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  const idx = cardId ? siblingIds.indexOf(cardId) : -1;
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < siblingIds.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev && onChangeCardId) onChangeCardId(siblingIds[idx - 1]);
  }, [hasPrev, idx, siblingIds, onChangeCardId]);

  const goNext = useCallback(() => {
    if (hasNext && onChangeCardId) onChangeCardId(siblingIds[idx + 1]);
  }, [hasNext, idx, siblingIds, onChangeCardId]);

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goPrev, goNext]);

  const fetchAI = async () => {
    if (!card || aiLoading) return;
    if (aiCache.has(card.id)) {
      setAi(aiCache.get(card.id)!);
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const face = card.card_faces?.[0];
      const payload = {
        name: card.name,
        type_line: card.type_line ?? face?.type_line,
        mana_cost: card.mana_cost ?? face?.mana_cost,
        oracle_text: card.oracle_text ?? face?.oracle_text,
        power: card.power ?? face?.power,
        toughness: card.toughness ?? face?.toughness,
        loyalty: card.loyalty ?? face?.loyalty,
      };
      const { data, error } = await supabase.functions.invoke("explain-card", { body: { card: payload } });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      aiCache.set(card.id, data as AIExplanation);
      setAi(data as AIExplanation);
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
    if (!auth.user) {
      toast.error("Sign in required");
      setAdding(false);
      return;
    }
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
      card={card}
      loading={loading}
      ai={ai}
      aiLoading={aiLoading}
      aiError={aiError}
      onExplain={fetchAI}
      onAdd={addToCollection}
      adding={adding}
      hasPrev={hasPrev}
      hasNext={hasNext}
      onPrev={goPrev}
      onNext={goNext}
      isMobile={isMobile}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerTitle className="sr-only">{card?.name ?? "Card details"}</DrawerTitle>
          <DrawerDescription className="sr-only">Card details and AI insights</DrawerDescription>
          <ScrollArea className="max-h-[88vh]">
            <div className="p-4 pb-8">{body}</div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl border-border bg-card p-0 sm:rounded-xl">
        <DialogTitle className="sr-only">{card?.name ?? "Card details"}</DialogTitle>
        <DialogDescription className="sr-only">Card details and AI insights</DialogDescription>
        <ScrollArea className="max-h-[88vh]">
          <div className="p-6">{body}</div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

interface BodyProps {
  card: ScryfallCard | null;
  loading: boolean;
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
  card,
  loading,
  ai,
  aiLoading,
  aiError,
  onExplain,
  onAdd,
  adding,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  isMobile,
}: BodyProps) => {
  if (loading || !card) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const face = card.card_faces?.[0];
  const img = getCardImageLarge(card);
  const oracle = card.oracle_text ?? face?.oracle_text;
  const flavor = card.flavor_text ?? face?.flavor_text;
  const power = card.power ?? face?.power;
  const toughness = card.toughness ?? face?.toughness;
  const loyalty = card.loyalty ?? face?.loyalty;
  const rarity = card.rarity ?? "common";

  const legalities = card.legalities ?? {};

  return (
    <div className="space-y-6">
      {/* Nav header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" disabled={!hasPrev} onClick={onPrev} aria-label="Previous card">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" disabled={!hasNext} onClick={onNext} aria-label="Next card">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <a
          href={card.scryfall_uri}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Scryfall <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,260px)_1fr] lg:grid-cols-[minmax(0,300px)_1fr]">
        {/* Image */}
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-border bg-secondary ring-1 ring-border">
            {img ? (
              <img src={img} alt={card.name} loading="lazy" className="h-auto w-full" />
            ) : (
              <div className="aspect-[488/680] flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
                {card.name}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={onAdd} disabled={adding} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Library className="mr-1.5 h-4 w-4" /> Inventory</>}
            </Button>
            <Button variant="secondary" disabled title="Coming soon">
              <Plus className="mr-1.5 h-4 w-4" /> Deck
            </Button>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-4">
          <div>
            <h2 className="font-fantasy text-2xl font-bold text-gradient-gold md:text-3xl">{card.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {card.type_line ?? face?.type_line}
              {card.set_name && <> · <span className="uppercase tracking-wide">{card.set_name}</span></>}
              {card.collector_number && <> · #{card.collector_number}</>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`text-[10px] uppercase ${RARITY_CLASS[rarity] ?? RARITY_CLASS.common}`}>
              {rarity}
            </Badge>
            {(card.mana_cost ?? face?.mana_cost) && (
              <Badge variant="outline" className="font-mono text-[11px]">{card.mana_cost ?? face?.mana_cost}</Badge>
            )}
            {power && toughness && (
              <Badge variant="outline" className="text-[11px]">{power}/{toughness}</Badge>
            )}
            {loyalty && <Badge variant="outline" className="text-[11px]">Loyalty {loyalty}</Badge>}
            {card.prices?.usd && <Badge variant="outline" className="text-[11px] text-mana-green border-mana-green/40">${card.prices.usd}</Badge>}
            {card.prices?.usd_foil && <Badge variant="outline" className="text-[11px] text-primary border-primary/40">Foil ${card.prices.usd_foil}</Badge>}
          </div>

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
                const legal = status === "legal";
                const restricted = status === "restricted";
                const banned = status === "banned";
                return (
                  <Badge
                    key={f}
                    variant="outline"
                    className={`text-[10px] capitalize ${
                      legal ? "border-mana-green/40 text-mana-green" :
                      restricted ? "border-primary/40 text-primary" :
                      banned ? "border-destructive/40 text-destructive" :
                      "border-border text-muted-foreground/70"
                    }`}
                  >
                    {f}
                  </Badge>
                );
              })}
            </div>
          </div>

          <Separator className="bg-border" />

          {/* AI section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="font-fantasy text-lg">AI Insights</h3>
              </div>
              {!ai && (
                <Button size="sm" onClick={onExplain} disabled={aiLoading} className="bg-gradient-to-r from-accent to-primary text-primary-foreground hover:opacity-90">
                  {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Explain card"}
                </Button>
              )}
            </div>

            {aiError && <p className="text-xs text-destructive">{aiError}</p>}

            {!ai && !aiLoading && !aiError && (
              <p className="text-xs text-muted-foreground">Generate a beginner-friendly breakdown, gameplay tips, role, and synergies.</p>
            )}

            {aiLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consulting the archives…
              </div>
            )}

            {ai && (
              <div className="space-y-3 rounded-lg border border-primary/20 bg-arcane/40 p-4">
                {ai.role && (
                  <Badge variant="outline" className="border-primary/40 text-primary capitalize">{ai.role}</Badge>
                )}
                {ai.simple && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Plain English</p>
                    <p className="mt-1 text-sm leading-relaxed">{ai.simple}</p>
                  </div>
                )}
                {ai.howToUse && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">How to use it</p>
                    <p className="mt-1 text-sm leading-relaxed">{ai.howToUse}</p>
                  </div>
                )}
                {ai.combos && ai.combos.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Combos & synergies</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                      {ai.combos.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}
                {ai.related && ai.related.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Related cards</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {ai.related.map((r) => (
                        <Badge key={r} variant="outline" className="border-accent/40 text-accent-foreground">{r}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardDetailModal;
