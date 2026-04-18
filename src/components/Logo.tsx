import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export function Logo({ className, showText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative">
        <div className="absolute inset-0 rounded-lg bg-primary/30 blur-md animate-glow-pulse" aria-hidden />
        <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-arcane ring-1 ring-primary/40">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
      </div>
      {showText && (
        <div className="leading-none">
          <div className="font-fantasy text-lg font-bold tracking-wide text-gradient-gold">PhantomMTG</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Arcane Inventory</div>
        </div>
      )}
    </div>
  );
}
