import { useCurrency } from "@/contexts/CurrencyContext";
import { useRef, useState, useCallback } from "react";
import { ScanLine, Camera, Loader2, Plus, RotateCcw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { searchCards, getCardImage } from "@/lib/scryfall";

type ScanState = "idle" | "previewing" | "scanning" | "result" | "added";

interface IdentifiedCard {
  name: string;
  scryfall_id: string;
  image_url: string | null;
  price_usd: string | null;
  type_line: string | null;
  set_name: string | null;
  rarity: string | null;
  mana_cost: string | null;
  cmc: number | null;
  colors: string[] | null;
  set: string | null;
  collector_number: string | null;
}

export default function Scanner() {
  const { fmt } = useCurrency();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [state, setState] = useState<ScanState>("idle");
  const [identified, setIdentified] = useState<IdentifiedCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState("previewing");
    } catch (e) {
      setError("Camera access denied. Please allow camera permissions.");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setState("scanning");

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);

    const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
    setCapturedImage(canvas.toDataURL("image/jpeg", 0.85));
    stopCamera();

    // Call Gemini Vision to identify the card
    const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
    if (!GEMINI_KEY) {
      setError("Missing VITE_GEMINI_API_KEY — AI card identification requires a Gemini API key.");
      setState("idle");
      return;
    }

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: "image/jpeg", data: base64 } },
                { text: "This is a Magic: The Gathering card. Identify the exact card name (including set if visible). Reply with ONLY the card name, nothing else. Example: 'Lightning Bolt'" },
              ],
            }],
          }),
        }
      );
      const data = await res.json();
      const cardName = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().replace(/['"]/g, "");

      if (!cardName) throw new Error("Could not identify card. Try again with better lighting.");

      // Search Scryfall for the identified card name
      const { data: scryfallCards } = await searchCards(`!"${cardName}"`);
      const card = scryfallCards[0];
      if (!card) throw new Error(`Could not find "${cardName}" in Scryfall database.`);

      setIdentified({
        name: card.name,
        scryfall_id: card.id,
        image_url: getCardImage(card),
        price_usd: card.prices?.usd ?? null,
        type_line: card.type_line ?? null,
        set_name: card.set_name ?? null,
        rarity: card.rarity ?? null,
        mana_cost: card.mana_cost ?? null,
        cmc: card.cmc ?? null,
        colors: card.colors ?? [],
        set: card.set ?? null,
        collector_number: card.collector_number ?? null,
      });
      setState("result");
    } catch (e) {
      setError((e as Error).message);
      setState("previewing");
      startCamera();
    }
  }, []);

  const addToCollection = async () => {
    if (!identified || !user) return;
    const { error } = await supabase.from("collection_cards").insert({
      user_id: user.id,
      scryfall_id: identified.scryfall_id,
      card_name: identified.name,
      image_url: identified.image_url,
      price_usd: identified.price_usd ? Number(identified.price_usd) : null,
      rarity: identified.rarity,
      set_name: identified.set_name,
      set_code: identified.set,
      collector_number: identified.collector_number,
      mana_cost: identified.mana_cost,
      cmc: identified.cmc,
      type_line: identified.type_line,
      colors: identified.colors ?? [],
      quantity: 1,
    });
    if (error) toast.error(error.message);
    else { setState("added"); toast.success(`${identified.name} added to your collection`); }
  };

  const reset = () => {
    setState("idle");
    setIdentified(null);
    setError(null);
    setCapturedImage(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-fantasy text-3xl font-bold text-gradient-gold md:text-4xl">Card Scanner</h1>
        <p className="mt-1 text-sm text-muted-foreground">Point your camera at any MTG card. AI identifies it instantly.</p>
      </div>

      <div className="max-w-md mx-auto space-y-4">
        {/* Camera / result viewport */}
        <div className="relative rounded-2xl overflow-hidden border border-border bg-black aspect-[4/3]">
          {/* Live camera */}
          <video ref={videoRef} className={`h-full w-full object-cover ${state === "previewing" ? "block" : "hidden"}`} playsInline muted />
          {/* Captured image */}
          {capturedImage && state !== "previewing" && (
            <img src={capturedImage} alt="Captured" className="h-full w-full object-cover" />
          )}
          {/* Idle state */}
          {state === "idle" && !capturedImage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-arcane ring-1 ring-primary/40">
                <Camera className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">Camera preview will appear here</p>
            </div>
          )}
          {/* Scanning overlay */}
          {state === "scanning" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-fantasy text-primary">Consulting the arcane archives…</p>
            </div>
          )}
          {/* Viewfinder corners */}
          {state === "previewing" && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-4 left-4 h-8 w-8 border-t-2 border-l-2 border-primary rounded-tl-md" />
              <div className="absolute top-4 right-4 h-8 w-8 border-t-2 border-r-2 border-primary rounded-tr-md" />
              <div className="absolute bottom-4 left-4 h-8 w-8 border-b-2 border-l-2 border-primary rounded-bl-md" />
              <div className="absolute bottom-4 right-4 h-8 w-8 border-b-2 border-r-2 border-primary rounded-br-md" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="border border-primary/30 rounded-lg w-48 h-64 flex items-center justify-center">
                  <p className="text-[10px] text-primary/60 uppercase tracking-wider">Center card here</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Controls */}
        <div className="flex gap-2">
          {state === "idle" && (
            <Button className="flex-1 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90" onClick={startCamera}>
              <Camera className="mr-2 h-4 w-4" /> Start camera
            </Button>
          )}
          {state === "previewing" && (
            <Button className="flex-1 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90" onClick={capture}>
              <ScanLine className="mr-2 h-4 w-4" /> Scan card
            </Button>
          )}
          {(state === "result" || state === "added") && (
            <Button variant="outline" className="flex-1 border-border/60" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" /> Scan another
            </Button>
          )}
        </div>

        {/* Result card */}
        {identified && (state === "result" || state === "added") && (
          <Card className="border-primary/30 bg-card animate-fade-in overflow-hidden">
            <div className="flex gap-4 p-4">
              {identified.image_url && (
                <img src={identified.image_url} alt={identified.name} className="h-28 w-20 rounded-lg object-cover shrink-0 ring-1 ring-border" />
              )}
              <div className="flex-1 min-w-0 space-y-2">
                <h3 className="font-fantasy text-lg font-bold text-gradient-gold line-clamp-1">{identified.name}</h3>
                <p className="text-xs text-muted-foreground line-clamp-1">{identified.type_line}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {identified.rarity && <span className="text-[10px] uppercase text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded">{identified.rarity}</span>}
                  {identified.price_usd && <span className="text-sm text-mana-green font-semibold">{fmt(Number(identified.price_usd))}</span>}
                  {identified.set_name && <span className="text-xs text-muted-foreground">{identified.set_name}</span>}
                </div>
                {state === "added" ? (
                  <div className="flex items-center gap-1.5 text-mana-green text-sm font-semibold">
                    <CheckCircle2 className="h-4 w-4" /> Added to collection
                  </div>
                ) : (
                  <Button className="w-full h-8 text-sm bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90" onClick={addToCollection}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add to collection
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
