import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Library, Search, LayersIcon, Sparkles, Heart, Settings, ScanLine } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

const mainItems = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard },
  { title: "Collection", url: "/app/collection", icon: Library },
  { title: "Card Search", url: "/app/search", icon: Search },
  { title: "Decks", url: "/app/decks", icon: LayersIcon },
];

const aiItems = [
  { title: "AI Decksmith", url: "/app/decksmith", icon: Sparkles },
  { title: "Card Scanner", url: "/app/scanner", icon: ScanLine },
];

const userItems = [
  { title: "Wishlist", url: "/app/wishlist", icon: Heart },
  { title: "Settings", url: "/app/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  const isActive = (url: string) =>
    url === "/app" ? location.pathname === "/app" : location.pathname.startsWith(url);

  const renderItem = (item: { title: string; url: string; icon: React.ComponentType<{ className?: string }> }) => (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild tooltip={item.title}>
        <RouterNavLink
          to={item.url}
          end={item.url === "/app"}
          className={({ isActive: a }) =>
            cn(
              "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all",
              a || isActive(item.url)
                ? "bg-sidebar-accent text-primary font-semibold"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-primary",
            )
          }
        >
          {(isActive(item.url)) && (
            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
          )}
          <item.icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{item.title}</span>}
        </RouterNavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <Logo showText={!collapsed} />
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">Workshop</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{mainItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">Arcane AI</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{aiItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">Personal</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{userItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
