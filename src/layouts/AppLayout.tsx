import { Outlet, useNavigate, NavLink, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { LogOut, Search, LayoutDashboard, Library, LayersIcon, Sparkles, Heart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { ShortcutHelp } from "@/components/ShortcutHelp";
import { useState } from "react";
import { cn } from "@/lib/utils";

const mobileNav = [
  { title: "Dashboard", url: "/app",             icon: LayoutDashboard },
  { title: "Collection", url: "/app/collection", icon: Library },
  { title: "Decks",      url: "/app/decks",      icon: LayersIcon },
  { title: "Decksmith",  url: "/app/decksmith",  icon: Sparkles },
  { title: "Wishlist",   url: "/app/wishlist",   icon: Heart },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [query, setQuery] = useState("");

  useKeyboardShortcuts();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) navigate(`/app/search?q=${encodeURIComponent(query.trim())}`);
  };

  const initial = user?.email?.[0]?.toUpperCase() ?? "P";
  const isActive = (url: string) =>
    url === "/app" ? location.pathname === "/app" : location.pathname.startsWith(url);

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full bg-background">
        {/* Sidebar — desktop only */}
        <div className="hidden md:block">
          <AppSidebar />
        </div>

        {/* Main column */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Top header */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur-xl md:gap-3 md:px-4">
            <SidebarTrigger className="hidden md:flex text-muted-foreground hover:text-primary shrink-0" />

            <form onSubmit={handleSearch} className="relative flex-1 max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search any MTG card… (⌘K)"
                className="h-9 border-border/60 bg-secondary/60 pl-9 text-sm focus-visible:ring-primary/50"
              />
            </form>

            <div className="ml-auto flex items-center gap-2 shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-arcane font-fantasy text-sm font-bold text-primary ring-1 ring-primary/30">
                {initial}
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} title="Sign out" className="h-8 w-8">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6 lg:p-8 lg:pb-8 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 inset-x-0 z-40 flex md:hidden border-t border-border/80 bg-background/95 backdrop-blur-xl">
        {mobileNav.map((item) => {
          const active = isActive(item.url);
          return (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.url === "/app"}
              className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors"
            >
              <span className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg transition-all",
                active ? "bg-primary/15 text-primary shadow-[0_0_12px_hsl(42_78%_60%_/0.3)]" : "text-muted-foreground"
              )}>
                <item.icon className="h-[18px] w-[18px]" />
              </span>
              <span className={cn(active ? "text-primary" : "text-muted-foreground/70")}>
                {item.title}
              </span>
              {active && (
                <span className="absolute top-0 h-[2px] w-8 rounded-b-full bg-primary shadow-[0_0_8px_hsl(42_78%_60%_/0.6)]" />
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Keyboard shortcut help overlay */}
      <ShortcutHelp />
    </SidebarProvider>
  );
}
