import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Loader2, Swords, Shield, Crown,
  LayoutGrid, List, Download, Trash2, Plus, Search, X, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import CardDetailModal from "@/components/CardDetailModal";
import { exportDeckText } from "@/lib/deckImportExport";
import { searchCards, getCardImage, type ScryfallCard } from "@/lib/scryfall";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

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
  W: "bg-mana-white text-amber-900", U: "bg-mana-blue text-white",
  B: "bg-mana-black text-white",     R: "bg-mana-red text-white",
  G: "bg-mana-green text-white",
};
const MANA_HEX: Record<string, string> = { W:"#f8e7a0", U:"#4a9de0", B:"#6b3fa0", R:"#e05535", G:"#3a9c5e" };
const FORMAT_LABELS: Record<string, string> = {
  standard:"Standard", pioneer:"Pioneer", modern:"Modern", legacy:"Legacy",
  vintage:"Vintage", commander:"Commander", pauper:"Pauper", brawl:"Brawl", casual:"Casual",
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
      : type.includes("Land") ? "Lands" : "Other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }
  Object.values(groups).forEach((g) =>
    g.sort((a, b) => (a.cmc ?? 0) - (b.cmc ?? 0) || a.card_name.localeCompare(b.card_name))
  );
  return groups;
}

const TYPE_ORDER = ["Commanders","Creatures","Instants","Sorceries","Enchantments","Artifacts","Planeswalkers","Lands","Other"];

