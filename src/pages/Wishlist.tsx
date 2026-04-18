import { useEffect, useState } from "react";
import { Heart, Plus, Trash2, Search, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { searchCards, getCardImage, type ScryfallCard } from "@/lib/scryfall";
import CardDetailModal from "@/components/CardDetailModal";

interface WishlistEntry {
  id: string;
  scryfall_id: string;
  card_name: string;
  image_url: string | null;
  price_usd: number | null;
  rarity: string | null;
  set_name: string | null;
  notes: string | null;
}

const RARITY_CLASS: Record<string, string> = {
  common: "border-rarity-common/40 text-rarity-common",
  uncommon: "border-rarity-uncommon/50 text-rarity-uncommon",
  rare: "border-rarity-rare/60 text-rarity-rare",
  mythic: "border-rarity-mythic/60 text-rarity-mythic",
};

export default function Wishlist() {
  const { user } = useAuth();
  const [items, setItems] = useState<WishlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  // Search to add
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScryfallCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  // Owned scryfall IDs from collection
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());

  useEffect(() => { if (user) load(); }, [user]);

  const load = async () => {
    setLoading(true);
    const [{ data: wishlistData }, { data: collectionData }] = await Promise.all([
      supabase.from("wishlist_cards").select("*").order("created_at", { ascending: false }),
      supabase.from("collection_cards").select("scryfall_id"),
    ]);
    setItems(wishlistData ?? []);
    setOwnedIds(new Set((collectionData ?? []).map((c) => c.scryfall_id)));
    setLoading(false);
  };

  const runSearch = async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const { data } = await searchCards(q);
      setResults(data.slice(0, 8));
    } catch { toast.error("Search failed"); }
    setSearching(false);
  };

  const addToWishlist = async (card: ScryfallCard) => {
    if (!user) return;
    if (items.find((i) => i.scryfall_id === card.id)) {
      toast.info(`${card.name} is already on your wishlist`);
      return;
    }
    setAdding(card.id);
    const { error } = await supabase.from("wishlist_cards").insert({
      user_id: user.id,
      scryfall_id: card.id,
      card_name: card.name,
      image_url: getCardImage(card),
      price_usd: card.prices?.usd ? Number(card.prices.usd) : null,
      rarity: card.rarity ?? null,
      set_name: card.set_name ?? null,
    });
    setAdding(null);
    if (error) toast.error(error.message);
    else { toast.success(`${card.name} added to wishlist`); load(); }
  };

  const addToCollection = async (item: WishlistEntry) => {
    if (!user) return;
    const { error } = await supabase.from("collection_cards").insert({
      user_id: user.id,
      scryfall_id: item.scryfall_id,
      card_name: item.card_name,
      image_url: item.image_url,
      price_usd: item.price_usd,
      rarity: item.rarity,
      set_name: item.set_name,
      quantity: 1,
    });
    if (error) { toast.error(error.message); return; }
    setOwnedIds((prev) => new Set([...prev, item.scryfall_id]));
    toast.success(`${item.card_name} added to collection`);
  };

  const removeItem = async (id: string, name: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from("wishlist_cards").delete().eq("id", id);
    toast.success(`${name} removed from wishlist`);
  };

  const totalWant = items.reduce((s, i) => s + Number(i.price_usd ?? 0), 0);
  const missingItems = items.filter((i) => !ownedIds.has(i.scryfall_id));
  const missingCost  = missingItems.reduce((s, i) => s + Number(i.price_usd ?? 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-1">
        <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">Wishlist & Trades</h1>
        <p className="text-sm text-muted-foreground">
          {items.length} cards · ${totalWant.toFixed(2)} total · ${missingCost.toFixed(2)} still needed
        </p>
      </div>

      {/* Summary cards */}
      {items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Wanted</p>
              <p className="font-fantasy text-2xl font-semibold mt-1">{items.length}</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Total cost</p>
              <p className="font-fantasy text-2xl font-semibold mt-1 text-mana-green">${totalWant.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="border-primary/20 bg-arcane">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Still missing</p>
              <p className="font-fantasy text-2xl font-semibold mt-1 text-primary">${missingCost.toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="font-fantasy text-base flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> Add to wishlist
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch(query)}
                placeholder="Search for a card to add…"
                className="pl-9 bg-secondary/40 border-border/60"
              />
            </div>
            <Button onClick={() => runSearch(query)} disabled={searching} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </div>
          {results.length > 0 && (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {results.map((card) => (
                <div key={card.id} className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-secondary/30 p-2 hover:bg-secondary/50 transition-colors">
                  {card.image_uris?.small && <img src={card.image_uris.small} alt={card.name} className="h-10 w-7 rounded object-cover shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-fantasy text-sm font-semibold truncate">{card.name}</p>
                    <p className="text-xs text-muted-foreground">{card.set_name}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {card.prices?.usd && <span className="text-xs text-mana-green">${card.prices.usd}</span>}
                    <Button size="sm" className="h-7 text-xs bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90" disabled={adding === card.id || items.some((i) => i.scryfall_id === card.id)} onClick={() => addToWishlist(card)}>
                      {adding === card.id ? <Loader2 className="h-3 w-3 animate-spin" /> : items.some((i) => i.scryfall_id === card.id) ? "Added" : <><Heart className="h-3 w-3 mr-1" /> Want</>}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wishlist grid */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading wishlist…</p>
      ) : items.length === 0 ? (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-arcane ring-1 ring-primary/30">
              <Heart className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-fantasy text-lg">Your wishlist is empty</h3>
            <p className="max-w-sm text-sm text-muted-foreground">Search for cards above to start tracking what you want.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => {
            const owned = ownedIds.has(item.scryfall_id);
            return (
              <Card key={item.id} className={`group overflow-hidden border-border bg-card card-hover ${owned ? "opacity-60" : ""}`}>
                <button type="button" onClick={() => setOpenId(item.scryfall_id)} className="block w-full aspect-[488/680] overflow-hidden bg-secondary focus:outline-none focus:ring-2 focus:ring-primary">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.card_name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">{item.card_name}</div>
                  )}
                </button>
                <CardContent className="space-y-2 p-3">
                  <p className="line-clamp-1 font-fantasy text-sm font-semibold">{item.card_name}</p>
                  <div className="flex items-center justify-between">
                    {item.rarity && <Badge variant="outline" className={`text-[10px] uppercase ${RARITY_CLASS[item.rarity] ?? ""}`}>{item.rarity}</Badge>}
                    {item.price_usd && <span className="text-xs text-mana-green">${Number(item.price_usd).toFixed(2)}</span>}
                  </div>
                  {owned ? (
                    <p className="text-xs text-mana-green font-semibold">✓ In collection</p>
                  ) : (
                    <Button size="sm" variant="secondary" className="w-full h-7 text-xs" onClick={() => addToCollection(item)}>
                      <Plus className="h-3 w-3 mr-1" /> Add to collection
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeItem(item.id, item.card_name)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CardDetailModal cardId={openId} siblingIds={items.map((i) => i.scryfall_id)} onChangeCardId={setOpenId} onClose={() => setOpenId(null)} />
    </div>
  );
}
