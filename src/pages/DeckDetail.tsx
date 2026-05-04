import { useCurrency } from "@/contexts/CurrencyContext";
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Loader2, Swords, Shield, Crown,
  LayoutGrid, List, Download, Trash2, Plus, Search, X, CheckCircle2,
  Share2, Copy, Check, Library, Sparkles, ChevronDown, ChevronUp,
  AlertTriangle, TrendingUp, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { callGeminiRaw } from "@/lib/gemini";
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
  is_public: boolean;
  share_token: string | null;
}

interface DeckAnalysis {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  curve_assessment: string;
  win_conditions: string[];
  rating: number; // 1-10
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
  const { fmtScryfall } = useCurrency();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Owned scryfall IDs for cross-reference
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());

  // Save to collection
  const [savingToCollection, setSavingToCollection] = useState(false);

  // AI analysis
  const [analysisOpen, setAnalysisOpen]   = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysis, setAnalysis]           = useState<DeckAnalysis | null>(null);

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

  const handleToggleShare = async () => {
    if (!deck) return;
    setSharingBusy(true);
    const newPublic = !deck.is_public;
    const { error } = await supabase
      .from("decks")
      .update({ is_public: newPublic })
      .eq("id", deck.id);
    if (error) { toast.error(error.message); setSharingBusy(false); return; }
    setDeck((d) => d ? { ...d, is_public: newPublic } : d);
    toast.success(newPublic ? "Deck is now public — anyone with the link can view it" : "Deck is now private");
    setSharingBusy(false);
    if (newPublic && deck.share_token) handleCopyLink(deck.share_token);
  };

  const handleCopyLink = (token?: string) => {
    const t = token ?? deck?.share_token;
    if (!t) return;
    const url = `${window.location.origin}/share/${t}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    toast.success("Share link copied!");
    setTimeout(() => setLinkCopied(false), 2500);
  };

  const handleDelete = async () => {
    if (!deck) return;
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

  const saveToCollection = async (storageType: "vault" | "arcane") => {
    if (!user || cards.length === 0) return;
    setSavingToCollection(true);
    let added = 0, updated = 0;
    try {
      for (const card of cards) {
        if (!card.scryfall_id || card.scryfall_id === "unknown") continue;
        const { data: existing } = await supabase
          .from("collection_cards")
          .select("id, quantity")
          .eq("user_id", user.id)
          .eq("scryfall_id", card.scryfall_id)
          .eq("storage_type", storageType)
          .maybeSingle();

        if (existing) {
          await supabase.from("collection_cards")
            .update({ quantity: existing.quantity + card.quantity })
            .eq("id", existing.id);
          updated++;
        } else {
          await supabase.from("collection_cards").insert({
            user_id: user.id,
            scryfall_id: card.scryfall_id,
            card_name: card.card_name,
            set_code: card.set_code ?? null,
            collector_number: card.collector_number ?? null,
            mana_cost: card.mana_cost ?? null,
            type_line: card.type_line ?? null,
            colors: card.colors ?? [],
            cmc: card.cmc ?? null,
            image_url: card.image_url ?? null,
            quantity: card.quantity,
            storage_type: storageType,
          });
          added++;
        }
      }
      const { data: colData } = await supabase.from("collection_cards").select("scryfall_id");
      setOwnedIds(new Set((colData ?? []).map((c) => c.scryfall_id)));
      const label = storageType === "vault" ? "🗃️ Vault" : "✨ Arcane Collection";
      toast.success(`Saved to ${label} — ${added} new, ${updated} updated`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingToCollection(false);
    }
  };

  const analyzeWithAI = async () => {
    if (!deck || cards.length === 0) return;
    setAnalysisOpen(true);
    if (analysis) return; // cached
    setAnalysisLoading(true);
    try {
      const cardList = cards
        .map((c) => `${c.quantity}x ${c.card_name}${c.is_commander ? " [Commander]" : c.is_sideboard ? " [Sideboard]" : ""}`)
        .join("\n");

      const prompt = `You are an expert Magic: The Gathering deck analyst. Analyse this ${deck.format} deck called "${deck.name}".

Deck list:
${cardList}

Return ONLY valid JSON (no markdown, no code fences):
{
  "summary": "2-3 sentence overview of what this deck tries to do",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "suggestions": ["specific card to add or swap with reason", "another suggestion", "another suggestion"],
  "curve_assessment": "1-2 sentences about the mana curve quality",
  "win_conditions": ["win condition 1", "win condition 2"],
  "rating": 7
}`;

      const raw = await callGeminiRaw(prompt, 800);
      const parsed = JSON.parse(raw) as DeckAnalysis;
      setAnalysis(parsed);
    } catch (e) {
      toast.error("AI analysis failed: " + (e as Error).message);
      setAnalysisOpen(false);
    } finally {
      setAnalysisLoading(false);
    }
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

          {/* Save to Collection — Vault or Arcane */}
          <div className="relative flex h-8">
            <Button
              variant="outline" size="sm"
              className="h-8 rounded-r-none border-r-0 border-mana-green/40 text-mana-green hover:bg-mana-green/10 gap-1.5 pr-2.5"
              onClick={() => saveToCollection("vault")}
              disabled={savingToCollection || cards.length === 0}
              title="Save to Vault (physical cards)"
            >
              {savingToCollection ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Library className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline text-xs">Vault</span>
            </Button>
            <Button
              variant="outline" size="sm"
              className="h-8 rounded-l-none border-mana-green/40 text-mana-green hover:bg-mana-green/10 gap-1 px-2"
              onClick={() => saveToCollection("arcane")}
              disabled={savingToCollection || cards.length === 0}
              title="Save to Arcane Collection (digital/Arena)"
            >
              <Sparkles className="h-3 w-3" />
              <span className="hidden sm:inline text-xs">Arcane</span>
            </Button>
          </div>

          {/* AI Analyse */}
          <Button
            variant="outline" size="sm"
            className="h-8 border-primary/40 text-primary hover:bg-primary/10 gap-1.5"
            onClick={analyzeWithAI}
            disabled={cards.length === 0}
            title="AI deck analysis"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Analyse</span>
          </Button>

          {/* Share toggle */}
          <Button
            variant={deck?.is_public ? "default" : "outline"}
            size="sm"
            className={`h-8 gap-1.5 ${deck?.is_public ? "bg-primary/20 text-primary border-primary/40 hover:bg-primary/30" : "border-border/60"}`}
            onClick={handleToggleShare}
            disabled={sharingBusy}
          >
            {sharingBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{deck?.is_public ? "Shared" : "Share"}</span>
          </Button>

          {/* Copy link — only shown when public */}
          {deck?.is_public && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => handleCopyLink()}
            >
              {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          )}

          <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteConfirmOpen(true)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
                  {fmtScryfall(card.prices) && <span className="text-xs text-mana-green">{fmtScryfall(card.prices)}</span>}
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

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={`Delete "${deck?.name}"?`}
        description="This will permanently remove the deck and all its cards. This cannot be undone."
        confirmLabel="Delete deck"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <CardDetailModal cardId={openId} siblingIds={allScryfallIds} onChangeCardId={setOpenId} onClose={() => setOpenId(null)} />

      {/* AI Deck Analysis Dialog */}
      <Dialog open={analysisOpen} onOpenChange={(o) => { setAnalysisOpen(o); if (!o) setAnalysis(null); }}>
        <DialogContent className="max-w-lg border-border bg-card max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-fantasy text-xl text-gradient-gold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> AI Deck Analysis
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {deck?.name} · {deck?.format}
            </DialogDescription>
          </DialogHeader>

          {analysisLoading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Consulting the arcane archives…</p>
            </div>
          )}

          {analysis && !analysisLoading && (
            <div className="space-y-5 pt-2">
              {/* Rating */}
              <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-primary/40 bg-card">
                  <span className="font-fantasy text-2xl font-bold text-primary">{analysis.rating}</span>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Deck Rating</p>
                  <div className="mt-1 h-2 w-32 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-glow transition-all" style={{ width: `${analysis.rating * 10}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{analysis.rating}/10</p>
                </div>
                <p className="flex-1 text-sm text-foreground leading-relaxed">{analysis.summary}</p>
              </div>

              {/* Win conditions */}
              {analysis.win_conditions?.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground mb-2"><Zap className="h-3.5 w-3.5 text-primary" /> Win Conditions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.win_conditions.map((w, i) => (
                      <Badge key={i} variant="outline" className="border-primary/30 text-primary text-[11px]">{w}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Curve */}
              <div className="rounded-lg border border-border/50 bg-secondary/20 p-3">
                <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground mb-1.5"><TrendingUp className="h-3.5 w-3.5" /> Mana Curve</p>
                <p className="text-sm text-foreground leading-relaxed">{analysis.curve_assessment}</p>
              </div>

              {/* Strengths */}
              <div>
                <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground mb-2 text-mana-green"><CheckCircle2 className="h-3.5 w-3.5" /> Strengths</p>
                <ul className="space-y-1.5">
                  {analysis.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-mana-green shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Weaknesses */}
              <div>
                <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground mb-2 text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Weaknesses</p>
                <ul className="space-y-1.5">
                  {analysis.weaknesses.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Suggestions */}
              <div>
                <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground mb-2 text-primary"><Sparkles className="h-3.5 w-3.5" /> AI Suggestions</p>
                <ul className="space-y-2">
                  {analysis.suggestions.map((s, i) => (
                    <li key={i} className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-sm leading-relaxed">{s}</li>
                  ))}
                </ul>
              </div>

              <Button
                variant="outline"
                className="w-full border-border/60"
                onClick={() => { setAnalysis(null); analyzeWithAI(); }}
              >
                <Sparkles className="mr-1.5 h-4 w-4" /> Re-analyse
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