export default function DeckDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [openId, setOpenId] = useState<string | null>(null);

  // Owned scryfall IDs for cross-reference
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());

  // Add card search
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<ScryfallCard[]>([]);
  const [addBusy, setAddBusy] = useState(false);
  const [addingCard, setAddingCard] = useState<string | null>(null);
  const addTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { if (user && id) load(); }, [user, id]);

  const load = async () => {
    setLoading(true);
    const [{ data: deckData }, { data: cardData }, { data: collectionData }] = await Promise.all([
      supabase.from("decks").select("*").eq("id", id!).single(),
      supabase.from("deck_cards").select("*").eq("deck_id", id!).order("card_name"),
      supabase.from("collection_cards").select("scryfall_id"),
    ]);
    if (!deckData) { navigate("/app/decks"); return; }
    setDeck(deckData);
    setCards(cardData ?? []);
    setOwnedIds(new Set((collectionData ?? []).map((c) => c.scryfall_id)));
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

  const updateQty = async (cardId: string, delta: number) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const next = card.quantity + delta;
    if (next <= 0) {
      setCards((prev) => prev.filter((c) => c.id !== cardId));
      await supabase.from("deck_cards").delete().eq("id", cardId);
      return;
    }
    setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, quantity: next } : c));
    await supabase.from("deck_cards").update({ quantity: next }).eq("id", cardId);
  };

  const removeCard = async (cardId: string) => {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    await supabase.from("deck_cards").delete().eq("id", cardId);
  };

  const onAddQueryChange = (val: string) => {
    setAddQuery(val);
    clearTimeout(addTimer.current);
    if (!val.trim()) { setAddResults([]); return; }
    addTimer.current = setTimeout(async () => {
      setAddBusy(true);
      try {
        const { data } = await searchCards(val);
        setAddResults(data.slice(0, 6));
      } catch { /* ignore */ }
      setAddBusy(false);
    }, 300);
  };

  const addCardToDeck = async (card: ScryfallCard) => {
    if (!id) return;
    setAddingCard(card.id);
    const existing = cards.find((c) => c.scryfall_id === card.id && !c.is_sideboard);
    if (existing) {
      await updateQty(existing.id, 1);
      setAddingCard(null);
      return;
    }
    const insert = {
      deck_id: id,
      scryfall_id: card.id,
      card_name: card.name,
      image_url: getCardImage(card),
      mana_cost: card.mana_cost ?? null,
      cmc: card.cmc ?? null,
      type_line: card.type_line ?? null,
      colors: card.colors ?? [],
      quantity: 1,
      is_commander: false,
      is_sideboard: false,
    };
    const { data, error } = await supabase.from("deck_cards").insert(insert).select().single();
    if (error) { toast.error(error.message); }
    else { setCards((prev) => [...prev, data as DeckCard]); toast.success(`Added ${card.name}`); }
    setAddingCard(null);
  };

  const commanders = cards.filter((c) => c.is_commander);
  const mainDeck   = cards.filter((c) => !c.is_sideboard && !c.is_commander);
  const sideboard  = cards.filter((c) => c.is_sideboard);
  const totalMain  = mainDeck.reduce((s, c) => s + c.quantity, 0) + commanders.reduce((s, c) => s + c.quantity, 0);
  const allScryfallIds = cards.map((c) => c.scryfall_id);
  const mainGroups = groupByType(mainDeck);
  if (commanders.length > 0) mainGroups["Commanders"] = commanders;

  // Stats
  const cmcBuckets = (() => {
    const b: Record<string, number> = {};
    mainDeck.forEach((c) => {
      const k = c.cmc == null ? "?" : c.cmc >= 7 ? "7+" : String(Math.floor(c.cmc));
      b[k] = (b[k] ?? 0) + c.quantity;
    });
    return ["0","1","2","3","4","5","6","7+","?"].filter((k) => b[k]).map((k) => ({ cmc: k, count: b[k] }));
  })();

  const colorData = (() => {
    const t: Record<string, number> = {};
    mainDeck.forEach((c) => (c.colors ?? []).forEach((col) => { t[col] = (t[col] ?? 0) + c.quantity; }));
    return Object.entries(t).map(([name, value]) => ({ name, value, fill: MANA_HEX[name] ?? "#888" }));
  })();

  if (loading) return (
    <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading deck…
    </div>
  );
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
              <span className="text-sm text-muted-foreground">
                {totalMain} cards{sideboard.length > 0 ? ` · ${sideboard.reduce((s,c)=>s+c.quantity,0)} sideboard` : ""}
              </span>
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
            <Button size="sm" variant={view === "grid" ? "secondary" : "ghost"} className="rounded-none h-8 px-2.5" onClick={() => setView("grid")}><LayoutGrid className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} className="rounded-none h-8 px-2.5 border-l border-border/60" onClick={() => setView("list")}><List className="h-3.5 w-3.5" /></Button>
          </div>
          <Button variant="outline" size="sm" className="border-border/60 h-8" onClick={handleExport}><Download className="mr-1.5 h-3.5 w-3.5" /> Export</Button>
          <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-destructive" onClick={handleDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* Stats row */}
      {cards.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Mana curve</p>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={cmcBuckets} margin={{ top:0, right:0, bottom:0, left:0 }}>
                <XAxis dataKey="cmc" tick={{ fontSize:10, fill:"hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:6, fontSize:11 }} cursor={{ fill:"hsl(var(--primary)/0.08)" }} />
                <Bar dataKey="count" radius={[3,3,0,0]} fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card className="border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Color pie</p>
            {colorData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={80} height={80}>
                  <PieChart>
                    <Pie data={colorData} dataKey="value" cx="50%" cy="50%" outerRadius={36} innerRadius={16}>
                      {colorData.map((e) => <Cell key={e.name} fill={e.fill} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:6, fontSize:11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1">
                  {colorData.map((e) => (
                    <div key={e.name} className="flex items-center gap-1.5 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: e.fill }} />
                      <span className="text-muted-foreground">{e.name}</span>
                      <span className="font-semibold">{e.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-xs text-muted-foreground">No color data</p>}
          </Card>
        </div>
      )}

      {/* Add card search */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5">
          {addBusy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" /> : <Search className="h-4 w-4 text-muted-foreground shrink-0" />}
          <Input
            value={addQuery}
            onChange={(e) => onAddQueryChange(e.target.value)}
            placeholder="Add a card to this deck…"
            className="border-0 bg-transparent p-0 h-auto text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {addQuery && (
            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => { setAddQuery(""); setAddResults([]); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {addResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-border bg-card shadow-[var(--shadow-elevated)] overflow-hidden">
            {addResults.map((card) => (
              <div key={card.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 transition-colors">
                {card.image_uris?.small && (
                  <img src={card.image_uris.small} alt={card.name} className="h-9 w-6 rounded object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-fantasy text-sm font-semibold truncate">{card.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{card.type_line}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {ownedIds.has(card.id) && <CheckCircle2 className="h-3.5 w-3.5 text-mana-green" title="In collection" />}
                  {card.prices?.usd && <span className="text-xs text-mana-green">${card.prices.usd}</span>}
                  <Button size="sm" className="h-7 text-xs bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90" disabled={addingCard === card.id} onClick={() => addCardToDeck(card)}>
                    {addingCard === card.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Plus className="h-3 w-3 mr-1" /> Add</>}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deck cards */}
      {cards.length === 0 ? (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Swords className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No cards yet. Use the search above to add some.</p>
          </CardContent>
        </Card>
      ) : view === "grid" ? (
        <GridView groups={mainGroups} sideboard={sideboard} onCardClick={setOpenId} ownedIds={ownedIds} onQtyChange={updateQty} onRemove={removeCard} />
      ) : (
        <ListView groups={mainGroups} sideboard={sideboard} onCardClick={setOpenId} ownedIds={ownedIds} onQtyChange={updateQty} onRemove={removeCard} />
      )}

      <CardDetailModal cardId={openId} siblingIds={allScryfallIds} onChangeCardId={setOpenId} onClose={() => setOpenId(null)} />
    </div>
  );
}

type ViewProps = { groups: Record<string, DeckCard[]>; sideboard: DeckCard[]; onCardClick: (id: string) => void; ownedIds: Set<string>; onQtyChange: (id: string, delta: number) => void; onRemove: (id: string) => void; };

function GridView({ groups, sideboard, onCardClick, ownedIds, onQtyChange, onRemove }: ViewProps) {
  const sections = TYPE_ORDER.filter((t) => groups[t]?.length);
  return (
    <div className="space-y-8">
      {sections.map((type) => (
        <section key={type}>
          <SectionHeader type={type} cards={groups[type]} />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {groups[type].map((c) => (
              <div key={c.id} className="group relative rounded-lg overflow-hidden border border-border/60 bg-card card-hover">
                <button type="button" onClick={() => onCardClick(c.scryfall_id)} className="block w-full aspect-[488/680] overflow-hidden bg-secondary focus:outline-none">
                  {c.image_url ? (
                    <img src={c.image_url} alt={c.card_name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">{c.card_name}</div>
                  )}
                </button>
                {c.quantity > 1 && <div className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-xs font-bold text-primary ring-1 ring-primary/40">{c.quantity}</div>}
                {c.is_commander && <div className="absolute top-1.5 left-1.5"><Crown className="h-4 w-4 text-yellow-400 drop-shadow" /></div>}
                {ownedIds.has(c.scryfall_id) && <div className="absolute bottom-1.5 right-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-mana-green drop-shadow" /></div>}
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-background/80 backdrop-blur-sm px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex gap-0.5">
                    <button onClick={() => onQtyChange(c.id, -1)} className="h-5 w-5 rounded text-xs hover:bg-secondary/80 flex items-center justify-center">−</button>
                    <button onClick={() => onQtyChange(c.id, 1)} className="h-5 w-5 rounded text-xs hover:bg-secondary/80 flex items-center justify-center">+</button>
                  </div>
                  <button onClick={() => onRemove(c.id)} className="h-5 w-5 rounded text-xs text-muted-foreground hover:text-destructive flex items-center justify-center"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {sideboard.length > 0 && (
        <section>
          <SectionHeader type="Sideboard" cards={sideboard} icon={<Shield className="h-4 w-4 text-muted-foreground" />} />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 opacity-70">
            {sideboard.map((c) => (
              <button key={c.id} type="button" onClick={() => onCardClick(c.scryfall_id)} className="group relative rounded-lg overflow-hidden border border-border/60 bg-card card-hover focus:outline-none">
                <div className="aspect-[488/680] overflow-hidden bg-secondary">
                  {c.image_url ? <img src={c.image_url} alt={c.card_name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">{c.card_name}</div>}
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

function ListView({ groups, sideboard, onCardClick, ownedIds, onQtyChange, onRemove }: ViewProps) {
  const sections = TYPE_ORDER.filter((t) => groups[t]?.length);
  return (
    <div className="space-y-6">
      {sections.map((type) => (
        <section key={type}>
          <SectionHeader type={type} cards={groups[type]} />
          <div className="mt-2 divide-y divide-border/40 rounded-lg border border-border/60 bg-card overflow-hidden">
            {groups[type].map((c) => (
              <div key={c.id} className="group flex w-full items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 transition-colors">
                <button type="button" onClick={() => onCardClick(c.scryfall_id)} className="focus:outline-none shrink-0">
                  {c.image_url ? <img src={c.image_url} alt={c.card_name} className="h-10 w-7 rounded object-cover ring-1 ring-border/60" /> : <div className="h-10 w-7 rounded bg-secondary shrink-0" />}
                </button>
                <button type="button" onClick={() => onCardClick(c.scryfall_id)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5">
                    {c.is_commander && <Crown className="h-3.5 w-3.5 text-yellow-400 shrink-0" />}
                    {ownedIds.has(c.scryfall_id) && <CheckCircle2 className="h-3.5 w-3.5 text-mana-green shrink-0" />}
                    <span className="font-fantasy text-sm font-semibold truncate hover:text-primary transition-colors">{c.card_name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{c.type_line ?? ""}</p>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  {c.mana_cost && <span className="text-xs text-muted-foreground font-mono hidden sm:block">{c.mana_cost.replace(/[{}]/g, "")}</span>}
                  <div className="flex items-center gap-0.5 rounded border border-border bg-secondary/50">
                    <button onClick={() => onQtyChange(c.id, -1)} className="h-6 w-6 text-xs hover:bg-secondary/80 rounded-l flex items-center justify-center">−</button>
                    <span className="min-w-[1.5rem] text-center text-xs font-bold">×{c.quantity}</span>
                    <button onClick={() => onQtyChange(c.id, 1)} className="h-6 w-6 text-xs hover:bg-secondary/80 rounded-r flex items-center justify-center">+</button>
                  </div>
                  <button onClick={() => onRemove(c.id)} className="h-7 w-7 rounded text-muted-foreground hover:text-destructive flex items-center justify-center"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {sideboard.length > 0 && (
        <section>
          <SectionHeader type="Sideboard" cards={sideboard} icon={<Shield className="h-4 w-4 text-muted-foreground" />} />
          <div className="mt-2 divide-y divide-border/40 rounded-lg border border-border/60 bg-card overflow-hidden opacity-70">
            {sideboard.map((c) => (
              <button key={c.id} type="button" onClick={() => onCardClick(c.scryfall_id)} className="group flex w-full items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 transition-colors text-left">
                {c.image_url ? <img src={c.image_url} alt={c.card_name} className="h-10 w-7 rounded object-cover ring-1 ring-border/60 shrink-0" /> : <div className="h-10 w-7 rounded bg-secondary shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className="font-fantasy text-sm font-semibold truncate">{c.card_name}</span>
                  <p className="text-xs text-muted-foreground truncate">{c.type_line ?? ""}</p>
                </div>
                <span className="text-sm font-bold text-primary shrink-0">×{c.quantity}</span>
              </button>
            ))}
          </div>
        </section>
      )}
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
