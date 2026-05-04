import { useCurrency } from "@/contexts/CurrencyContext";
import { useEffect, useState, useMemo, useRef } from "react";
import {
  Trash2, Minus, Plus, Library, LayoutGrid, List,
  SlidersHorizontal, X, ArrowUpDown, CheckSquare, Square,
  Upload, HelpCircle, Loader2, Sparkles, Package, Wand2,
  Download, Check, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import CardDetailModal from "@/components/CardDetailModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type StorageType = "arcane" | "vault";

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
  storage_type: StorageType;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_TABS: { key: "all" | StorageType; label: string; icon: React.ElementType; desc: string }[] = [
  { key: "all",    label: "All",    icon: Library,  desc: "Every card in your grimoire" },
  { key: "arcane", label: "Arcane", icon: Sparkles, desc: "Digital · Arena / MTGO / Online" },
  { key: "vault",  label: "Vault",  icon: Package,  desc: "Physical · Cards you own in hand" },
];

const STORAGE_BADGE: Record<StorageType, { label: string; cls: string }> = {
  arcane: { label: "Arcane", cls: "border-accent/50 text-accent" },
  vault:  { label: "Vault",  cls: "border-mana-green/50 text-mana-green" },
};

const RARITY_CLASS: Record<string, string> = {
  common:   "border-rarity-common/40 text-rarity-common",
  uncommon: "border-rarity-uncommon/50 text-rarity-uncommon",
  rare:     "border-rarity-rare/60 text-rarity-rare",
  mythic:   "border-rarity-mythic/60 text-rarity-mythic",
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
const CARD_TYPES = [
  { key: "creature",     label: "Creature",     icon: "🐉" },
  { key: "instant",      label: "Instant",      icon: "⚡" },
  { key: "sorcery",      label: "Sorcery",      icon: "🌀" },
  { key: "enchantment",  label: "Enchantment",  icon: "✨" },
  { key: "artifact",     label: "Artifact",     icon: "⚙️" },
  { key: "planeswalker", label: "Planeswalker", icon: "🧙" },
  { key: "land",         label: "Land",         icon: "🏔️" },
  { key: "battle",       label: "Battle",       icon: "⚔️" },
] as const;
type CardTypeKey = typeof CARD_TYPES[number]["key"];

const SUPERTYPES = ["Legendary", "Snow", "Basic", "Token", "World"];

const SUBTYPES = [
  "Dragon","Elf","Goblin","Vampire","Zombie","Merfolk",
  "Angel","Demon","Wizard","Knight","Warrior","Beast",
  "Human","Spirit","Eldrazi","Sliver",
];
const SORT_OPTIONS = [
  { value: "added",    label: "Recently added" },
  { value: "name",     label: "Name A–Z" },
  { value: "cmc",      label: "Mana cost" },
  { value: "price",    label: "Price" },
  { value: "quantity", label: "Quantity" },
];
type SortKey = "added" | "name" | "cmc" | "price" | "quantity";
type ViewMode = "grid" | "list";

// ── Component ─────────────────────────────────────────────────────────────────

export default function Collection() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { fmt } = useCurrency();
  const [cards, setCards]     = useState<CollectionCard[]>([]);
  const [filter, setFilter]   = useState("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId]   = useState<string | null>(null);
  const [view, setView]       = useState<ViewMode>("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [showStats, setShowStats]     = useState(false);

  // Storage type tab
  const [storageTab, setStorageTab] = useState<"all" | StorageType>("all");

  // Filters
  const [colorFilter, setColorFilter]   = useState<string[]>([]);
  const [rarityFilter, setRarityFilter] = useState<string[]>([]);
  const [foilFilter, setFoilFilter]     = useState<boolean | null>(null);
  const [typeFilter, setTypeFilter]       = useState<CardTypeKey[]>([]);
  const [supertypeFilter, setSupertypeFilter] = useState<string>("");
  const [subtypeFilter, setSubtypeFilter]     = useState<string>("");
  const [cmcMin, setCmcMin]             = useState("");
  const [cmcMax, setCmcMax]             = useState("");
  const [sortKey, setSortKey]           = useState<SortKey>("added");

  // Bulk select
  const [selectMode, setSelectMode]   = useState(false);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);

  // Bulk import
  const [importOpen, setImportOpen]         = useState(false);
  const [importText, setImportText]         = useState("");
  const [importStorage, setImportStorage]   = useState<StorageType>("vault");
  const [showFormat, setShowFormat]         = useState(false);
  const [importing, setImporting]           = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  // Moving storage type
  const [movingId, setMovingId] = useState<string | null>(null);

  // Export
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"simple" | "arena" | "csv">("simple");
  const [exportCopied, setExportCopied] = useState(false);
  const exportTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (user) load(); }, [user]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("collection_cards")
      .select("id, scryfall_id, card_name, set_name, rarity, image_url, quantity, price_usd, foil, colors, type_line, cmc, storage_type")
      .order("created_at", { ascending: false });
    setCards((data ?? []).map(c => ({ ...c, storage_type: (c.storage_type ?? "vault") as StorageType })));
    setLoading(false);
  };

  // ── Storage type switcher per card ─────────────────────────────────────────
  const switchStorage = async (id: string, to: StorageType) => {
    setMovingId(id);
    setCards(prev => prev.map(c => c.id === id ? { ...c, storage_type: to } : c));
    const { error } = await supabase.from("collection_cards").update({ storage_type: to }).eq("id", id);
    if (error) {
      toast.error("Failed to update card location");
      load(); // revert
    } else {
      toast.success(`Moved to ${to === "arcane" ? "Arcane ✦ Digital" : "Vault ✦ Physical"}`);
    }
    setMovingId(null);
  };

  // ── Bulk import ────────────────────────────────────────────────────────────
  const handleBulkImport = async () => {
    if (!importText.trim() || !user) return;
    setImporting(true);
    setImportProgress({ current: 0, total: 0 });

    const lines = importText.split("\n").map(l => l.trim())
      .filter(l => l && !/^(Deck|Sideboard|Commander)$/i.test(l));

    const parsed: Array<{ name: string; quantity: number; set?: string; num?: string }> = [];
    for (const line of lines) {
      const m1 = line.match(/^(\d+)x?\s+(.+?)(?:\s+\(([A-Z0-9]+)\)\s+(\d+))?$/i);
      const m2 = line.match(/^(.+?)\s+x(\d+)$/i);
      if (m1)      parsed.push({ quantity: parseInt(m1[1]), name: m1[2].trim(), set: m1[3], num: m1[4] });
      else if (m2) parsed.push({ quantity: parseInt(m2[2]), name: m2[1].trim() });
      else if (line.match(/^[A-Za-z]/)) parsed.push({ quantity: 1, name: line });
    }

    if (!parsed.length) { toast.error("No valid card lines found"); setImporting(false); return; }
    setImportProgress({ current: 0, total: parsed.length });

    let added = 0, skipped = 0;
    for (let i = 0; i < parsed.length; i++) {
      const { name, quantity, set, num } = parsed[i];
      setImportProgress({ current: i + 1, total: parsed.length });
      try {
        let card = null;
        if (set && num) {
          const r = await fetch(`https://api.scryfall.com/cards/${set.toLowerCase()}/${num}`);
          if (r.ok) card = await r.json();
        }
        if (!card) {
          const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
          if (r.ok) card = await r.json();
        }
        const { data: existing } = await supabase.from("collection_cards")
          .select("id, quantity").eq("user_id", user.id)
          .eq("scryfall_id", card?.id ?? name).eq("storage_type", importStorage).maybeSingle();

        if (existing) {
          await supabase.from("collection_cards").update({ quantity: existing.quantity + quantity }).eq("id", existing.id);
        } else {
          await supabase.from("collection_cards").insert({
            user_id: user.id,
            scryfall_id: card?.id ?? "unknown",
            card_name: card?.name ?? name,
            set_code: card?.set ?? set ?? null,
            set_name: card?.set_name ?? null,
            collector_number: card?.collector_number ?? num ?? null,
            rarity: card?.rarity ?? null,
            mana_cost: card?.mana_cost ?? null,
            type_line: card?.type_line ?? null,
            colors: card?.colors ?? [],
            cmc: card?.cmc ?? null,
            image_url: card?.image_uris?.normal ?? card?.card_faces?.[0]?.image_uris?.normal ?? null,
            price_usd: card?.prices?.usd ? Number(card.prices.usd) : null,
            quantity,
            storage_type: importStorage,
          });
        }
        added++;
      } catch { skipped++; }
    }

    await load();
    setImporting(false);
    setImportOpen(false);
    setImportText("");
    toast.success(`${added} card${added !== 1 ? "s" : ""} added to ${importStorage === "arcane" ? "Arcane" : "Vault"}${skipped ? ` (${skipped} skipped)` : ""}`);
  };

  // ── Card operations ────────────────────────────────────────────────────────
  // ── Export ────────────────────────────────────────────────────────────────
  const cardsToExport = useMemo(() => {
    // Export the currently visible filtered set, or all if no filters
    return storageTab === "all" ? cards : cards.filter(c => c.storage_type === storageTab);
  }, [cards, storageTab]);

  const exportText = useMemo(() => {
    if (exportFormat === "simple") {
      return cardsToExport
        .map(c => `${c.quantity} ${c.card_name}`)
        .join("\n");
    }
    if (exportFormat === "arena") {
      return cardsToExport
        .map(c => `${c.quantity} ${c.card_name}`)
        .join("\n");
    }
    if (exportFormat === "csv") {
      const header = "Name,Quantity,Set,Rarity,Type,CMC,Price USD,Foil,Storage";
      const rows = cardsToExport.map(c =>
        [
          `"${c.card_name}"`,
          c.quantity,
          `"${c.set_name ?? ""}"`,
          c.rarity ?? "",
          `"${c.type_line ?? ""}"`,
          c.cmc ?? "",
          c.price_usd ?? "",
          c.foil ? "Yes" : "No",
          c.storage_type,
        ].join(",")
      );
      return [header, ...rows].join("\n");
    }
    return "";
  }, [cardsToExport, exportFormat]);

  const copyExport = () => {
    const el = exportTextareaRef.current;
    if (!el) return;
    el.removeAttribute("readonly");
    el.focus();
    el.select();
    el.setSelectionRange(0, el.value.length);
    const ok = document.execCommand("copy");
    el.setAttribute("readonly", "true");
    if (ok) {
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2500);
    } else {
      navigator.clipboard?.writeText(exportText).then(() => {
        setExportCopied(true);
        setTimeout(() => setExportCopied(false), 2500);
      });
    }
  };

  const downloadExport = () => {
    const ext = exportFormat === "csv" ? "csv" : "txt";
    const mimeType = exportFormat === "csv" ? "text/csv" : "text/plain";
    const label = storageTab === "all" ? "collection" : storageTab;
    const blob = new Blob([exportText], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `phantom-mtg-${label}-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateQty = async (id: string, delta: number) => {
    const card = cards.find(c => c.id === id);
    if (!card) return;
    const next = Math.max(0, card.quantity + delta);
    if (next === 0) return remove(id);
    setCards(prev => prev.map(c => c.id === id ? { ...c, quantity: next } : c));
    await supabase.from("collection_cards").update({ quantity: next }).eq("id", id);
  };

  const remove = async (id: string) => {
    setCards(prev => prev.filter(c => c.id !== id));
    const { error } = await supabase.from("collection_cards").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  // ── Bulk select ────────────────────────────────────────────────────────────
  const toggleSelectMode = () => { setSelectMode(v => !v); setSelected(new Set()); };
  const toggleCard = (id: string) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const selectAll = () => setSelected(new Set(filtered.map(c => c.id)));
  const clearSelection = () => setSelected(new Set());

  const bulkDelete = async () => {
    setBulkDeleting(true);
    const ids = [...selected];
    const { error } = await supabase.from("collection_cards").delete().in("id", ids);
    if (error) { toast.error(error.message); }
    else {
      setCards(prev => prev.filter(c => !ids.includes(c.id)));
      toast.success(`Removed ${ids.length} card${ids.length !== 1 ? "s" : ""}`);
      setSelected(new Set()); setSelectMode(false);
    }
    setBulkDeleting(false); setConfirmBulkOpen(false);
  };

  const toggleColor  = (c: string) => setColorFilter(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]);
  const toggleType   = (t: CardTypeKey) => setTypeFilter(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);
  const toggleRarity = (r: string) => setRarityFilter(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r]);
  const activeFilterCount = colorFilter.length + rarityFilter.length + typeFilter.length + (supertypeFilter ? 1 : 0) + (subtypeFilter ? 1 : 0) + (foilFilter !== null ? 1 : 0) + (cmcMin ? 1 : 0) + (cmcMax ? 1 : 0);
  const clearFilters = () => { setColorFilter([]); setRarityFilter([]); setTypeFilter([]); setSupertypeFilter(""); setSubtypeFilter(""); setFoilFilter(null); setCmcMin(""); setCmcMax(""); setFilter(""); };

  // ── Filtered + sorted list ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = cards.filter(c => {
      if (storageTab !== "all" && c.storage_type !== storageTab) return false;
      if (filter && !c.card_name.toLowerCase().includes(filter.toLowerCase())) return false;
      if (colorFilter.length && !colorFilter.some(col => c.colors?.includes(col))) return false;
      if (rarityFilter.length && !rarityFilter.includes(c.rarity ?? "")) return false;
      if (typeFilter.length && !typeFilter.some(t => c.type_line?.toLowerCase().includes(t))) return false;
      if (supertypeFilter && !c.type_line?.toLowerCase().includes(supertypeFilter.toLowerCase())) return false;
      if (subtypeFilter && !c.type_line?.toLowerCase().includes(subtypeFilter.toLowerCase())) return false;
      if (foilFilter !== null && c.foil !== foilFilter) return false;
      if (cmcMin && (c.cmc ?? 0) < Number(cmcMin)) return false;
      if (cmcMax && (c.cmc ?? 0) > Number(cmcMax)) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "name":     return a.card_name.localeCompare(b.card_name);
        case "cmc":      return (a.cmc ?? 0) - (b.cmc ?? 0);
        case "price":    return (b.price_usd ?? 0) - (a.price_usd ?? 0);
        case "quantity": return b.quantity - a.quantity;
        default:         return 0;
      }
    });
  }, [cards, storageTab, filter, colorFilter, rarityFilter, typeFilter, supertypeFilter, subtypeFilter, foilFilter, cmcMin, cmcMax, sortKey]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const arcaneCards = cards.filter(c => c.storage_type === "arcane");
  const vaultCards  = cards.filter(c => c.storage_type === "vault");
  const totalCards  = cards.reduce((s, c) => s + c.quantity, 0);
  const totalValue  = cards.reduce((s, c) => s + Number(c.price_usd ?? 0) * c.quantity, 0);
  const arcaneValue = arcaneCards.reduce((s, c) => s + Number(c.price_usd ?? 0) * c.quantity, 0);
  const vaultValue  = vaultCards.reduce((s, c) => s + Number(c.price_usd ?? 0) * c.quantity, 0);

  const selectedValue = [...selected].reduce((s, id) => {
    const c = cards.find(x => x.id === id);
    return s + Number(c?.price_usd ?? 0) * (c?.quantity ?? 1);
  }, 0);

  const cmcBuckets = useMemo(() => {
    const b: Record<string, number> = {};
    filtered.forEach(c => {
      const key = c.cmc == null ? "?" : c.cmc >= 7 ? "7+" : String(Math.floor(c.cmc));
      b[key] = (b[key] ?? 0) + c.quantity;
    });
    return ["0","1","2","3","4","5","6","7+","?"].filter(k => b[k]).map(k => ({ cmc: k, count: b[k] }));
  }, [filtered]);

  const colorData = useMemo(() => {
    const t: Record<string, number> = {};
    filtered.forEach(c => (c.colors ?? []).forEach(col => { t[col] = (t[col] ?? 0) + c.quantity; }));
    return Object.entries(t).map(([name, value]) => ({ name, value, fill: MANA_HEX[name] ?? "#888" }));
  }, [filtered]);

  const rarityData = useMemo(() => {
    const t: Record<string, number> = {};
    filtered.forEach(c => { t[c.rarity ?? "unknown"] = (t[c.rarity ?? "unknown"] ?? 0) + c.quantity; });
    return Object.entries(t).map(([r, v]) => ({ rarity: r, count: v }));
  }, [filtered]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">Your Grimoire</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalCards.toLocaleString()} cards · {fmt(totalValue)} est. value · {cards.length} unique
          </p>
        </div>
        {/* Toolbar — single tight row on mobile */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button variant="outline" size="sm" className="border-border/60 h-8 px-3 text-xs" onClick={() => setShowStats(v => !v)}>
            {showStats ? "Hide stats" : "Stats"}
          </Button>
          <Button
            variant={selectMode ? "secondary" : "outline"} size="sm"
            className={cn("border-border/60 gap-1 h-8 px-3 text-xs", selectMode && "border-primary/50 text-primary")}
            onClick={toggleSelectMode}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {selectMode ? "Cancel" : "Select"}
          </Button>
          <Button variant="outline" size="sm" className="border-border/60 h-8 px-3 text-xs" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1 h-3.5 w-3.5" /> Import
          </Button>
          <Button variant="outline" size="sm" className="border-border/60 h-8 px-3 text-xs" onClick={() => setExportOpen(true)}>
            <Download className="mr-1 h-3.5 w-3.5" /> Export
          </Button>
          <Button asChild size="sm" className="h-8 px-3 text-xs bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 ml-auto">
            <Link to="/app/search"><Plus className="mr-1 h-3.5 w-3.5" /> Add cards</Link>
          </Button>
        </div>
      </div>

      {/* ── Arcane / Vault / All tab switcher ─── */}
      <div className="grid grid-cols-3 gap-2">
        {STORAGE_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = storageTab === tab.key;
          const count = tab.key === "all" ? cards.length
            : tab.key === "arcane" ? arcaneCards.length
            : vaultCards.length;
          const val = tab.key === "all" ? totalValue
            : tab.key === "arcane" ? arcaneValue
            : vaultValue;
          return (
            <button
              key={tab.key}
              onClick={() => setStorageTab(tab.key)}
              className={cn(
                "flex flex-col gap-1 rounded-xl border p-3 text-left transition-all",
                isActive
                  ? "border-primary/50 bg-primary/8 ring-1 ring-primary/20 shadow-[0_0_20px_hsl(var(--primary)/0.08)]"
                  : "border-border/50 bg-secondary/20 hover:border-border hover:bg-secondary/40"
              )}
            >
              <div className="flex items-center gap-1.5">
                <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
                  isActive ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
                )}>
                  <Icon className="h-3 w-3" />
                </div>
                <span className={cn("font-fantasy text-xs font-semibold truncate", isActive ? "text-foreground" : "text-muted-foreground")}>
                  {tab.label}
                </span>
                <span className={cn("ml-auto text-xs font-bold tabular-nums shrink-0", isActive ? "text-primary" : "text-muted-foreground/60")}>
                  {count}
                </span>
              </div>
              {count > 0 && (
                <p className={cn("text-[10px] font-medium mt-0.5", isActive ? "text-mana-green" : "text-muted-foreground/40")}>
                  {fmt(val)}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Forge from this collection ─── */}
      {storageTab !== "all" && (
        <div className={cn(
          "flex items-center justify-between gap-3 rounded-xl border p-3 transition-all",
          storageTab === "vault"
            ? "border-mana-green/30 bg-mana-green/5"
            : "border-accent/30 bg-accent/5"
        )}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              storageTab === "vault" ? "bg-mana-green/15 text-mana-green" : "bg-accent/15 text-accent"
            )}>
              <Wand2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">
                Forge a deck from {storageTab === "vault" ? "Vault" : "Arcane"}
              </p>
              <p className="text-[11px] text-muted-foreground/70 leading-tight">
                AI Decksmith will prioritise your {storageTab === "vault" ? "physical" : "digital"} cards
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate("/app/decksmith", { state: { useCollection: true, storageType: storageTab } })}
            className={cn(
              "shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all",
              storageTab === "vault"
                ? "bg-mana-green/15 text-mana-green hover:bg-mana-green/25 ring-1 ring-mana-green/30"
                : "bg-accent/15 text-accent hover:bg-accent/25 ring-1 ring-accent/30"
            )}
          >
            <Wand2 className="h-3.5 w-3.5" />
            Forge
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {selectMode && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-arcane px-4 py-3 animate-fade-in">
          <button onClick={allFilteredSelected ? clearSelection : selectAll}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {allFilteredSelected
              ? <CheckSquare className="h-4 w-4 text-primary" />
              : <Square className="h-4 w-4" />}
            {allFilteredSelected ? "Deselect all" : `Select all (${filtered.length})`}
          </button>
          <div className="h-4 w-px bg-border/60" />
          <span className="text-sm font-medium">
            {selected.size > 0
              ? <>{selected.size} selected · <span className="text-mana-green">{fmt(selectedValue)}</span></>
              : <span className="text-muted-foreground">Tap cards to select</span>}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {selected.size > 0 && (
              <Button size="sm"
                className="h-8 bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-1.5"
                disabled={bulkDeleting} onClick={() => setConfirmBulkOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      {showStats && filtered.length > 0 && (
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
                    {colorData.map(entry => <Cell key={entry.name} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:6, fontSize:11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-muted-foreground">No color data</p>}
          </Card>
          <Card className="border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Rarity breakdown</p>
            <div className="space-y-2">
              {RARITIES.filter(r => rarityData.find(d => d.rarity === r)).map(r => {
                const d = rarityData.find(x => x.rarity === r);
                const tot = filtered.reduce((s, c) => s + c.quantity, 0);
                const pct = d ? Math.round((d.count / tot) * 100) : 0;
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
        <Input value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="Filter by name…" className="h-9 w-56 text-sm" />
        <Button variant="outline" size="sm"
          className={cn("border-border/60 gap-1.5", activeFilterCount > 0 && "border-primary/50 text-primary")}
          onClick={() => setShowFilters(v => !v)}>
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && <span className="ml-0.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold">{activeFilterCount}</span>}
        </Button>
        <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
            className="bg-transparent border-none text-xs text-muted-foreground focus:outline-none cursor-pointer">
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
          <div className="space-y-4">

            {/* Row 1: Color + Rarity + Foil + CMC inline */}
            <div className="flex flex-wrap items-start gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Color</p>
                <div className="flex gap-1.5">
                  {MANA_COLORS.map(c => (
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
                  {RARITIES.map(r => (
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
                  {([null, true, false] as const).map(v => (
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
                  <Input value={cmcMin} onChange={e => setCmcMin(e.target.value)} placeholder="Min" className="h-7 w-14 text-xs" type="number" min={0} />
                  <span className="text-muted-foreground text-xs">–</span>
                  <Input value={cmcMax} onChange={e => setCmcMax(e.target.value)} placeholder="Max" className="h-7 w-14 text-xs" type="number" min={0} />
                </div>
              </div>
            </div>

            {/* Row 2: Card type — full width, always on its own line */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Card type</p>
              <div className="flex flex-wrap gap-1.5">
                {CARD_TYPES.map(t => (
                  <button key={t.key} onClick={() => toggleType(t.key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
                      typeFilter.includes(t.key)
                        ? "border-primary/60 bg-primary/15 text-primary ring-1 ring-primary/20"
                        : "border-border/50 bg-secondary/30 text-muted-foreground hover:border-border hover:text-foreground"
                    )}>
                    <span className="text-base leading-none">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 3: Supertype */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Supertype</p>
              <div className="flex flex-wrap gap-1.5">
                {SUPERTYPES.map(s => {
                  const active = supertypeFilter === s.toLowerCase();
                  return (
                    <button key={s} onClick={() => setSupertypeFilter(active ? "" : s.toLowerCase())}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-xs font-medium transition-all",
                        active
                          ? "border-primary/60 bg-primary/15 text-primary ring-1 ring-primary/20"
                          : "border-border/50 bg-secondary/30 text-muted-foreground hover:border-border hover:text-foreground"
                      )}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row 4: Subtype / Tribe */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Subtype / Tribe</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {SUBTYPES.map(s => {
                  const active = subtypeFilter.toLowerCase() === s.toLowerCase();
                  return (
                    <button key={s} onClick={() => setSubtypeFilter(active ? "" : s)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-xs transition-all",
                        active
                          ? "border-accent/60 bg-accent/15 text-accent ring-1 ring-accent/20"
                          : "border-border/50 bg-secondary/30 text-muted-foreground hover:border-border hover:text-foreground"
                      )}>
                      {s}
                    </button>
                  );
                })}
              </div>
              <Input
                value={subtypeFilter}
                onChange={e => setSubtypeFilter(e.target.value)}
                placeholder="Or type any subtype (e.g. Pirate, Elemental, Saga…)"
                className="h-8 text-xs bg-secondary/30 border-border/50"
              />
            </div>

          </div>
        </div>
      )}

      {(filter || activeFilterCount > 0 || storageTab !== "all") && !loading && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length.toLocaleString()} of {cards.length.toLocaleString()} cards
          {storageTab !== "all" && <> · <span className={storageTab === "arcane" ? "text-accent" : "text-mana-green"}>{storageTab === "arcane" ? "✦ Arcane" : "✦ Vault"}</span></>}
        </p>
      )}

      {/* Card grid / list */}
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
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No cards match your current filters.</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map(c => {
            const isSelected = selected.has(c.id);
            const badge = STORAGE_BADGE[c.storage_type];
            return (
              <Card key={c.id} className={cn(
                "group overflow-hidden border-border bg-card card-hover relative",
                isSelected && "ring-2 ring-primary shadow-[0_0_16px_hsl(var(--primary)/0.4)]"
              )}>
                {selectMode && (
                  <button type="button" onClick={() => toggleCard(c.id)}
                    className="absolute top-2 left-2 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-background/80 backdrop-blur-sm ring-1 ring-border transition-all hover:ring-primary"
                    aria-label={isSelected ? "Deselect" : "Select"}>
                    {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                  </button>
                )}

                {/* Storage type pill — top right, minimal */}
                <div className="absolute top-1.5 right-1.5 z-10">
                  <span className={cn("rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide backdrop-blur-sm bg-black/60 border", badge.cls)}>
                    {c.storage_type === "arcane" ? "✦" : "■"} {badge.label}
                  </span>
                </div>

                <button type="button"
                  onClick={() => selectMode ? toggleCard(c.id) : setOpenId(c.scryfall_id)}
                  className="block w-full aspect-[488/680] overflow-hidden bg-secondary focus:outline-none focus:ring-2 focus:ring-primary">
                  {c.image_url
                    ? <img src={c.image_url} alt={c.card_name} loading="lazy"
                        className={cn("h-full w-full object-cover transition-transform duration-500 group-hover:scale-105", isSelected && "opacity-80")} />
                    : <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">{c.card_name}</div>}
                </button>

                <CardContent className="space-y-1.5 p-2">
                  <div className="flex items-center justify-between gap-1">
                    <p className="line-clamp-1 font-fantasy text-xs font-semibold flex-1 min-w-0">{c.card_name}</p>
                    {c.price_usd && <span className="text-[10px] text-mana-green shrink-0">{fmt(c.price_usd)}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {c.rarity && (
                      <Badge variant="outline" className={`text-[9px] uppercase px-1 py-0 ${RARITY_CLASS[c.rarity] ?? RARITY_CLASS.common}`}>
                        {c.rarity}
                      </Badge>
                    )}
                    {c.foil && <span className="text-[8px] text-primary font-bold">✦</span>}
                  </div>
                  {!selectMode && (
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-0.5 rounded border border-border bg-secondary/50">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateQty(c.id, -1)}><Minus className="h-2.5 w-2.5" /></Button>
                        <span className="min-w-[1.25rem] text-center text-xs font-semibold">{c.quantity}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateQty(c.id, 1)}><Plus className="h-2.5 w-2.5" /></Button>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => switchStorage(c.id, c.storage_type === "arcane" ? "vault" : "arcane")}
                          disabled={movingId === c.id}
                          title={c.storage_type === "arcane" ? "Move to Vault" : "Move to Arcane"}
                          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-50"
                        >
                          {movingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : c.storage_type === "arcane" ? <Package className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                        </button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => remove(c.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
          {filtered.map(c => {
            const isSelected = selected.has(c.id);
            const badge = STORAGE_BADGE[c.storage_type];
            return (
              <div key={c.id}
                className={cn("flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/30 transition-colors", isSelected && "bg-primary/5")}>
                {selectMode && (
                  <button type="button" onClick={() => toggleCard(c.id)} className="shrink-0 focus:outline-none">
                    {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                  </button>
                )}
                <button type="button" onClick={() => selectMode ? toggleCard(c.id) : setOpenId(c.scryfall_id)} className="shrink-0 focus:outline-none">
                  {c.image_url
                    ? <img src={c.image_url} alt={c.card_name} className="h-10 w-7 rounded object-cover ring-1 ring-border/60" loading="lazy" />
                    : <div className="h-10 w-7 rounded bg-secondary" />}
                </button>
                <button type="button" onClick={() => selectMode ? toggleCard(c.id) : setOpenId(c.scryfall_id)} className="flex-1 min-w-0 text-left">
                  <p className="font-fantasy text-sm font-semibold truncate hover:text-primary transition-colors">{c.card_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.type_line ?? c.set_name ?? ""}</p>
                </button>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  {/* Storage badge */}
                  <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase hidden sm:inline-flex", badge.cls)}>
                    {badge.label}
                  </span>
                  {c.rarity && <Badge variant="outline" className={`text-[9px] uppercase hidden md:inline-flex ${RARITY_CLASS[c.rarity] ?? ""}`}>{c.rarity}</Badge>}
                  {c.foil && <span className="text-[9px] text-primary font-bold hidden lg:block">✦</span>}
                  {c.price_usd && <span className="text-mana-green hidden sm:block">{fmt(c.price_usd)}</span>}
                  {!selectMode && (
                    <>
                      <div className="flex items-center gap-1 rounded border border-border bg-secondary/50">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateQty(c.id, -1)}><Minus className="h-2.5 w-2.5" /></Button>
                        <span className="min-w-[1.25rem] text-center text-xs font-bold">{c.quantity}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateQty(c.id, 1)}><Plus className="h-2.5 w-2.5" /></Button>
                      </div>
                      <button
                        onClick={() => switchStorage(c.id, c.storage_type === "arcane" ? "vault" : "arcane")}
                        disabled={movingId === c.id}
                        title={c.storage_type === "arcane" ? "Move to Vault" : "Move to Arcane"}
                        className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      >
                        {movingId === c.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : c.storage_type === "arcane" ? <Package className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                      </button>
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
        siblingIds={filtered.map(c => c.scryfall_id)}
        onChangeCardId={setOpenId}
        onClose={() => setOpenId(null)}
      />

      <ConfirmDialog
        open={confirmBulkOpen}
        title={`Delete ${selected.size} card${selected.size !== 1 ? "s" : ""}?`}
        description={`This will permanently remove ${selected.size} card${selected.size !== 1 ? "s" : ""} from your grimoire. This cannot be undone.`}
        confirmLabel={`Delete ${selected.size}`}
        onConfirm={bulkDelete}
        onCancel={() => setConfirmBulkOpen(false)}
      />

      {/* ── Bulk Import Dialog ── */}
      <Dialog open={importOpen} onOpenChange={o => { if (!importing) { setImportOpen(o); if (!o) setImportText(""); } }}>
        <DialogContent className="max-w-lg border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-fantasy text-xl text-gradient-gold flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" /> Import to Collection
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Paste a card list and choose where to store them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Storage type picker for import */}
            <div className="grid grid-cols-2 gap-2">
              {(["vault", "arcane"] as StorageType[]).map(t => {
                const Icon = t === "arcane" ? Sparkles : Package;
                const isActive = importStorage === t;
                return (
                  <button key={t} onClick={() => setImportStorage(t)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border p-3 text-left transition-all",
                      isActive ? "border-primary/50 bg-primary/8 ring-1 ring-primary/20" : "border-border/50 bg-secondary/20 hover:border-border"
                    )}>
                    <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                    <div>
                      <p className={cn("text-sm font-semibold font-fantasy", isActive ? "text-foreground" : "text-muted-foreground")}>
                        {t === "arcane" ? "Arcane" : "Vault"}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60">
                        {t === "arcane" ? "Digital · Arena / MTGO" : "Physical · Cards in hand"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <button type="button" onClick={() => setShowFormat(v => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <HelpCircle className="h-3.5 w-3.5" />
              {showFormat ? "Hide" : "Show"} accepted formats
            </button>

            {showFormat && (
              <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 space-y-2 text-xs">
                <p className="font-medium text-foreground uppercase tracking-wider text-[10px]">Accepted formats</p>
                <div className="space-y-1 font-mono text-muted-foreground">
                  <p className="text-primary/80">// Arena / MTGO export</p>
                  <p>4 Lightning Bolt (M11) 149</p>
                  <p className="text-primary/80 mt-2">// Simple list</p>
                  <p>4 Lightning Bolt</p>
                  <p className="text-primary/80 mt-2">// Quantity after name</p>
                  <p>Lightning Bolt x4</p>
                  <p className="text-primary/80 mt-2">// Single copy</p>
                  <p>Black Lotus</p>
                </div>
              </div>
            )}

            <Textarea
              value={importText} onChange={e => setImportText(e.target.value)}
              placeholder={`4 Lightning Bolt (M11) 149\n2 Counterspell (7ED) 69\n1 Sol Ring (C21) 263`}
              className="min-h-[180px] font-mono text-xs bg-secondary/40 border-border/60 resize-none"
              disabled={importing}
            />

            {importing && importProgress.total > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Adding to {importStorage === "arcane" ? "Arcane" : "Vault"}…</span>
                  <span>{importProgress.current} / {importProgress.total}</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-primary-glow rounded-full transition-all duration-300"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }} />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setImportOpen(false); setImportText(""); }} disabled={importing}
                className="px-4 py-2 rounded-md border border-border/60 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={handleBulkImport} disabled={importing || !importText.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {importing
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                  : <><Upload className="h-4 w-4" /> Import to {importStorage === "arcane" ? "Arcane" : "Vault"}</>}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Export Dialog ── */}
      <Dialog open={exportOpen} onOpenChange={o => { setExportOpen(o); if (!o) setExportCopied(false); }}>
        <DialogContent className="max-w-lg border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-fantasy text-xl text-gradient-gold flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" /> Export Collection
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {storageTab === "all" ? "All" : storageTab === "vault" ? "🗃️ Vault" : "✨ Arcane"} · {cardsToExport.length} cards
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Format picker */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Format</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "simple", label: "Simple List", desc: "4 Lightning Bolt", icon: "📋" },
                  { key: "arena",  label: "Arena / MTGO", desc: "4 Card Name (SET) #", icon: "🎮" },
                  { key: "csv",    label: "Spreadsheet", desc: "CSV with all fields", icon: "📊" },
                ] as const).map(f => (
                  <button key={f.key} onClick={() => setExportFormat(f.key)}
                    className={cn(
                      "flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-all",
                      exportFormat === f.key
                        ? "border-primary/50 bg-primary/8 ring-1 ring-primary/20"
                        : "border-border/50 bg-secondary/20 hover:border-border"
                    )}>
                    <span className="text-lg leading-none">{f.icon}</span>
                    <span className="text-xs font-semibold leading-tight">{f.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight font-mono">{f.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Preview</p>
              <textarea
                ref={exportTextareaRef}
                readOnly
                value={exportText}
                className="w-full min-h-[160px] max-h-[260px] rounded-lg border border-border/60 bg-secondary/40 p-3 font-mono text-xs text-foreground resize-none focus:outline-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={copyExport}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/60 py-2.5 text-sm font-medium transition-all hover:bg-secondary/50"
              >
                {exportCopied
                  ? <><Check className="h-4 w-4 text-mana-green" /> Copied!</>
                  : <><Copy className="h-4 w-4" /> Copy</>}
              </button>
              <button
                onClick={downloadExport}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-primary-glow py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90"
              >
                <Download className="h-4 w-4" />
                Download .{exportFormat === "csv" ? "csv" : "txt"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
