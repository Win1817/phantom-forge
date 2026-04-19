import { AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, description,
  confirmLabel = "Delete", cancelLabel = "Cancel",
  destructive = true, onConfirm, onCancel,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm border-border bg-card">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            {destructive && (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/15 ring-1 ring-destructive/30">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </span>
            )}
            <div>
              <DialogTitle className="font-fantasy text-lg leading-tight">{title}</DialogTitle>
              <DialogDescription className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            className="flex-1 border-border/60"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            className={`flex-1 ${
              destructive
                ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                : "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90"
            }`}
            onClick={() => { onConfirm(); onCancel(); }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
