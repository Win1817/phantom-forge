import { ScanLine } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

const Scanner = () => (
  <ComingSoon
    title="Card Scanner"
    icon={ScanLine}
    description="Snap a photo of any Magic card and we'll identify it and add it to your inventory. AI vision is being calibrated."
  />
);
export default Scanner;
