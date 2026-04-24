import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search as SearchIcon, Plus, Loader2, ChevronDown,
  Download, Copy, Check, FileText, X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { searchCards, getCardImage, primeCardCache, autocomplete, type ScryfallCard } from "@/lib/scryfall";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import CardDetailModal from "@/components/CardDetailModal";
import { cn } from "@/lib/utils";

const RARITY_CLASS: Record<string, string> = {
  common:   "border-rarity-common/40 text-rarity-common",
  uncommon: "border-rarity-uncommon/50 text-rarity-uncommon",
  rare:     "border-rarity-rare/60 text-rarity-rare",
  mythic:   "border-rarity-mythic/60 text-rarity-mythic",
};

const MANA_COLORS = [
  { code: "W", bg: "bg-mana-white", text: "text-amber-900" },
  { code: "U", bg: "bg-mana-blue",  text: "text-white" },
  { code: "B", bg: "bg-mana-black", text: "text-white" },
  { code: "R", bg: "bg-mana-red",   text: "text-white" },
  { code: "G", bg: "bg-mana-green", text: "text-white" },
];

const FORMATS   = ["standard","pioneer","modern","legacy","vintage","commander","pauper"];
const CARD_TYPES = [
  { label: "Creature",     icon: "🐉", query: "creature" },
  { label: "Instant",      icon: "⚡", query: "instant" },
  { label: "Sorcery",      icon: "🌀", query: "sorcery" },
  { label: "Enchantment",  icon: "✨", query: "enchantment" },
  { label: "Artifact",     icon: "⚙️", query: "artifact" },
  { label: "Planeswalker", icon: "🧙", query: "planeswalker" },
  { label: "Land",         icon: "🏔️", query: "land" },
  { label: "Battle",       icon: "⚔️", query: "battle" },
];
const SUBTYPES   = ["Dragon","Elf","Goblin","Vampire","Zombie","Merfolk","Angel","Demon","Wizard","Knight","Warrior","Beast","Human","Spirit","Eldrazi","Sliver"];
const SUPERTYPES = ["Legendary","Snow","Basic","Token","World"];

type ExportFormat = "arena" | "csv" | "text";

function buildExportText(cards: ScryfallCard[], format: ExportFormat): string {
  if (format === "arena") {
    return "Deck\n" + cards
      .map((c) => `1 ${c.name}${c.set ? ` (${c.set.toUpperCase()}) ${c.collector_number ?? ""}` : ""}`.trimEnd())
      .join("\n");
  }
  if (format === "csv") {
    const header = "Name,Set,Collector Number,Rarity,Mana Cost,CMC,Type,Price USD";
    const rows = cards.map((c) =>
      [
        `"${c.name}"`,
        c.set?.toUpperCase() ?? "",
        c.collector_number ?? "",
        c.rarity ?? "",
        c.mana_cost?.replace(/[{}]/g,"") ?? "",
        c.cmc ?? "",
        `"${c.type_line ?? ""}"`,
        c.prices?.usd ?? "",
      ].join(",")
    );
    return [header, ...rows].join("\n");
  }
  // plain text
  return cards.map((c) => {
    const parts = [c.name];
    if (c.set) parts.push(`(${c.set.toUpperCase()})`);
    if (c.prices?.usd) parts.push(`$${c.prices.usd}`);
    return parts.join(" · ");
  }).join("\n");
}

