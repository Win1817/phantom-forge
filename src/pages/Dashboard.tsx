import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Library, LayersIcon, DollarSign, Sparkles, Plus, Wand2, Search, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ManaPie } from "@/components/ManaSymbol";
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { generateDeck } from "@/lib/gemini";

interface Stats {
  totalCards: number;
  uniqueCards: number;
  estValue: number;
  deckCount: number;
}

// Simulated historical value snapshots stored in localStorage
function getValueHistory(userId: string, currentValue: number) {
  const key = `pf_value_${userId}`;
  const raw = localStorage.getItem(key);
  const history: { date: string; value: number }[] = raw ? JSON.parse(raw) : [];
  const today = new Date().toLocaleDateString("en-US", { month:"short", day:"numeric" });
  if (!history.length || history[history.length - 1].date !== today) {
    history.push({ date: today, value: currentValue });
    if (history.length > 14) history.shift();
    localStorage.setItem(key, JSON.stringify(history));
  }
  return history;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ totalCards: 0, uniqueCards: 0, estValue: 0, deckCount: 0 });
  const [recent, setRecent] = useState<{ id: string; card_name: string; image_url: string | null; set_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [valueHistory, setValueHistory] = useState<{ date: string; value: number }[]>([]);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: cards }, { count: deckCount }] = await Promise.all([
        supabase.from("collection_cards")
          .select("id, card_name, image_url, set_name, quantity, price_usd, created_at, colors, type_line")
          .order("created_at", { ascending: false }),
        supabase.from("decks").select("*", { count: "exact", head: true }),
      ]);
      const list = cards ?? [];
      const totalCards = list.reduce((s, c) => s + (c.quantity ?? 1), 0);
      const estValue = list.reduce((s, c) => s + Number(c.price_usd ?? 0) * (c.quantity ?? 1), 0);
      setStats({ totalCards, uniqueCards: list.length, estValue, deckCount: deckCount ?? 0 });
      setRecent(list.slice(0, 6));
      setValueHistory(getValueHistory(user.id, estValue));
      setLoading(false);

      // Load daily insight from sessionStorage to avoid re-calling every mount
      const cacheKey = `pf_insight_${user.id}_${new Date().toDateString()}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) { setInsight(cached); return; }
      if (list.length >= 5) {
        setInsightLoading(true);
        try {
          const topCards = list.slice(0, 15).map((c) => c.card_name).join(", ");
          const { description } = await generateDeck({
            format: "casual",
            style: "combo",
            colors: [],
            budget: "any",
            notes: `Give me ONE short tip (2 sentences max) about synergies or upgrade ideas for a collection containing: ${topCards}. Reply as plain text, no JSON.`,
          });
          const tip = description || "Keep exploring the multiverse — your collection is growing!";
          setInsight(tip);
          sessionStorage.setItem(cacheKey, tip);
        } catch {
          setInsight(null);
        } finally {
          setInsightLoading(false);
        }
      }
    })();
  }, [user]);

  const greetingName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Planeswalker";
  const valueTrend = valueHistory.length >= 2
    ? valueHistory[valueHistory.length - 1].value - valueHistory[0].value
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-1">
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Welcome back</p>
        <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">{greetingName}</h1>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Library}    label="Total cards"  value={stats.totalCards.toLocaleString()} accent="text-mana-blue" />
        <StatCard icon={Sparkles}   label="Unique cards" value={stats.uniqueCards.toLocaleString()} accent="text-primary" />
        <StatCard icon={DollarSign} label="Est. value"   value={`$${stats.estValue.toFixed(2)}`} accent="text-mana-green" />
        <StatCard icon={LayersIcon} label="Decks built"  value={stats.deckCount.toString()} accent="text-mana-red" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent additions */}
        <Card className="lg:col-span-2 border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-fantasy">Recent additions</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link to="/app/collection">View all</Link></Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : recent.length === 0 ? (
              <EmptyAdditions />
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {recent.map((c) => (
                  <Link key={c.id} to="/app/collection" className="group block">
                    <div className="aspect-[488/680] overflow-hidden rounded-md bg-secondary ring-1 ring-border transition-all group-hover:ring-primary/60 group-hover:shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.5)]">
                      {c.image_url ? (
                        <img src={c.image_url} alt={c.card_name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">{c.card_name}</div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Decksmith promo */}
        <Card className="border-primary/30 bg-arcane relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,hsl(var(--primary)/0.25),transparent_60%)]" />
          <CardHeader className="relative">
            <CardTitle className="font-fantasy text-gradient-gold flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" /> AI Decksmith
            </CardTitle>
          </CardHeader>
          <CardContent className="relative space-y-4">
            <p className="text-sm text-muted-foreground">Let arcane intelligence build the strongest deck possible from cards you already own.</p>
            <ManaPie />
            <Button asChild className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
              <Link to="/app/decksmith">Summon a deck</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Value trend + AI insight row */}
      {!loading && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Collection value chart */}
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-fantasy text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-mana-green" /> Collection value
              </CardTitle>
              {valueHistory.length >= 2 && (
                <span className={`text-xs font-semibold ${valueTrend >= 0 ? "text-mana-green" : "text-destructive"}`}>
                  {valueTrend >= 0 ? "+" : ""}${valueTrend.toFixed(2)}
                </span>
              )}
            </CardHeader>
            <CardContent>
              {valueHistory.length >= 2 ? (
                <ResponsiveContainer width="100%" height={80}>
                  <LineChart data={valueHistory}>
                    <XAxis dataKey="date" tick={{ fontSize:9, fill:"hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius:6, fontSize:11 }}
                      formatter={(v: number) => [`$${v.toFixed(2)}`, "Value"]}
                    />
                    <Line type="monotone" dataKey="value" stroke="hsl(var(--mana-green))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground py-4">Value trend will appear after multiple sessions.</p>
              )}
            </CardContent>
          </Card>

          {/* AI daily insight */}
          <Card className="border-primary/20 bg-arcane relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,hsl(var(--primary)/0.15),transparent_60%)]" />
            <CardHeader className="relative pb-2">
              <CardTitle className="font-fantasy text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Daily Insight
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              {insightLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consulting the arcane archives…
                </div>
              ) : insight ? (
                <p className="text-sm text-muted-foreground leading-relaxed">{insight}</p>
              ) : stats.uniqueCards < 5 ? (
                <p className="text-sm text-muted-foreground">Add at least 5 cards to unlock daily AI insights.</p>
              ) : (
                <p className="text-sm text-muted-foreground">No insight available today.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <QuickAction to="/app/search"     icon={Search}     title="Search any card" desc="The full multiverse via Scryfall" />
        <QuickAction to="/app/collection" icon={Plus}       title="Add to inventory" desc="Track quantity, foil, and condition" />
        <QuickAction to="/app/decks"      icon={LayersIcon} title="Build a deck" desc="Commander, Standard, Modern, more" />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; accent: string }) {
  return (
    <Card className="border-border bg-card card-hover">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg bg-secondary ring-1 ring-border ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="font-fantasy text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyAdditions() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-arcane ring-1 ring-primary/30">
        <Library className="h-5 w-5 text-primary" />
      </div>
      <p className="text-sm text-muted-foreground">Your grimoire is empty. Search the multiverse and add your first card.</p>
      <Button asChild size="sm" className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
        <Link to="/app/search">Find cards</Link>
      </Button>
    </div>
  );
}

function QuickAction({ to, icon: Icon, title, desc }: { to: string; icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <Link to={to} className="group block rounded-xl border border-border bg-card p-5 card-hover">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-arcane ring-1 ring-primary/20 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-fantasy font-semibold group-hover:text-primary transition-colors">{title}</h3>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </Link>
  );
}
