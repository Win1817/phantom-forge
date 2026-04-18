import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, Loader2, Swords, Shield, Crown,
  LayoutGrid, List, Download, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import CardDetailModal from "@/components/CardDetailModal";
import { exportDeckText } from "@/lib/deckImportExport";

interface DeckCard {
  id: string;
  scryfall_id: string;
  card_name: string;
  image_url: string | null;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string | null;
  colors: string[] | null;
  quantity: number;
  is_sideboard: boolean;
  is_commander: boolean;
  set_code: string | null;
  collector_number: string | null;
}

interface Deck {
  id: string;
  name: string;
  format: string;
  description: string | null;
  colors: string[] | null;
  cover_image_url: string | null;
  created_at: string;
}

const MANA_COLOR: Record<string, string> = {
  W: "bg-mana-white text-amber-900",
  U: "bg-mana-blue text-white",
  B: "bg-mana-black text-white",
  R: "bg-mana-red text-white",
  G: "bg-mana-green text-white",
};

const FORMAT_LABELS: Record<string, string> = {
  standard: "Standard", pioneer: "Pioneer", modern: "Modern",
  legacy: "Legacy", vintage: "Vintage", commander: "Commander",
  pauper: "Pauper", brawl: "Brawl", casual: "Casual",
};

function groupByType(cards: DeckCard[]) {
  const groups: Record<string, DeckCard[]> = {};
  for (const c of cards) {
    const type = c.type_line?.split("—")[0].trim() ?? "Other";
    const key = type.includes("Creature") ? "Creatures"
      : type.includes("Instant") ? "Instants"
      : type.includes("Sorcery") ? "Sorceries"
      : type.includes("Enchantment") ? "Enchantments"
      : type.includes("Artifact") ? "Artifacts"
      : type.includes("Planeswalker") ? "Planeswalkers"
      : type.includes("Land") ? "Lands"
      : "Other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }
  // Sort within groups by cmc then name
  Object.values(groups).forEach((g) =>
    g.sort((a, b) => (a.cmc ?? 0) - (b.cmc ?? 0) || a.card_name.localeCompare(b.card_name))
  );
  return groups;
}

const TYPE_ORDER = ["Commanders", "Creatures", "Instants", "Sorceries", "Enchantments", "Artifacts", "Planeswalkers", "Lands", "Other"];

export default function DeckDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (user && id) load();
  }, [user, id]);

  const load = async () => {
    setLoading(true);
    const [{ data: deckData }, { data: cardData }] = await Promise.all([
      supabase.from("decks").select("*").eq("id", id!).single(),
      supabase.from("deck_cards").select("*").eq("deck_id", id!).order("card_name"),
    ]);
    if (!deckData) { navigate("/app/decks"); return; }
    setDeck(deckData);
    setCards(cardData ?? []);
    setLoading(false);
  };

  const handleExport = () => {
    if (!deck) return;
    const main = cards.filter((c) => !c.is_sideboard);
    const side = cards.filter((c) => c.is_sideboard);
    const text = exportDeckText(deck.name, main, side);
    navigator.clipboard.writeText(text);
    toast.success("Deck list copied to clipboard");
  };

  const handleDelete = async () => {
    if (!deck || !confirm(`Delete "${deck.name}"? This cannot be undone.`)) return;
    await supabase.from("deck_cards").delete().eq("deck_id", deck.id);
    await supabase.from("decks").delete().eq("id", deck.id);
    toast.success(`"${deck.name}" deleted`);
    navigate("/app/decks");
  };

  const commanders = cards.filter((c) => c.is_commander);
  const mainDeck = cards.filter((c) => !c.is_sideboard && !c.is_commander);
  const sideboard = cards.filter((c) => c.is_sideboard);
  const totalMain = mainDeck.reduce((s, c) => s + c.quantity, 0) + commanders.reduce((s, c) => s + c.quantity, 0);
  const allScryfallIds = cards.map((c) => c.scryfall_id);

  const mainGroups = groupByType(mainDeck);
  if (commanders.length > 0) mainGroups["Commanders"] = commanders;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading deck…
      </div>
    );
  }

  if (!deck) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="mt-0.5 shrink-0" onClick={() => navigate("/app/decks")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">{deck.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px] uppercase border-border/60 text-muted-foreground">
                {FORMAT_LABELS[deck.format] ?? deck.format}
              </Badge>
              <span className="text-sm text-muted-foreground">{totalMain} cards{sideboard.length > 0 ? ` · ${sideboard.reduce((s,c)=>s+c.quantity,0)} sideboard` : ""}</span>
              {deck.colors && deck.colors.length > 0 && (
                <div className="flex gap-1">
                  {deck.colors.map((c) => (
                    <span key={c} className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ring-1 ring-black/30 ${MANA_COLOR[c] ?? "bg-mana-colorless text-foreground"}`}>{c}</span>
                  ))}
                </div>
              )}
            </div>
            {deck.description && <p className="mt-1 text-sm text-muted-foreground">{deck.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-10 md:ml-0">
          <div className="flex rounded-md border border-border/60 overflow-hidden">
            <Button size="sm" variant={view === "grid" ? "secondary" : "ghost"} className="rounded-none h-8 px-2.5" onClick={() => setView("grid")}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} className="rounded-none h-8 px-2.5 border-l border-border/60" onClick={() => setView("list")}>
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button variant="outline" size="sm" className="border-border/60 h-8" onClick={handleExport}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-destructive" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {cards.length === 0 ? (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Swords className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No cards in this deck yet.</p>
          </CardContent>
        </Card>
      ) : view === "grid" ? (
        <GridView groups={mainGroups} sideboard={sideboard} onCardClick={setOpenId} />
      ) : (
        <ListView groups={mainGroups} sideboard={sideboard} onCardClick={setOpenId} />
      )}

      <CardDetailModal
        cardId={openId}
        siblingIds={allScryfallIds}
        onChangeCardId={setOpenId}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

/* ── Grid View ───────────────────────────────────────────── */
function GridView({
  groups, sideboard, onCardClick
}: { groups: Record<string, DeckCard[]>; sideboard: DeckCard[]; onCardClick: (id: string) => void }) {
  const sections = TYPE_ORDER.filter((t) => groups[t]?.length);

  return (
    <div className="space-y-8">
      {sections.map((type) => (
        <section key={type}>
          <SectionHeader type={type} cards={groups[type]} />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {groups[type].map((c) => (
              <GridCard key={c.id} card={c} onClick={() => onCardClick(c.scryfall_id)} />
            ))}
          </div>
        </section>
      ))}
      {sideboard.length > 0 && (
        <section>
          <SectionHeader type="Sideboard" cards={sideboard} icon={<Shield className="h-4 w-4 text-muted-foreground" />} />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {sideboard.map((c) => (
              <GridCard key={c.id} card={c} onClick={() => onCardClick(c.scryfall_id)} dimmed />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function GridCard({ card, onClick, dimmed }: { card: DeckCard; onClick: () => void; dimmed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative rounded-lg overflow-hidden border border-border/60 bg-card card-hover focus:outline-none focus:ring-2 focus:ring-primary transition-opacity ${dimmed ? "opacity-70" : ""}`}
    >
      <div className="aspect-[488/680] overflow-hidden bg-secondary">
        {card.image_url ? (
          <img src={card.image_url} alt={card.card_name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">{card.card_name}</div>
        )}
      </div>
      {card.quantity > 1 && (
        <div className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-xs font-bold text-primary ring-1 ring-primary/40">
          {card.quantity}
        </div>
      )}
      {card.is_commander && (
        <div className="absolute top-1.5 left-1.5">
          <Crown className="h-4 w-4 text-yellow-400 drop-shadow" />
        </div>
      )}
    </button>
  );
}

/* ── List View ───────────────────────────────────────────── */
function ListView({
  groups, sideboard, onCardClick
}: { groups: Record<string, DeckCard[]>; sideboard: DeckCard[]; onCardClick: (id: string) => void }) {
  const sections = TYPE_ORDER.filter((t) => groups[t]?.length);

  return (
    <div className="space-y-6">
      {sections.map((type) => (
        <section key={type}>
          <SectionHeader type={type} cards={groups[type]} />
          <div className="mt-2 divide-y divide-border/40 rounded-lg border border-border/60 bg-card overflow-hidden">
            {groups[type].map((c) => (
              <ListRow key={c.id} card={c} onClick={() => onCardClick(c.scryfall_id)} />
            ))}
          </div>
        </section>
      ))}
      {sideboard.length > 0 && (
        <section>
          <SectionHeader type="Sideboard" cards={sideboard} icon={<Shield className="h-4 w-4 text-muted-foreground" />} />
          <div className="mt-2 divide-y divide-border/40 rounded-lg border border-border/60 bg-card overflow-hidden">
            {sideboard.map((c) => (
              <ListRow key={c.id} card={c} onClick={() => onCardClick(c.scryfall_id)} dimmed />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ListRow({ card, onClick, dimmed }: { card: DeckCard; onClick: () => void; dimmed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 transition-colors text-left ${dimmed ? "opacity-70" : ""}`}
    >
      {card.image_url ? (
        <img src={card.image_url} alt={card.card_name} className="h-10 w-7 rounded object-cover shrink-0 ring-1 ring-border/60" />
      ) : (
        <div className="h-10 w-7 rounded bg-secondary shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {card.is_commander && <Crown className="h-3.5 w-3.5 text-yellow-400 shrink-0" />}
          <span className="font-fantasy text-sm font-semibold truncate group-hover:text-primary transition-colors">{card.card_name}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{card.type_line ?? ""}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {card.mana_cost && (
          <span className="text-xs text-muted-foreground font-mono hidden sm:block">{card.mana_cost.replace(/[{}]/g, "")}</span>
        )}
        <span className="text-sm font-bold text-primary w-5 text-right">×{card.quantity}</span>
      </div>
    </button>
  );
}

/* ── Shared ───────────────────────────────────────────────── */
function SectionHeader({ type, cards, icon }: { type: string; cards: DeckCard[]; icon?: React.ReactNode }) {
  const total = cards.reduce((s, c) => s + c.quantity, 0);
  return (
    <div className="flex items-center gap-2 mb-1">
      {icon ?? <Swords className="h-4 w-4 text-muted-foreground" />}
      <h2 className="font-fantasy text-sm font-semibold uppercase tracking-wider text-muted-foreground">{type}</h2>
      <span className="text-xs text-muted-foreground">({total})</span>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  );
}
