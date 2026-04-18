import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export function Logo({ className, showText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative flex-shrink-0">
        <div className="absolute inset-0 rounded-lg bg-primary/20 blur-md animate-glow-pulse" aria-hidden />
        <img
          src="/logo.png"
          alt="PhantomMTG"
          className="relative h-9 w-auto object-contain"
          style={{ maxWidth: showText ? "36px" : "36px" }}
        />
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

