import { useEffect, useState } from "react";
import { Trash2, Minus, Plus, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { toast } from "sonner";

interface CollectionCard {
  id: string;
  card_name: string;
  set_name: string | null;
  rarity: string | null;
  image_url: string | null;
  quantity: number;
  price_usd: number | null;
  foil: boolean;
}

const RARITY_CLASS: Record<string, string> = {
  common: "border-rarity-common/40 text-rarity-common",
  uncommon: "border-rarity-uncommon/50 text-rarity-uncommon",
  rare: "border-rarity-rare/60 text-rarity-rare",
  mythic: "border-rarity-mythic/60 text-rarity-mythic",
};

const Collection = () => {
  const { user } = useAuth();
  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("collection_cards")
      .select("id, card_name, set_name, rarity, image_url, quantity, price_usd, foil")
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

  const filtered = cards.filter((c) => c.card_name.toLowerCase().includes(filter.toLowerCase()));
  const totalCards = cards.reduce((s, c) => s + c.quantity, 0);
  const totalValue = cards.reduce((s, c) => s + Number(c.price_usd ?? 0) * c.quantity, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">Your Grimoire</h1>
          <p className="mt-1 text-sm text-muted-foreground">{totalCards.toLocaleString()} cards · ${totalValue.toFixed(2)} estimated value</p>
        </div>
        <Button asChild className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
          <Link to="/app/search"><Plus className="mr-1.5 h-4 w-4" /> Add cards</Link>
        </Button>
      </div>

      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter your collection…"
        className="max-w-sm"
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading collection…</p>
      ) : cards.length === 0 ? (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-arcane ring-1 ring-primary/30">
              <Library className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-fantasy text-lg">An empty grimoire</h3>
            <p className="max-w-sm text-sm text-muted-foreground">Search the multiverse and start adding cards. Your collection unlocks the AI Decksmith.</p>
            <Button asChild className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
              <Link to="/app/search">Find your first card</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((c) => (
            <Card key={c.id} className="group overflow-hidden border-border bg-card card-hover">
              <div className="aspect-[488/680] overflow-hidden bg-secondary">
                {c.image_url ? (
                  <img src={c.image_url} alt={c.card_name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">{c.card_name}</div>
                )}
              </div>
              <CardContent className="space-y-2 p-3">
                <p className="line-clamp-1 font-fantasy text-sm font-semibold">{c.card_name}</p>
                <div className="flex items-center justify-between">
                  {c.rarity && (
                    <Badge variant="outline" className={`text-[10px] uppercase ${RARITY_CLASS[c.rarity] ?? RARITY_CLASS.common}`}>
                      {c.rarity}
                    </Badge>
                  )}
                  {c.price_usd && <span className="text-xs text-mana-green">${Number(c.price_usd).toFixed(2)}</span>}
                </div>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Collection;
