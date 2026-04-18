// MTG Arena / MTGO deck format parser and exporter
// Format: "<qty> <Card Name> (<SET>) <collector_number>"
// Example: "4 Lightning Bolt (M11) 149"

import { searchCards, type ScryfallCard } from "./scryfall";

export interface DeckLine {
  quantity: number;
  name: string;
  set?: string;
  collectorNumber?: string;
}

export interface ParsedDeck {
  name: string;
  main: DeckLine[];
  sideboard: DeckLine[];
  commander?: DeckLine;
}

/** Parse Arena/MTGO export text into structured deck lines */
export function parseDeckText(raw: string): ParsedDeck {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let deckName = "Imported Deck";
  const main: DeckLine[] = [];
  const sideboard: DeckLine[] = [];
  let inSideboard = false;
  let inCommander = false;
  let commander: DeckLine | undefined;

  for (const line of lines) {
    // Section headers
    if (/^deck$/i.test(line)) { inSideboard = false; inCommander = false; continue; }
    if (/^sideboard$/i.test(line)) { inSideboard = true; inCommander = false; continue; }
    if (/^commander$/i.test(line)) { inCommander = true; inSideboard = false; continue; }
    // Name line (some exporters prefix with "//")
    if (line.startsWith("//")) {
      const candidate = line.replace(/^\/\/\s*/, "").trim();
      if (candidate && !/^deck|sideboard|commander/i.test(candidate)) {
        deckName = candidate;
      }
      continue;
    }

    // Card line: "4 Lightning Bolt (M11) 149" or "4 Lightning Bolt"
    const match = line.match(/^(\d+)\s+(.+?)(?:\s+\(([A-Za-z0-9]+)\)\s*(\d+[a-z]?))?$/);
    if (!match) continue;

    const entry: DeckLine = {
      quantity: parseInt(match[1], 10),
      name: match[2].trim(),
      set: match[3]?.toUpperCase(),
      collectorNumber: match[4],
    };

    if (inCommander) {
      commander = entry;
    } else if (inSideboard) {
      sideboard.push(entry);
    } else {
      main.push(entry);
    }
  }

  return { name: deckName, main, sideboard, commander };
}

/** Export a deck to Arena/MTGO text format */
export function exportDeckText(
  deckName: string,
  main: { quantity: number; card_name: string; set_code?: string | null; collector_number?: string | null; is_commander?: boolean }[],
  sideboard: { quantity: number; card_name: string; set_code?: string | null; collector_number?: string | null }[] = []
): string {
  const commanders = main.filter((c) => c.is_commander);
  const mainDeck = main.filter((c) => !c.is_commander);

  const fmt = (c: { quantity: number; card_name: string; set_code?: string | null; collector_number?: string | null }) => {
    let line = `${c.quantity} ${c.card_name}`;
    if (c.set_code && c.collector_number) {
      line += ` (${c.set_code.toUpperCase()}) ${c.collector_number}`;
    }
    return line;
  };

  const parts: string[] = [];

  if (commanders.length > 0) {
    parts.push("Commander");
    commanders.forEach((c) => parts.push(fmt(c)));
    parts.push("");
  }

  parts.push("Deck");
  mainDeck.forEach((c) => parts.push(fmt(c)));

  if (sideboard.length > 0) {
    parts.push("");
    parts.push("Sideboard");
    sideboard.forEach((c) => parts.push(fmt(c)));
  }

  return parts.join("\n");
}

/** Resolve a DeckLine to a ScryfallCard by searching Scryfall */
export async function resolveCard(line: DeckLine): Promise<ScryfallCard | null> {
  try {
    // Try exact set+number first
    if (line.set && line.collectorNumber) {
      const res = await fetch(
        `https://api.scryfall.com/cards/${line.set.toLowerCase()}/${line.collectorNumber}`
      );
      if (res.ok) return res.json();
    }
    // Fall back to name search
    const { data } = await searchCards(`!"${line.name}"`);
    return data[0] ?? null;
  } catch {
    return null;
  }
}
