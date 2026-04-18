import { cn } from "@/lib/utils";

interface ManaSymbolProps {
  symbol: "W" | "U" | "B" | "R" | "G" | "C";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const styles: Record<ManaSymbolProps["symbol"], string> = {
  W: "bg-mana-white text-amber-900 shadow-[0_0_12px_hsl(48_90%_75%_/_0.45)]",
  U: "bg-mana-blue text-white shadow-[0_0_12px_hsl(210_90%_60%_/_0.55)]",
  B: "bg-mana-black text-white shadow-[0_0_12px_hsl(270_30%_25%_/_0.6)]",
  R: "bg-mana-red text-white shadow-[0_0_12px_hsl(8_85%_58%_/_0.55)]",
  G: "bg-mana-green text-white shadow-[0_0_12px_hsl(135_55%_48%_/_0.5)]",
  C: "bg-mana-colorless text-foreground shadow-[0_0_10px_hsl(240_8%_65%_/_0.4)]",
};

const sizes = {
  sm: "h-5 w-5 text-[10px]",
  md: "h-7 w-7 text-xs",
  lg: "h-9 w-9 text-sm",
};

export function ManaSymbol({ symbol, size = "md", className }: ManaSymbolProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold ring-1 ring-black/30",
        styles[symbol],
        sizes[size],
        className,
      )}
      aria-label={`Mana ${symbol}`}
    >
      {symbol}
    </span>
  );
}

export function ManaPie({ className }: { className?: string }) {
  return (
    <div className={cn("flex gap-1", className)}>
      {(["W", "U", "B", "R", "G"] as const).map((s) => (
        <ManaSymbol key={s} symbol={s} size="sm" />
      ))}
    </div>
  );
}
