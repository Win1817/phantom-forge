import { useEffect, useState, useMemo } from "react";
import {
  Trash2, Minus, Plus, Library, LayoutGrid, List,
  SlidersHorizontal, X, ArrowUpDown, CheckSquare, Square, Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import CardDetailModal from "@/components/CardDetailModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { cn } from "@/lib/utils";

interface CollectionCard {
  id: string;
  scryfall_id: string;
  card_name: string;
  set_name: string | null;
  rarity: string | null;
  image_url: string | null;
  quantity: number;
  price_usd: number | null;
  foil: boolean;
  colors: string[] | null;
  type_line: string | null;
  cmc: number | null;
}

const RARITY_CLASS: Record<string, string> = {
  common: "border-rarity-common/40 text-rarity-common",
  uncommon: "border-rarity-uncommon/50 text-rarity-uncommon",
  rare: "border-rarity-rare/60 text-rarity-rare",
  mythic: "border-rarity-mythic/60 text-rarity-mythic",
};

const MANA_COLORS = [
  { code: "W", label: "White", bg: "bg-mana-white", text: "text-amber-900" },
  { code: "U", label: "Blue",  bg: "bg-mana-blue",  text: "text-white" },
  { code: "B", label: "Black", bg: "bg-mana-black", text: "text-white" },
  { code: "R", label: "Red",   bg: "bg-mana-red",   text: "text-white" },
  { code: "G", label: "Green", bg: "bg-mana-green", text: "text-white" },
];
const MANA_HEX: Record<string, string> = { W:"#f8e7a0", U:"#4a9de0", B:"#6b3fa0", R:"#e05535", G:"#3a9c5e" };
const RARITIES = ["common", "uncommon", "rare", "mythic"];
const SORT_OPTIONS = [
  { value: "added",    label: "Recently added" },
  { value: "name",     label: "Name A–Z" },
  { value: "cmc",      label: "Mana cost" },
  { value: "price",    label: "Price" },
  { value: "quantity", label: "Quantity" },
];

type SortKey = "added" | "name" | "cmc" | "price" | "quantity";
type ViewMode = "grid" | "list";

export default function Collection() {
  const { user } = useAuth();
  const [cards, setCards]       = useState<CollectionCard[]>([]);
  const [filter, setFilter]     = useState("");
  const [loading, setLoading]   = useState(true);
  const [openId, setOpenId]     = useState<string | null>(null);
  const [view, setView]         = useState<ViewMode>("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [showStats, setShowStats]     = useState(false);

  // Filters
  const [colorFilter, setColorFilter]   = useState<string[]>([]);
  const [rarityFilter, setRarityFilter] = useState<string[]>([]);
  const [foilFilter, setFoilFilter]     = useState<boolean | null>(null);
  const [cmcMin, setCmcMin]             = useState<string>("");
  const [cmcMax, setCmcMax]             = useState<string>("");
  const [sortKey, setSortKey]           = useState<SortKey>("added");

  // Bulk select
  const [selectMode, setSelectMode]   = useState(false);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);

  useEffect(() => { if (user) load(); }, [user]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("collection_cards")
      .select("id, scryfall_id, card_name, set_name, rarity, image_url, quantity, price_usd, foil, colors, type_line, cmc")
      .order("created_at", { ascending: false });
    setCards(data ?? []);
    setLoading(false);
  };

  const updateQty = async (id: string, delta: number) => {
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const next = Math.max(0, card.quantity + delta);
    if (next === 0) return remove(id);
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, quantity: next } : c)));
    await supabase.from("collection_cards").update({ quantity: next }).eq("id", id);
  };

  const remove = async (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    const { error } = await supabase.from("collection_cards").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  // ── Bulk select helpers ───────────────────────────────────────────────────
  const toggleSelectMode = () => {
    setSelectMode((v) => !v);
    setSelected(new Set());
  };

  const toggleCard = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(filtered.map((c) => c.id)));
  };

  const clearSelection = () => setSelected(new Set());

  const bulkDelete = async () => {
    setBulkDeleting(true);
    const ids = [...selected];
    // Delete in one round-trip using .in()
    const { error } = await supabase
      .from("collection_cards")
      .delete()
      .in("id", ids);
    if (error) {
      toast.error(error.message);
    } else {
      setCards((prev) => prev.filter((c) => !ids.includes(c.id)));
      toast.success(`Removed ${ids.length} card${ids.length !== 1 ? "s" : ""} from your collection`);
      setSelected(new Set());
      setSelectMode(false);
    }
    setBulkDeleting(false);
    setConfirmBulkOpen(false);
  };

  const toggleColor   = (c: string) => setColorFilter((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);
  const toggleRarity  = (r: string) => setRarityFilter((p) => p.includes(r) ? p.filter((x) => x !== r) : [...p, r]);

  const activeFilterCount = colorFilter.length + rarityFilter.length +
    (foilFilter !== null ? 1 : 0) + (cmcMin ? 1 : 0) + (cmcMax ? 1 : 0);

  const filtered = useMemo(() => {
    let list = cards.filter((c) => {
      if (filter && !c.card_name.toLowerCase().includes(filter.toLowerCase())) return false;
      if (colorFilter.length && !colorFilter.some((col) => c.colors?.includes(col))) return false;
      if (rarityFilter.length && !rarityFilter.includes(c.rarity ?? "")) return false;
      if (foilFilter !== null && c.foil !== foilFilter) return false;
      if (cmcMin && (c.cmc ?? 0) < Number(cmcMin)) return false;
      if (cmcMax && (c.cmc ?? 0) > Number(cmcMax)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "name":     return a.card_name.localeCompare(b.card_name);
        case "cmc":      return (a.cmc ?? 0) - (b.cmc ?? 0);
        case "price":    return (b.price_usd ?? 0) - (a.price_usd ?? 0);
        case "quantity": return b.quantity - a.quantity;
        default:         return 0;
      }
    });
    return list;
  }, [cards, filter, colorFilter, rarityFilter, foilFilter, cmcMin, cmcMax, sortKey]);

  const totalCards = cards.reduce((s, c) => s + c.quantity, 0);
  const totalValue = cards.reduce((s, c) => s + Number(c.price_usd ?? 0) * c.quantity, 0);

  const selectedValue = [...selected].reduce((s, id) => {
    const c = cards.find((x) => x.id === id);
    return s + Number(c?.price_usd ?? 0) * (c?.quantity ?? 1);
  }, 0);

  // Stats
  const cmcBuckets = useMemo(() => {
    const b: Record<string, number> = {};
    cards.forEach((c) => {
      const key = c.cmc == null ? "?" : c.cmc >= 7 ? "7+" : String(Math.floor(c.cmc));
      b[key] = (b[key] ?? 0) + c.quantity;
    });
    return ["0","1","2","3","4","5","6","7+","?"].filter((k) => b[k]).map((k) => ({ cmc: k, count: b[k] }));
  }, [cards]);

  const colorData = useMemo(() => {
    const t: Record<string, number> = {};
    cards.forEach((c) => (c.colors ?? []).forEach((col) => { t[col] = (t[col] ?? 0) + c.quantity; }));
    return Object.entries(t).map(([name, value]) => ({ name, value, fill: MANA_HEX[name] ?? "#888" }));
  }, [cards]);

  const rarityData = useMemo(() => {
    const t: Record<string, number> = {};
    cards.forEach((c) => { t[c.rarity ?? "unknown"] = (t[c.rarity ?? "unknown"] ?? 0) + c.quantity; });
    return Object.entries(t).map(([r, v]) => ({ rarity: r, count: v }));
  }, [cards]);

  const clearFilters = () => {
    setColorFilter([]); setRarityFilter([]); setFoilFilter(null); setCmcMin(""); setCmcMax(""); setFilter("");
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">Your Grimoire</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalCards.toLocaleString()} cards · ${totalValue.toFixed(2)} est. value · {cards.length} unique
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-border/60" onClick={() => setShowStats((v) => !v)}>
            {showStats ? "Hide stats" : "Show stats"}
          </Button>
          <Button
            variant={selectMode ? "secondary" : "outline"}
            size="sm"
            className={cn("border-border/60 gap-1.5", selectMode && "border-primary/50 text-primary")}
            onClick={toggleSelectMode}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {selectMode ? "Cancel" : "Select"}
          </Button>
          <Button asChild className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
            <Link to="/app/search"><Plus className="mr-1.5 h-4 w-4" /> Add cards</Link>
          </Button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-arcane px-4 py-3 animate-fade-in">
          <button
            onClick={allFilteredSelected ? clearSelection : selectAll}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {allFilteredSelected
              ? <CheckSquare className="h-4 w-4 text-primary" />
              : <Square className="h-4 w-4" />}
            {allFilteredSelected ? "Deselect all" : `Select all (${filtered.length})`}
          </button>

          <div className="h-4 w-px bg-border/60" />

          <span className="text-sm font-medium">
            {selected.size > 0
              ? <>{selected.size} selected · <span className="text-mana-green">${selectedValue.toFixed(2)}</span></>
              : <span className="text-muted-foreground">Tap cards to select</span>}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {selected.size > 0 && (
              <Button
                size="sm"
                className="h-8 bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-1.5"
                disabled={bulkDeleting}
                onClick={() => setConfirmBulkOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete {selected.size}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Stats panel */}
      {showStats && cards.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3 animate-fade-in">
          <Card className="border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Mana curve</p>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={cmcBuckets} margin={{ top:0, right:0, bottom:0, left:0 }}>
                <XAxis dataKey="cmc" tick={{ fontSize:10, fill:"hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:6, fontSize:11 }} cursor={{ fill:"hsl(var(--primary)/0.08)" }} />
                <Bar dataKey="count" radius={[3,3,0,0]} fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card className="border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Color distribution</p>
            {colorData.length > 0 ? (
              <ResponsiveContainer width="100%" height={100}>
                <PieChart>
                  <Pie data={colorData} dataKey="value" cx="50%" cy="50%" outerRadius={42} innerRadius={20}>
                    {colorData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:6, fontSize:11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-muted-foreground">No color data</p>}
          </Card>
          <Card className="border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Rarity breakdown</p>
            <div className="space-y-2">
              {RARITIES.filter((r) => rarityData.find((d) => d.rarity === r)).map((r) => {
                const d = rarityData.find((x) => x.rarity === r);
                const pct = d ? Math.round((d.count / totalCards) * 100) : 0;
                return (
                  <div key={r} className="flex items-center gap-2 text-xs">
                    <span className={`w-16 capitalize ${RARITY_CLASS[r]?.split(" ")[1] ?? ""}`}>{r}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-right text-muted-foreground">{d?.count ?? 0}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Search + controls row */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name…"
          className="h-9 w-56 text-sm"
        />
        <Button
          variant="outline"
          size="sm"
          className={cn("border-border/60 gap-1.5", activeFilterCount > 0 && "border-primary/50 text-primary")}
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && <span className="ml-0.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold">{activeFilterCount}</span>}
        </Button>

        <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-transparent border-none text-xs text-muted-foreground focus:outline-none cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="flex rounded-md border border-border/60 overflow-hidden">
          <Button size="sm" variant={view === "grid" ? "secondary" : "ghost"} className="rounded-none h-8 px-2.5" onClick={() => setView("grid")}>
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} className="rounded-none h-8 px-2.5 border-l border-border/60" onClick={() => setView("list")}>
            <List className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Filters</p>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={clearFilters}>
                <X className="h-3 w-3 mr-1" /> Clear all
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Color</p>
              <div className="flex gap-1.5">
                {MANA_COLORS.map((c) => (
                  <button key={c.code} onClick={() => toggleColor(c.code)} title={c.label}
                    className={cn("h-7 w-7 rounded-full text-[11px] font-bold ring-2 transition-all", c.bg, c.text,
                      colorFilter.includes(c.code) ? "ring-primary scale-110" : "ring-transparent opacity-50 hover:opacity-80"
                    )}>{c.code}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Rarity</p>
              <div className="flex gap-1">
                {RARITIES.map((r) => (
                  <button key={r} onClick={() => toggleRarity(r)}
                    className={cn("px-2.5 py-1 rounded text-[10px] uppercase font-medium border transition-all",
                      rarityFilter.includes(r) ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/30"
                    )}>{r}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Foil</p>
              <div className="flex gap-1">
                {([null, true, false] as const).map((v) => (
                  <button key={String(v)} onClick={() => setFoilFilter(v)}
                    className={cn("px-2.5 py-1 rounded text-[10px] uppercase font-medium border transition-all",
                      foilFilter === v ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/30"
                    )}>{v === null ? "All" : v ? "Foil" : "Non-foil"}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Mana cost (CMC)</p>
              <div className="flex items-center gap-1.5">
                <Input value={cmcMin} onChange={(e) => setCmcMin(e.target.value)} placeholder="Min" className="h-7 w-14 text-xs" type="number" min={0} />
                <span className="text-muted-foreground text-xs">–</span>
                <Input value={cmcMax} onChange={(e) => setCmcMax(e.target.value)} placeholder="Max" className="h-7 w-14 text-xs" type="number" min={0} />
              </div>
            </div>
          </div>
        </div>
      )}

      {(filter || activeFilterCount > 0) && !loading && (
        <p className="text-xs text-muted-foreground">Showing {filtered.length.toLocaleString()} of {cards.length.toLocaleString()} cards</p>
      )}

      {/* Content */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading collection…</p>
      ) : cards.length === 0 ? (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-arcane ring-1 ring-primary/30">
              <Library className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-fantasy text-lg">An empty grimoire</h3>
            <p className="max-w-sm text-sm text-muted-foreground">Search the multiverse and start adding cards.</p>
            <Button asChild className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
              <Link to="/app/search">Find your first card</Link>
            </Button>
          </CardContent>
        </Card>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((c) => {
            const isSelected = selected.has(c.id);
            return (
              <Card
                key={c.id}
                className={cn(
                  "group overflow-hidden border-border bg-card card-hover relative",
                  isSelected && "ring-2 ring-primary shadow-[0_0_16px_hsl(var(--primary)/0.4)]"
                )}
              >
                {/* Select overlay / checkbox */}
                {selectMode && (
                  <button
                    type="button"
                    onClick={() => toggleCard(c.id)}
                    className="absolute top-2 left-2 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-background/80 backdrop-blur-sm ring-1 ring-border transition-all hover:ring-primary"
                    aria-label={isSelected ? "Deselect" : "Select"}
                  >
                    {isSelected
                      ? <CheckSquare className="h-4 w-4 text-primary" />
                      : <Square className="h-4 w-4 text-muted-foreground" />}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => selectMode ? toggleCard(c.id) : setOpenId(c.scryfall_id)}
                  className="block w-full aspect-[488/680] overflow-hidden bg-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label={`Open ${c.card_name} details`}
                >
                  {c.image_url ? (
                    <img src={c.image_url} alt={c.card_name} loading="lazy"
                      className={cn("h-full w-full object-cover transition-transform duration-500 group-hover:scale-105", isSelected && "opacity-80")} />
                  ) : (
                    <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">{c.card_name}</div>
                  )}
                </button>

                <CardContent className="space-y-2 p-3">
                  <p className="line-clamp-1 font-fantasy text-sm font-semibold">{c.card_name}</p>
                  <div className="flex items-center justify-between">
                    {c.rarity && (
                      <Badge variant="outline" className={`text-[10px] uppercase ${RARITY_CLASS[c.rarity] ?? RARITY_CLASS.common}`}>
                        {c.rarity}
                      </Badge>
                    )}
                    <div className="flex items-center gap-1">
                      {c.foil && <span className="text-[9px] text-primary font-bold uppercase">✦ foil</span>}
                      {c.price_usd && <span className="text-xs text-mana-green">${Number(c.price_usd).toFixed(2)}</span>}
                    </div>
                  </div>
                  {!selectMode && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 rounded-md border border-border bg-secondary/50">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateQty(c.id, -1)}><Minus className="h-3 w-3" /></Button>
                        <span className="min-w-[1.5rem] text-center text-sm font-semibold">{c.quantity}</span>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateQty(c.id, 1)}><Plus className="h-3 w-3" /></Button>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* List view */
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {filtered.map((c) => {
            const isSelected = selected.has(c.id);
            return (
              <div
                key={c.id}
                className={cn("flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/30 transition-colors", isSelected && "bg-primary/5")}
              >
                {/* Checkbox in select mode */}
                {selectMode && (
                  <button type="button" onClick={() => toggleCard(c.id)} className="shrink-0 focus:outline-none">
                    {isSelected
                      ? <CheckSquare className="h-4 w-4 text-primary" />
                      : <Square className="h-4 w-4 text-muted-foreground" />}
                  </button>
                )}

                <button type="button" onClick={() => selectMode ? toggleCard(c.id) : setOpenId(c.scryfall_id)} className="shrink-0 focus:outline-none">
                  {c.image_url ? (
                    <img src={c.image_url} alt={c.card_name} className="h-10 w-7 rounded object-cover ring-1 ring-border/60" loading="lazy" />
                  ) : (
                    <div className="h-10 w-7 rounded bg-secondary" />
                  )}
                </button>
                <button type="button" onClick={() => selectMode ? toggleCard(c.id) : setOpenId(c.scryfall_id)} className="flex-1 min-w-0 text-left">
                  <p className="font-fantasy text-sm font-semibold truncate hover:text-primary transition-colors">{c.card_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.type_line ?? c.set_name ?? ""}</p>
                </button>
                <div className="flex items-center gap-3 shrink-0 text-xs">
                  {c.rarity && <Badge variant="outline" className={`text-[9px] uppercase hidden sm:inline-flex ${RARITY_CLASS[c.rarity] ?? ""}`}>{c.rarity}</Badge>}
                  {c.foil && <span className="text-[9px] text-primary font-bold hidden md:block">✦</span>}
                  {c.price_usd && <span className="text-mana-green hidden sm:block">${Number(c.price_usd).toFixed(2)}</span>}
                  {!selectMode && (
                    <>
                      <div className="flex items-center gap-1 rounded border border-border bg-secondary/50">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateQty(c.id, -1)}><Minus className="h-2.5 w-2.5" /></Button>
                        <span className="min-w-[1.25rem] text-center text-xs font-bold">{c.quantity}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateQty(c.id, 1)}><Plus className="h-2.5 w-2.5" /></Button>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(c.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CardDetailModal
        cardId={openId}
        siblingIds={filtered.map((c) => c.scryfall_id)}
        onChangeCardId={setOpenId}
        onClose={() => setOpenId(null)}
      />

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={confirmBulkOpen}
        title={`Delete ${selected.size} card${selected.size !== 1 ? "s" : ""}?`}
        description={`This will permanently remove ${selected.size} card${selected.size !== 1 ? "s" : ""} from your grimoire. This cannot be undone.`}
        confirmLabel={`Delete ${selected.size}`}
        onConfirm={bulkDelete}
        onCancel={() => setConfirmBulkOpen(false)}
      />
    </div>
  );
}
