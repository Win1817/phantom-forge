import { Sparkles } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

const Decksmith = () => (
  <ComingSoon
    title="AI Decksmith"
    icon={Sparkles}
    description="Pick a format, playstyle, colors, and budget — the Decksmith analyzes your inventory and conjures the strongest deck possible from cards you already own. Powered by Lovable AI."
    cta={{ label: "Add cards first", to: "/app/search" }}
  />
);
export default Decksmith;
