import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus, LayersIcon, Upload, Download, Copy, Check,
  Trash2, Loader2, ChevronRight, Swords
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { parseDeckText, exportDeckText, resolveCard } from "@/lib/deckImportExport";
import { getCardImage } from "@/lib/scryfall";

interface Deck {
  id: string;
  name: string;
  format: string;
  description: string | null;
  colors: string[] | null;
  cover_image_url: string | null;
  created_at: string;
  card_count?: number;
}

const FORMAT_LABELS: Record<string, string> = {
  standard: "Standard", pioneer: "Pioneer", modern: "Modern",
  legacy: "Legacy", vintage: "Vintage", commander: "Commander",
  pauper: "Pauper", brawl: "Brawl", casual: "Casual",
};

const MANA_COLOR: Record<string, string> = {
  W: "bg-mana-white text-amber-900",
  U: "bg-mana-blue text-white",
  B: "bg-mana-black text-white",
  R: "bg-mana-red text-white",
  G: "bg-mana-green text-white",
};

export default function Decks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [importFormat, setImportFormat] = useState("casual");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [exportOpen, setExportOpen] = useState(false);
  const [exportText, setExportText] = useState("");
  const [exportDeckName, setExportDeckName] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => { if (user) load(); }, [user]);

  const load = async () => {
    setLoading(true);
    const { data: deckRows } = await supabase
      .from("decks").select("*").order("created_at", { ascending: false });
    if (!deckRows) { setLoading(false); return; }

    // Get card counts
    const ids = deckRows.map((d) => d.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: cardRows } = await supabase
        .from("deck_cards")
        .select("deck_id, quantity")
        .in("deck_id", ids);
      (cardRows ?? []).forEach((r) => {
        counts[r.deck_id] = (counts[r.deck_id] ?? 0) + r.quantity;
      });
    }

    setDecks(deckRows.map((d) => ({ ...d, card_count: counts[d.id] ?? 0 })));
    setLoading(false);
  };

  const requestDelete = (id: string, name: string) => {
    setPendingDelete({ id, name });
    setConfirmOpen(true);
  };

  const deleteDeck = async () => {
    if (!pendingDelete) return;
    const { id, name } = pendingDelete;
    await supabase.from("deck_cards").delete().eq("deck_id", id);
    await supabase.from("decks").delete().eq("id", id);
    setDecks((prev) => prev.filter((d) => d.id !== id));
    toast.success(`"${name}" deleted`);
    setPendingDelete(null);
  };

  const openExport = async (deck: Deck) => {
    const { data: cards } = await supabase
      .from("deck_cards")
      .select("quantity, card_name, set_code, collector_number, is_sideboard, is_commander")
      .eq("deck_id", deck.id);
    const main = (cards ?? []).filter((c) => !c.is_sideboard);
    const side = (cards ?? []).filter((c) => c.is_sideboard);
    setExportText(exportDeckText(deck.name, main, side));
    setExportDeckName(deck.name);
    setExportOpen(true);
    setCopied(false);
  };

  const exportTextareaRef = useRef<HTMLTextAreaElement>(null);

  const copyExport = () => {
    const el = exportTextareaRef.current;
    if (!el) return;
    // Remove readOnly temporarily so mobile can select
    el.removeAttribute("readonly");
    el.focus();
    el.select();
    el.setSelectionRange(0, el.value.length); // iOS
    const ok = document.execCommand("copy");
    el.setAttribute("readonly", "true");
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      // Last resort: modern clipboard API
      navigator.clipboard?.writeText(exportText).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }).catch(() => toast.error("Copy failed — please select and copy manually"));
    }
  };

  const downloadExport = () => {
    const blob = new Blob([exportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportDeckName.replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!importText.trim()) { toast.error("Paste a deck list first"); return; }
    if (!user) return;
    setImporting(true);

    try {
      const parsed = parseDeckText(importText);
      const deckName = importName.trim() || parsed.name;

      // Create deck row
      const { data: deck, error: deckErr } = await supabase
        .from("decks")
        .insert({ user_id: user.id, name: deckName, format: importFormat })
        .select()
        .single();
      if (deckErr || !deck) throw new Error(deckErr?.message ?? "Failed to create deck");

      const allLines = [
        ...parsed.main.map((l) => ({ ...l, isCommander: false, isSideboard: false })),
        ...parsed.sideboard.map((l) => ({ ...l, isCommander: false, isSideboard: true })),
        ...(parsed.commander ? [{ ...parsed.commander, isCommander: true, isSideboard: false }] : []),
      ];

      setImportProgress({ current: 0, total: allLines.length });

      const cardInserts = [];
      for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i];
        setImportProgress({ current: i + 1, total: allLines.length });

        const card = await resolveCard(line);
        cardInserts.push({
          deck_id: deck.id,
          scryfall_id: card?.id ?? "unknown",
          card_name: line.name,
          quantity: line.quantity,
          set_code: line.set ?? card?.set ?? null,
          image_url: card ? getCardImage(card) : null,
          mana_cost: card?.mana_cost ?? null,
          cmc: card?.cmc ?? null,
          type_line: card?.type_line ?? null,
          colors: card?.colors ?? [],
          is_commander: line.isCommander,
          is_sideboard: line.isSideboard,
        });
      }

      if (cardInserts.length) {
        const { error: insertErr } = await supabase.from("deck_cards").insert(cardInserts);
        if (insertErr) throw new Error(insertErr.message);
      }

      // Auto-sync to collection: upsert each unique card by scryfall_id
      const uniqueCards = Object.values(
        cardInserts.reduce((acc, c) => {
          if (c.scryfall_id === "unknown") return acc;
          if (!acc[c.scryfall_id]) acc[c.scryfall_id] = { ...c, total: 0 };
          acc[c.scryfall_id].total += c.quantity;
          return acc;
        }, {} as Record<string, typeof cardInserts[0] & { total: number }>)
      );

      for (const c of uniqueCards) {
        const { data: existing } = await supabase
          .from("collection_cards")
          .select("id, quantity")
          .eq("user_id", user.id)
          .eq("scryfall_id", c.scryfall_id)
          .maybeSingle();

        if (existing) {
          await supabase.from("collection_cards")
            .update({ quantity: existing.quantity + c.total })
            .eq("id", existing.id);
        } else {
          await supabase.from("collection_cards").insert({
            user_id: user.id,
            scryfall_id: c.scryfall_id,
            card_name: c.card_name,
            set_code: c.set_code ?? null,
            image_url: c.image_url ?? null,
            mana_cost: c.mana_cost ?? null,
            cmc: c.cmc ?? null,
            type_line: c.type_line ?? null,
            colors: c.colors ?? [],
            quantity: c.total,
          });
        }
      }

      toast.success(`"${deckName}" imported — ${cardInserts.length} cards added to deck & collection`);
      setImportOpen(false);
      setImportText("");
      setImportName("");
      load();
      navigate(`/app/decks/${deck.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">Deck Workshop</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {decks.length} deck{decks.length !== 1 ? "s" : ""} in your forge
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="border-border/60 hover:border-primary/40"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="mr-1.5 h-4 w-4" /> Import deck
          </Button>
          <Button asChild className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
            <Link to="/app/decksmith"><Plus className="mr-1.5 h-4 w-4" /> AI Decksmith</Link>
          </Button>
        </div>
      </div>

      {/* Deck grid */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading decks…
        </div>
      ) : decks.length === 0 ? (
        <EmptyState onImport={() => setImportOpen(true)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              onOpen={() => navigate(`/app/decks/${deck.id}`)}
              onExport={() => openExport(deck)}
              onDelete={() => requestDelete(deck.id, deck.name)}
            />
          ))}
        </div>
      )}

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-fantasy text-xl text-gradient-gold flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" /> Import Deck
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Paste a deck list in Arena / MTGO format. Each line: <code className="text-primary text-xs bg-secondary px-1 rounded">4 Lightning Bolt (M11) 149</code>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Deck name</Label>
                <Input
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  placeholder="Auto-detect from list…"
                  className="bg-secondary/40 border-border/60"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Format</Label>
                <select
                  value={importFormat}
                  onChange={(e) => setImportFormat(e.target.value)}
                  className="w-full h-9 rounded-md border border-border/60 bg-secondary/40 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {Object.entries(FORMAT_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Deck list</Label>
              <Textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`Deck\n4 Lightning Bolt (M11) 149\n4 Goblin Guide (ZEN) 136\n...\n\nSideboard\n2 Smash to Smithereens (SHM) 106`}
                className="min-h-[220px] font-mono text-xs bg-secondary/40 border-border/60 resize-none"
              />
            </div>

            {importing && importProgress.total > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Resolving cards via Scryfall…</span>
                  <span>{importProgress.current} / {importProgress.total}</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-primary-glow rounded-full transition-all duration-300"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || !importText.trim()}
                className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90"
              >
                {importing ? (
                  <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Importing…</>
                ) : (
                  <><Upload className="mr-1.5 h-4 w-4" /> Import</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title={`Delete "${pendingDelete?.name}"?`}
        description="This will permanently remove the deck and all its cards. This cannot be undone."
        confirmLabel="Delete deck"
        onConfirm={deleteDeck}
        onCancel={() => { setConfirmOpen(false); setPendingDelete(null); }}
      />

      {/* Export Dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-fantasy text-xl text-gradient-gold flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" /> Export — {exportDeckName}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Arena / MTGO format. Copy or download to use in your client.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <Textarea
              ref={exportTextareaRef}
              value={exportText}
              readOnly
              className="min-h-[260px] font-mono text-xs bg-secondary/40 border-border/60 resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={downloadExport} className="border-border/60">
                <Download className="mr-1.5 h-4 w-4" /> Download .txt
              </Button>
              <Button
                onClick={copyExport}
                className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90"
              >
                {copied ? <><Check className="mr-1.5 h-4 w-4" /> Copied!</> : <><Copy className="mr-1.5 h-4 w-4" /> Copy</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeckCard({ deck, onOpen, onExport, onDelete }: { deck: Deck; onOpen: () => void; onExport: () => void; onDelete: () => void }) {
  return (
    <Card className="group overflow-hidden border-border bg-card card-hover relative cursor-pointer" onClick={onOpen}>
      {/* Cover image or gradient placeholder */}
      <div className="aspect-[16/6] overflow-hidden bg-arcane relative">
        {deck.cover_image_url ? (
          <img src={deck.cover_image_url} alt={deck.name} className="h-full w-full object-cover object-top opacity-70" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,hsl(var(--primary)/0.3),transparent_70%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />

        {/* Colors */}
        {deck.colors && deck.colors.length > 0 && (
          <div className="absolute top-2 right-2 flex gap-1">
            {deck.colors.map((c) => (
              <span key={c} className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ring-1 ring-black/30 ${MANA_COLOR[c] ?? "bg-mana-colorless text-foreground"}`}>
                {c}
              </span>
            ))}
          </div>
        )}
      </div>

      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="font-fantasy font-semibold text-base line-clamp-1 group-hover:text-primary transition-colors">
            {deck.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[10px] uppercase border-border/60 text-muted-foreground">
              {FORMAT_LABELS[deck.format] ?? deck.format}
            </Badge>
            {deck.card_count != null && (
              <span className="text-xs text-muted-foreground">{deck.card_count} cards</span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onExport(); }}
          >
            <Download className="mr-1 h-3.5 w-3.5" /> Export
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <Card className="border-dashed border-border bg-card">
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-arcane ring-1 ring-primary/30">
          <Swords className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h3 className="font-fantasy text-xl">No decks yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Import an existing deck list or let the AI Decksmith craft one from your collection.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onImport} className="border-border/60">
            <Upload className="mr-1.5 h-4 w-4" /> Import deck
          </Button>
          <Button asChild className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
            <Link to="/app/decksmith"><LayersIcon className="mr-1.5 h-4 w-4" /> AI Decksmith</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
