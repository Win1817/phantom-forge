/**
 * mtgmath.ts — Public adapter for the math-first deck builder.
 *
 * Bridges deckBuilder.ts internals to the interface Decksmith.tsx expects:
 *   buildDeck(format, style, colors, budget) → BuiltDeck
 *
 * All card selection is done by Scryfall queries — zero AI for card picking.
 */

import { buildDeckMath } from "./deckBuilder";

export interface BuiltDeck {
  deckList: string;
  cardCount: number;
  /** Slot name → card count, shown as badges in the UI */
  roleBreakdown: Partial<Record<string, number>>;
}

export async function buildDeck(
  format: string,
  style: string,
  colors: string[],
  budget: string
): Promise<BuiltDeck> {
  const result = await buildDeckMath({ format, style, colors, budget });

  const cardCount = result.cards.reduce((sum, c) => sum + c.quantity, 0);

  return {
    deckList: result.deckList,
    cardCount,
    roleBreakdown: result.slotSummary,
  };
}
