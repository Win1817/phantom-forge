import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

const SHORTCUTS = [
  { keys: ["⌘", "K"], desc: "Global card search" },
  { keys: ["1"], desc: "Dashboard" },
  { keys: ["2"], desc: "Collection" },
  { keys: ["3"], desc: "Card Search" },
  { keys: ["4"], desc: "Decks" },
  { keys: ["5"], desc: "AI Decksmith" },
  { keys: ["←", "→"], desc: "Navigate cards in modal" },
  { keys: ["?"], desc: "Show this help" },
  { keys: ["Esc"], desc: "Close modal / overlay" },
];

export function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("phantom:shortcuts-help", handler);
    return () => window.removeEventListener("phantom:shortcuts-help", handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm border-border bg-card">
        <DialogTitle className="font-fantasy text-lg text-gradient-gold flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-primary" /> Keyboard Shortcuts
        </DialogTitle>
        <DialogDescription className="sr-only">Available keyboard shortcuts</DialogDescription>
        <div className="space-y-2 pt-1">
          {SHORTCUTS.map((s) => (
            <div key={s.desc} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
              <span className="text-sm text-muted-foreground">{s.desc}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded border border-border bg-secondary px-1.5 text-[10px] font-mono font-semibold text-foreground">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