export default function CardSearch() {
  const [params, setParams] = useSearchParams();
  const initial = params.get("q") ?? "";
  const [query, setQuery]       = useState(initial);
  const [busy, setBusy]         = useState(false);
  const [results, setResults]   = useState<ScryfallCard[]>([]);
  const [total, setTotal]       = useState(0);
  const [hasMore, setHasMore]   = useState(false);
  const [page, setPage]         = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [adding, setAdding]     = useState<string | null>(null);
  const [openId, setOpenId]     = useState<string | null>(null);

  // Autocomplete
  const [suggestions, setSuggestions]       = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [acBusy, setAcBusy]                 = useState(false);
  const acTimer = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  // Advanced filters
  const [showAdvanced, setShowAdvanced]         = useState(false);
  const [colorFilter, setColorFilter]           = useState<string[]>([]);
  const [typeFilter, setTypeFilter]             = useState<string[]>([]);
  const [subtypeFilter, setSubtypeFilter]       = useState("");
  const [supertypeFilter, setSupertypeFilter]   = useState("");
  const [formatFilter, setFormatFilter]         = useState("");
  const [rarityFilter, setRarityFilter]         = useState("");
  const [cmcMin, setCmcMin]                     = useState("");
  const [cmcMax, setCmcMax]                     = useState("");
  const [lastQ, setLastQ]                       = useState("");

  // Export
  const [exportOpen, setExportOpen]   = useState(false);
  const [exportFmt, setExportFmt]     = useState<ExportFormat>("arena");
  const [copied, setCopied]           = useState(false);
  const [loadingAll, setLoadingAll]   = useState(false);
  const [allResults, setAllResults]   = useState<ScryfallCard[]>([]);

  useEffect(() => { if (initial) runSearch(initial, 1); }, []);

  const buildQuery = useCallback((baseQ: string) => {
    let q = baseQ.trim();
    if (colorFilter.length) q += ` c:${colorFilter.join("")}`;
    if (typeFilter.length) typeFilter.forEach((t) => { q += ` t:${t}`; });
    if (subtypeFilter.trim()) q += ` t:${subtypeFilter.trim().toLowerCase()}`;
    if (supertypeFilter) q += ` t:${supertypeFilter.toLowerCase()}`;
    if (formatFilter) q += ` f:${formatFilter}`;
    if (rarityFilter) q += ` r:${rarityFilter}`;
    if (cmcMin) q += ` cmc>=${cmcMin}`;
    if (cmcMax) q += ` cmc<=${cmcMax}`;
    return q;
  }, [colorFilter, typeFilter, subtypeFilter, supertypeFilter, formatFilter, rarityFilter, cmcMin, cmcMax]);

  const toggleType  = (t: string) => setTypeFilter((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t]);
  const toggleColor = (c: string) => setColorFilter((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);

  const runSearch = async (baseQ: string, pg = 1) => {
    if (!baseQ.trim()) return;
    const q = buildQuery(baseQ);
    setLastQ(baseQ);
    if (pg === 1) { setBusy(true); setResults([]); setAllResults([]); setPage(1); }
    else setLoadingMore(true);
    try {
      const { data, total: t, hasMore: hm } = await searchCards(q, pg);
      data.forEach(primeCardCache);
      setResults((prev) => pg === 1 ? data : [...prev, ...data]);
      setTotal(t);
      setHasMore(hm);
      setPage(pg);
    } catch {
      toast.error("Scryfall search failed");
    } finally {
      setBusy(false);
      setLoadingMore(false);
    }
  };

  // Fetch ALL pages for export (up to 500 cards)
  const fetchAllForExport = async (): Promise<ScryfallCard[]> => {
    if (allResults.length > 0) return allResults;
    setLoadingAll(true);
    const q = buildQuery(lastQ);
    let all: ScryfallCard[] = [];
    let pg = 1;
    let hm = true;
    while (hm && all.length < 500) {
      try {
        const { data, hasMore } = await searchCards(q, pg);
        all = [...all, ...data];
        hm = hasMore;
        pg++;
      } catch { break; }
    }
    setAllResults(all);
    setLoadingAll(false);
    return all;
  };

  const openExport = async () => {
    await fetchAllForExport();
    setExportOpen(true);
    setCopied(false);
  };

  const exportText = buildExportText(allResults.length > 0 ? allResults : results, exportFmt);

  const copyExport = () => {
    navigator.clipboard.writeText(exportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  };

  const downloadExport = () => {
    const ext = exportFmt === "csv" ? "csv" : "txt";
    const blob = new Blob([exportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mtg-search-${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setShowSuggestions(false);
    setParams({ q: query });
    runSearch(query, 1);
  };

  const onQueryChange = (val: string) => {
    setQuery(val);
    clearTimeout(acTimer.current);
    if (val.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    acTimer.current = setTimeout(async () => {
      setAcBusy(true);
      const s = await autocomplete(val);
      setSuggestions(s.slice(0, 8));
      setShowSuggestions(s.length > 0);
      setAcBusy(false);
    }, 220);
  };

  const pickSuggestion = (s: string) => {
    setQuery(s); setSuggestions([]); setShowSuggestions(false);
    setParams({ q: s }); runSearch(s, 1);
  };

  const addToCollection = async (card: ScryfallCard) => {
    setAdding(card.id);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { toast.error("Sign in required"); setAdding(null); return; }
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
      image_url: getCardImage(card),
      price_usd: card.prices?.usd ? Number(card.prices.usd) : null,
      quantity: 1,
    });
    setAdding(null);
    if (error) toast.error(error.message);
    else toast.success(`Added ${card.name} to your collection`);
  };

  const activeFilters = colorFilter.length + typeFilter.length + (subtypeFilter ? 1 : 0) +
    (supertypeFilter ? 1 : 0) + (formatFilter ? 1 : 0) + (rarityFilter ? 1 : 0) +
    (cmcMin ? 1 : 0) + (cmcMax ? 1 : 0);

  const clearFilters = () => {
    setColorFilter([]); setTypeFilter([]); setSubtypeFilter(""); setSupertypeFilter("");
    setFormatFilter(""); setRarityFilter(""); setCmcMin(""); setCmcMax("");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">Multiverse Search</h1>
          <p className="mt-1 text-sm text-muted-foreground">Browse every Magic card via Scryfall. Add directly to your inventory.</p>
        </div>
        {results.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="border-border/60 gap-1.5 shrink-0"
            onClick={openExport}
            disabled={loadingAll}
          >
            {loadingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export results
          </Button>
        )}
      </div>

      {/* Search bar + autocomplete */}
      <form onSubmit={onSubmit} className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder='Try: "lightning bolt", t:dragon r:mythic, c:gw cmc<=3'
              className="h-11 pl-9 text-base"
              autoFocus
            />
            {acBusy && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-card shadow-[var(--shadow-elevated)] overflow-hidden">
                {suggestions.map((s) => (
                  <button key={s} type="button" onMouseDown={() => pickSuggestion(s)}
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-secondary/60 transition-colors font-fantasy"
                  >{s}</button>
                ))}
              </div>
            )}
          </div>
          <Button type="submit" disabled={busy} className="h-11 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 px-6">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </div>

        {/* Filters toggle */}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAdvanced && "rotate-180")} />
            Filters
            {activeFilters > 0 && <span className="rounded-full bg-primary/20 text-primary px-1.5 py-0.5 text-[10px] font-bold">{activeFilters} active</span>}
          </button>
          {activeFilters > 0 && (
            <button type="button" onClick={clearFilters} className="text-[10px] text-muted-foreground/60 hover:text-destructive transition-colors">Clear all</button>
          )}
        </div>

        {showAdvanced && (
          <div className="rounded-xl border border-border/60 bg-card p-4 space-y-5 animate-fade-in">
            {/* Card Type */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Card type</p>
              <div className="flex flex-wrap gap-1.5">
                {CARD_TYPES.map((t) => (
                  <button key={t.query} type="button" onClick={() => toggleType(t.query)}
                    className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
                      typeFilter.includes(t.query)
                        ? "border-primary/60 bg-primary/15 text-primary ring-1 ring-primary/20"
                        : "border-border/50 bg-secondary/30 text-muted-foreground hover:border-border hover:text-foreground"
                    )}>
                    <span className="text-base leading-none">{t.icon}</span>{t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Supertype */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Supertype</p>
              <div className="flex flex-wrap gap-1.5">
                {SUPERTYPES.map((s) => (
                  <button key={s} type="button" onClick={() => setSupertypeFilter(supertypeFilter === s.toLowerCase() ? "" : s.toLowerCase())}
                    className={cn("rounded-lg border px-2.5 py-1 text-xs font-medium transition-all",
                      supertypeFilter === s.toLowerCase()
                        ? "border-primary/60 bg-primary/15 text-primary"
                        : "border-border/50 bg-secondary/30 text-muted-foreground hover:border-border hover:text-foreground"
                    )}>{s}</button>
                ))}
              </div>
            </div>

            {/* Subtype */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Subtype / Tribe</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {SUBTYPES.map((s) => (
                  <button key={s} type="button" onClick={() => setSubtypeFilter(subtypeFilter.toLowerCase() === s.toLowerCase() ? "" : s)}
                    className={cn("rounded-lg border px-2.5 py-1 text-xs transition-all",
                      subtypeFilter.toLowerCase() === s.toLowerCase()
                        ? "border-accent/60 bg-accent/15 text-accent"
                        : "border-border/50 bg-secondary/30 text-muted-foreground hover:border-border hover:text-foreground"
                    )}>{s}</button>
                ))}
              </div>
              <Input value={subtypeFilter} onChange={(e) => setSubtypeFilter(e.target.value)}
                placeholder="Or type any subtype (e.g. Pirate, Elemental, Saga…)"
                className="h-8 text-xs bg-secondary/30 border-border/50" />
            </div>

            {/* Color · Rarity · Format · CMC */}
            <div className="flex flex-wrap items-start gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Color</p>
                <div className="flex gap-1.5">
                  {MANA_COLORS.map((c) => (
                    <button key={c.code} type="button" onClick={() => toggleColor(c.code)}
                      className={cn("h-7 w-7 rounded-full text-[11px] font-bold ring-2 transition-all", c.bg, c.text,
                        colorFilter.includes(c.code) ? "ring-primary scale-110" : "ring-transparent opacity-50 hover:opacity-80"
                      )}>{c.code}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Rarity</p>
                <div className="flex gap-1">
                  {["C","U","R","M"].map((r, i) => {
                    const full = ["common","uncommon","rare","mythic"][i];
                    const cls  = ["text-rarity-common border-rarity-common/40","text-rarity-uncommon border-rarity-uncommon/50","text-rarity-rare border-rarity-rare/60","text-rarity-mythic border-rarity-mythic/60"][i];
                    return (
                      <button key={r} type="button" onClick={() => setRarityFilter(rarityFilter === full ? "" : full)}
                        className={cn("h-7 w-7 rounded border text-[10px] font-bold transition-all", cls,
                          rarityFilter === full ? "bg-secondary ring-1 ring-current" : "bg-secondary/30 opacity-50 hover:opacity-80"
                        )}>{r}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Format</p>
                <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)}
                  className="h-8 rounded border border-border/60 bg-secondary/40 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50">
                  <option value="">Any</option>
                  {FORMATS.map((f) => <option key={f} value={f} className="capitalize">{f}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">CMC</p>
                <div className="flex items-center gap-1">
                  <Input value={cmcMin} onChange={(e) => setCmcMin(e.target.value)} placeholder="Min" className="h-8 w-14 text-xs" type="number" min={0} />
                  <span className="text-muted-foreground text-xs">–</span>
                  <Input value={cmcMax} onChange={(e) => setCmcMax(e.target.value)} placeholder="Max" className="h-8 w-14 text-xs" type="number" min={0} />
                </div>
              </div>
            </div>

            {/* Active chips */}
            {activeFilters > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/40">
                {typeFilter.map((t) => (
                  <span key={t} onClick={() => toggleType(t)} className="flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[11px] cursor-pointer hover:bg-primary/25">
                    {CARD_TYPES.find((x) => x.query === t)?.icon} {CARD_TYPES.find((x) => x.query === t)?.label ?? t} ×
                  </span>
                ))}
                {supertypeFilter && <span onClick={() => setSupertypeFilter("")} className="flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[11px] cursor-pointer hover:bg-primary/25">{supertypeFilter} ×</span>}
                {subtypeFilter && <span onClick={() => setSubtypeFilter("")} className="flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2 py-0.5 text-[11px] cursor-pointer hover:bg-accent/25">{subtypeFilter} ×</span>}
                {colorFilter.map((c) => <span key={c} onClick={() => toggleColor(c)} className="flex items-center gap-1 rounded-full bg-secondary text-foreground px-2 py-0.5 text-[11px] cursor-pointer hover:bg-secondary/60">{c} ×</span>)}
                {formatFilter && <span onClick={() => setFormatFilter("")} className="flex items-center gap-1 rounded-full bg-secondary text-foreground px-2 py-0.5 text-[11px] cursor-pointer">{formatFilter} ×</span>}
                {rarityFilter && <span onClick={() => setRarityFilter("")} className="flex items-center gap-1 rounded-full bg-secondary text-foreground px-2 py-0.5 text-[11px] cursor-pointer">{rarityFilter} ×</span>}
              </div>
            )}
          </div>
        )}
      </form>

      {!busy && results.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          {initial ? "No cards found. Try a different search." : "Cast a search above to summon results from the multiverse."}
        </div>
      )}

      {results.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {total.toLocaleString()} cards found · showing {results.length}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {results.map((c) => {
          const img    = getCardImage(c);
          const rarity = c.rarity ?? "common";
          return (
            <div key={c.id} className="group relative overflow-hidden rounded-xl border border-border bg-card p-3 card-hover">
              <button type="button" onClick={() => setOpenId(c.id)}
                className="block w-full aspect-[488/680] overflow-hidden rounded-md bg-secondary ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary">
                {img
                  ? <img src={img} alt={c.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  : <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">{c.name}</div>}
              </button>
              <div className="mt-3 space-y-1.5">
                <p className="line-clamp-1 font-fantasy text-sm font-semibold">{c.name}</p>
                <div className="flex items-center justify-between gap-1">
                  <Badge variant="outline" className={`text-[10px] uppercase ${RARITY_CLASS[rarity] ?? RARITY_CLASS.common}`}>{rarity}</Badge>
                  {c.prices?.usd && <span className="text-xs text-mana-green">${c.prices.usd}</span>}
                </div>
                <Button size="sm" variant="secondary" className="w-full h-8" disabled={adding === c.id} onClick={() => addToCollection(c)}>
                  {adding === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Plus className="h-3.5 w-3.5 mr-1" /> Add</>}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" className="border-border/60 px-8" disabled={loadingMore}
            onClick={() => runSearch(lastQ, page + 1)}>
            {loadingMore ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</> : "Load more results"}
          </Button>
        </div>
      )}

      <CardDetailModal cardId={openId} siblingIds={results.map((r) => r.id)} onChangeCardId={setOpenId} onClose={() => setOpenId(null)} />

      {/* Export dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-fantasy text-xl text-gradient-gold flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" /> Export Search Results
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {allResults.length > 0 ? `${allResults.length} cards` : `${results.length} cards (visible page)`} · Choose format then copy or download.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Format selector */}
            <div className="flex gap-2">
              {([
                { id: "arena", icon: <FileText className="h-3.5 w-3.5" />, label: "Arena / MTGO" },
                { id: "csv",   icon: <FileText className="h-3.5 w-3.5" />, label: "CSV" },
                { id: "text",  icon: <FileText className="h-3.5 w-3.5" />, label: "Plain text" },
              ] as const).map((f) => (
                <button key={f.id} type="button" onClick={() => setExportFmt(f.id)}
                  className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                    exportFmt === f.id ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/30"
                  )}>
                  {f.icon}{f.label}
                </button>
              ))}
            </div>

            <Textarea value={exportText} readOnly className="min-h-[240px] font-mono text-xs bg-secondary/40 border-border/60 resize-none" />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={downloadExport} className="border-border/60">
                <Download className="mr-1.5 h-4 w-4" /> Download
              </Button>
              <Button onClick={copyExport} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
                {copied ? <><Check className="mr-1.5 h-4 w-4" /> Copied!</> : <><Copy className="mr-1.5 h-4 w-4" /> Copy</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
