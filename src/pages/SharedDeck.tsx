import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, Swords, Shield, Crown, LayoutGrid, List, Download, Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { exportDeckText } from "@/lib/deckImportExport";
import CardDetailModal from "@/components/CardDetailModal";
import { cn } from "@/lib/utils";

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
  share_token: string | null;
}

const MANA_COLOR: Record<string, string> = {
  W: "bg-mana-white text-amber-900", U: "bg-mana-blue text-white",
  B: "bg-mana-black text-white",     R: "bg-mana-red text-white",
  G: "bg-mana-green text-white",
};

const FORMAT_LABELS: Record<string, string> = {
  standard:"Standard", pioneer:"Pioneer", modern:"Modern", legacy:"Legacy",
  vintage:"Vintage", commander:"Commander", pauper:"Pauper", brawl:"Brawl", casual:"Casual",
};

const TYPE_ORDER = ["Commanders","Creatures","Instants","Sorceries","Enchantments","Artifacts","Planeswalkers","Lands","Other"];

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
      : type.includes("Land") ? "Lands" : "Other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }
  Object.values(groups).forEach((g) =>
    g.sort((a, b) => (a.cmc ?? 0) - (b.cmc ?? 0) || a.card_name.localeCompare(b.card_name))
  );
  return groups;
}

