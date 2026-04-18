import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search as SearchIcon, Plus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { searchCards, getCardImage, primeCardCache, type ScryfallCard } from "@/lib/scryfall";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import CardDetailModal from "@/components/CardDetailModal";

const RARITY_CLASS: Record<string, string> = {
  common: "border-rarity-common/40 text-rarity-common",
  uncommon: "border-rarity-uncommon/50 text-rarity-uncommon",
  rare: "border-rarity-rare/60 text-rarity-rare",
  mythic: "border-rarity-mythic/60 text-rarity-mythic",
};

const CardSearch = () => {
  const [params, setParams] = useSearchParams();
  const initial = params.get("q") ?? "";
  const [query, setQuery] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ScryfallCard[]>([]);
  const [total, setTotal] = useState(0);
  const [adding, setAdding] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (initial) void runSearch(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = async (q: string) => {
    setBusy(true);
    try {
      const { data, total } = await searchCards(q);
      data.forEach(primeCardCache);
      setResults(data);
      setTotal(total);
    } catch (e) {
      toast.error("Scryfall search failed");
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setParams({ q: query });
    void runSearch(query);
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">Multiverse Search</h1>
        <p className="mt-1 text-sm text-muted-foreground">Browse every Magic card via Scryfall. Add directly to your inventory.</p>
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Try: "lightning bolt", t:dragon r:mythic, c:gw cmc<=3'
            className="h-11 pl-9 text-base"
            autoFocus
          />
        </div>
        <Button type="submit" disabled={busy} className="h-11 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 px-6">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </Button>
      </form>

      {!busy && results.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          {initial ? "No cards found." : "Cast a search above to summon results from the multiverse."}
        </div>
      )}

      {results.length > 0 && (
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{total.toLocaleString()} cards found · showing {results.length}</p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {results.map((c) => {
          const img = getCardImage(c);
          const rarity = c.rarity ?? "common";
          return (
            <div key={c.id} className="group relative overflow-hidden rounded-xl border border-border bg-card p-3 card-hover">
              <button
                type="button"
                onClick={() => setOpenId(c.id)}
                className="block w-full aspect-[488/680] overflow-hidden rounded-md bg-secondary ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label={`Open ${c.name} details`}
              >
                {img ? (
                  <img src={img} alt={c.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">{c.name}</div>
                )}
              </button>
              <div className="mt-3 space-y-1.5">
                <p className="line-clamp-1 font-fantasy text-sm font-semibold">{c.name}</p>
                <div className="flex items-center justify-between gap-1">
                  <Badge variant="outline" className={`text-[10px] uppercase ${RARITY_CLASS[rarity] ?? RARITY_CLASS.common}`}>
                    {rarity}
                  </Badge>
                  {c.prices?.usd && <span className="text-xs text-mana-green">${c.prices.usd}</span>}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full h-8"
                  disabled={adding === c.id}
                  onClick={() => addToCollection(c)}
                >
                  {adding === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Plus className="h-3.5 w-3.5 mr-1" /> Add</>}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <CardDetailModal
        cardId={openId}
        siblingIds={results.map((r) => r.id)}
        onChangeCardId={setOpenId}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
};

export default CardSearch;
