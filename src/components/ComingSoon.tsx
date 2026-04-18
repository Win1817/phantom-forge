import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface ComingSoonProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  cta?: { label: string; to: string };
}

export function ComingSoon({ title, description, icon: Icon, cta }: ComingSoonProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">{title}</h1>
      <Card className="relative overflow-hidden border-primary/20 bg-arcane">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.2),transparent_60%)]" />
        <CardContent className="relative flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-card ring-1 ring-primary/40 glow-gold">
            <Icon className="h-7 w-7 text-primary" />
          </div>
          <h2 className="font-fantasy text-2xl">{title} is being forged</h2>
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
          {cta && (
            <Button asChild className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
              <Link to={cta.to}>{cta.label}</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
