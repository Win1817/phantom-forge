import { LayersIcon } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

const Decks = () => (
  <ComingSoon
    title="Deck Workshop"
    icon={LayersIcon}
    description="Drag-and-drop deck builder for Commander, Standard, Modern, Pioneer & Casual. Mana curve, color pie, sideboard support, and missing-card highlights are coming next."
    cta={{ label: "Browse your collection", to: "/app/collection" }}
  />
);
export default Decks;