export default function SharedDeck() {
  const { token } = useParams<{ token: string }>();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) return;
    load();
  }, [token]);

  const load = async () => {
    setLoading(true);
    const { data: deckData } = await supabase
      .from("decks")
      .select("*")
      .eq("share_token", token)
      .eq("is_public", true)
      .single();

    if (!deckData) { setNotFound(true); setLoading(false); return; }
    setDeck(deckData);

    const { data: cardData } = await supabase
      .from("deck_cards")
      .select("*")
      .eq("deck_id", deckData.id)
      .order("card_name");

    setCards(cardData ?? []);
    setLoading(false);
  };

  const handleExport = () => {
    if (!deck) return;
    const main = cards.filter((c) => !c.is_sideboard);
    const side = cards.filter((c) => c.is_sideboard);
    const text = exportDeckText(deck.name, main, side);
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Deck list copied!");
    setTimeout(() => setCopied(false), 2500);
  };

  const commanders = cards.filter((c) => c.is_commander);
  const mainDeck = cards.filter((c) => !c.is_sideboard && !c.is_commander);
  const sideboard = cards.filter((c) => c.is_sideboard);
  const totalMain = mainDeck.reduce((s, c) => s + c.quantity, 0) + commanders.reduce((s, c) => s + c.quantity, 0);
  const allScryfallIds = cards.map((c) => c.scryfall_id);

  const mainGroups = groupByType(mainDeck);
  if (commanders.length > 0) mainGroups["Commanders"] = commanders;

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-center px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary ring-1 ring-border">
        <Swords className="h-7 w-7 text-muted-foreground" />
      </div>
      <h1 className="font-fantasy text-2xl text-gradient-gold">Deck not found</h1>
      <p className="text-sm text-muted-foreground max-w-xs">This deck may be private or the link is no longer valid.</p>
      <Button asChild className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
        <Link to="/">Go to PhantomMTG</Link>
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Minimal nav */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img src="/logo.png" alt="PhantomMTG" className="h-7 w-auto" />
            <span className="font-fantasy text-sm text-primary hidden sm:block">PhantomMTG</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="border-border/60 h-8 text-xs">
              <Link to="/auth">Sign in to build decks <ExternalLink className="ml-1 h-3 w-3" /></Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Deck header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">Shared deck</Badge>
            </div>
            <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">{deck?.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px] uppercase border-border/60 text-muted-foreground">
                {FORMAT_LABELS[deck?.format ?? ""] ?? deck?.format}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {totalMain} cards{sideboard.length > 0 ? ` · ${sideboard.reduce((s,c)=>s+c.quantity,0)} sideboard` : ""}
              </span>
              {deck?.colors && deck.colors.length > 0 && (
                <div className="flex gap-1">
                  {deck.colors.map((c) => (
                    <span key={c} className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ring-1 ring-black/30 ${MANA_COLOR[c] ?? "bg-secondary"}`}>{c}</span>
                  ))}
                </div>
              )}
            </div>
            {deck?.description && <p className="mt-1 text-sm text-muted-foreground">{deck.description}</p>}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border/60 overflow-hidden">
              <Button size="sm" variant={view === "grid" ? "secondary" : "ghost"} className="rounded-none h-8 px-2.5" onClick={() => setView("grid")}><LayoutGrid className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} className="rounded-none h-8 px-2.5 border-l border-border/60" onClick={() => setView("list")}><List className="h-3.5 w-3.5" /></Button>
            </div>
            <Button variant="outline" size="sm" className="border-border/60 h-8" onClick={handleExport}>
              {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
              {copied ? "Copied!" : "Copy list"}
            </Button>
          </div>
        </div>

        {/* Card grid/list */}
        {cards.length === 0 ? (
          <Card className="border-dashed border-border bg-card">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Swords className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">This deck has no cards.</p>
            </CardContent>
          </Card>
        ) : view === "grid" ? (
          <GridView groups={mainGroups} sideboard={sideboard} onCardClick={setOpenId} />
        ) : (
          <ListView groups={mainGroups} sideboard={sideboard} onCardClick={setOpenId} />
        )}

        {/* CTA for non-users */}
        <Card className="border-primary/20 bg-card">
          <CardContent className="flex flex-col sm:flex-row items-center gap-4 py-6 text-center sm:text-left">
            <div className="flex-1">
              <h3 className="font-fantasy text-lg text-gradient-gold">Build your own decks</h3>
              <p className="text-sm text-muted-foreground mt-1">Track your collection, import lists, and let AI forge the perfect deck from what you own.</p>
            </div>
            <Button asChild className="shrink-0 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
              <Link to="/auth?mode=signup">Get started free</Link>
            </Button>
          </CardContent>
        </Card>
      </main>

      <CardDetailModal
        cardId={openId}
        siblingIds={allScryfallIds}
        onChangeCardId={setOpenId}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

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

function GridView({ groups, sideboard, onCardClick }: { groups: Record<string, DeckCard[]>; sideboard: DeckCard[]; onCardClick: (id: string) => void }) {
  const sections = TYPE_ORDER.filter((t) => groups[t]?.length);
  return (
    <div className="space-y-8">
      {sections.map((type) => (
        <section key={type}>
          <SectionHeader type={type} cards={groups[type]} />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {groups[type].map((c) => (
              <button key={c.id} type="button" onClick={() => onCardClick(c.scryfall_id)}
                className="group relative rounded-lg overflow-hidden border border-border/60 bg-card card-hover focus:outline-none focus:ring-2 focus:ring-primary">
                <div className="aspect-[488/680] overflow-hidden bg-secondary">
                  {c.image_url ? <img src={c.image_url} alt={c.card_name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    : <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">{c.card_name}</div>}
                </div>
                {c.quantity > 1 && <div className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-xs font-bold text-primary ring-1 ring-primary/40">{c.quantity}</div>}
                {c.is_commander && <div className="absolute top-1.5 left-1.5"><Crown className="h-4 w-4 text-yellow-400 drop-shadow" /></div>}
              </button>
            ))}
          </div>
        </section>
      ))}
      {sideboard.length > 0 && (
        <section>
          <SectionHeader type="Sideboard" cards={sideboard} icon={<Shield className="h-4 w-4 text-muted-foreground" />} />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {sideboard.map((c) => (
              <button key={c.id} type="button" onClick={() => onCardClick(c.scryfall_id)}
                className="group relative rounded-lg overflow-hidden border border-border/60 bg-card opacity-75 card-hover">
                <div className="aspect-[488/680] overflow-hidden bg-secondary">
                  {c.image_url ? <img src={c.image_url} alt={c.card_name} loading="lazy" className="h-full w-full object-cover" />
                    : <div className="flex h-full items-center justify-center p-2 text-xs text-muted-foreground">{c.card_name}</div>}
                </div>
                {c.quantity > 1 && <div className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-xs font-bold text-primary ring-1 ring-primary/40">{c.quantity}</div>}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ListView({ groups, sideboard, onCardClick }: { groups: Record<string, DeckCard[]>; sideboard: DeckCard[]; onCardClick: (id: string) => void }) {
  const sections = TYPE_ORDER.filter((t) => groups[t]?.length);
  return (
    <div className="space-y-6">
      {sections.map((type) => (
        <section key={type}>
          <SectionHeader type={type} cards={groups[type]} />
          <div className="mt-2 divide-y divide-border/40 rounded-lg border border-border/60 bg-card overflow-hidden">
            {groups[type].map((c) => (
              <button key={c.id} type="button" onClick={() => onCardClick(c.scryfall_id)}
                className="group flex w-full items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 transition-colors text-left">
                {c.image_url ? <img src={c.image_url} alt={c.card_name} className="h-10 w-7 rounded object-cover shrink-0 ring-1 ring-border/60" />
                  : <div className="h-10 w-7 rounded bg-secondary shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {c.is_commander && <Crown className="h-3.5 w-3.5 text-yellow-400 shrink-0" />}
                    <span className="font-fantasy text-sm font-semibold truncate group-hover:text-primary transition-colors">{c.card_name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{c.type_line ?? ""}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {c.mana_cost && <span className="text-xs text-muted-foreground font-mono hidden sm:block">{c.mana_cost.replace(/[{}]/g, "")}</span>}
                  <span className="text-sm font-bold text-primary w-5 text-right">×{c.quantity}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
      {sideboard.length > 0 && (
        <section>
          <SectionHeader type="Sideboard" cards={sideboard} icon={<Shield className="h-4 w-4 text-muted-foreground" />} />
          <div className="mt-2 divide-y divide-border/40 rounded-lg border border-border/60 bg-card overflow-hidden opacity-75">
            {sideboard.map((c) => (
              <button key={c.id} type="button" onClick={() => onCardClick(c.scryfall_id)}
                className="group flex w-full items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 transition-colors text-left">
                {c.image_url ? <img src={c.image_url} alt={c.card_name} className="h-10 w-7 rounded object-cover shrink-0" />
                  : <div className="h-10 w-7 rounded bg-secondary shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className="font-fantasy text-sm font-semibold truncate">{c.card_name}</span>
                  <p className="text-xs text-muted-foreground truncate">{c.type_line ?? ""}</p>
                </div>
                <span className="text-sm font-bold text-primary">×{c.quantity}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
