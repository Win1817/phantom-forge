import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import { AppLayout } from "./layouts/AppLayout.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Collection from "./pages/Collection.tsx";
import CardSearch from "./pages/CardSearch.tsx";
import Decks from "./pages/Decks.tsx";
import DeckDetail from "./pages/DeckDetail.tsx";
import Decksmith from "./pages/Decksmith.tsx";
import Scanner from "./pages/Scanner.tsx";
import Wishlist from "./pages/Wishlist.tsx";
import Settings from "./pages/Settings.tsx";
import SharedDeck from "./pages/SharedDeck.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="collection" element={<Collection />} />
            <Route path="search" element={<CardSearch />} />
            <Route path="decks" element={<Decks />} />
            <Route path="decks/:id" element={<DeckDetail />} />
            <Route path="decksmith" element={<Decksmith />} />
            <Route path="scanner" element={<Scanner />} />
            <Route path="wishlist" element={<Wishlist />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="/share/:token" element={<SharedDeck />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
