/**
 * mtgmath.ts — Public adapter for the math-first deck builder + card analysis helpers.
 *
 * Exports:
 *   buildDeck()               → Decksmith.tsx
 *   classifyRole()            → CardDetailModal.tsx
 *   findRelatedCards()        → CardDetailModal.tsx
 *   findCombos()              → CardDetailModal.tsx
 *   generateSimpleExplanation → CardDetailModal.tsx
 *   generateHowToUse()        → CardDetailModal.tsx
 *   formatCombos()            → CardDetailModal.tsx
 */

import { buildDeckMath } from "./deckBuilder";
import type { CardRole } from "./cardAnalytics";

// ── Re-export core analytics ──────────────────────────────────────────────────

export { classifyRole, findRelatedCards, findCombos } from "./cardAnalytics";
export type { CardRole } from "./cardAnalytics";

// ── Deck builder adapter ──────────────────────────────────────────────────────

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
  budget: string,
  collectionCards?: import("./deckBuilder").CollectionCard[],
  useCollection?: boolean,
): Promise<BuiltDeck> {
  const result = await buildDeckMath({ format, style, colors, budget, collectionCards, useCollection });
  return {
    deckList: result.deckList,
    cardCount: result.cards.reduce((sum, c) => sum + c.quantity, 0),
    roleBreakdown: result.slotSummary,
  };
}

// ── CardDetailModal helpers ───────────────────────────────────────────────────

/**
 * Generate a plain-English one-liner from oracle text + role — no AI needed.
 */
export function generateSimpleExplanation(
  card: { name: string; oracle_text?: string; type_line?: string },
  role: CardRole
): string {
  const oracle = card.oracle_text?.split(".")[0] ?? "";
  if (oracle.length > 10) {
    return `${card.name} is a ${card.type_line ?? "card"} that ${oracle.toLowerCase()}.`;
  }
  const roleDesc: Record<CardRole, string> = {
    ramp:     "generates mana or puts extra lands into play",
    removal:  "destroys or exiles a target permanent",
    draw:     "lets you draw additional cards",
    counter:  "counters an opponent's spell on the stack",
    finisher: "can win the game if unanswered",
    support:  "buffs or protects your other permanents",
    threat:   "applies immediate offensive pressure",
    utility:  "provides flexible situational value",
    lands:    "provides mana when tapped",
    combo:    "enables powerful infinite or triggered interactions",
  };
  return `${card.name} is a ${card.type_line ?? "card"} that ${roleDesc[role] ?? "provides value"}.`;
}

/**
 * Generate a 1-sentence gameplay tip based on role — no AI needed.
 */
export function generateHowToUse(
  _card: { name: string; type_line?: string },
  role: CardRole
): string {
  const tips: Record<CardRole, string> = {
    ramp:     "Play early to accelerate into your bigger threats ahead of curve.",
    removal:  "Hold up mana on your opponent's turn so you can react to the best target.",
    draw:     "Use when your hand is low to refuel and maintain card advantage.",
    counter:  "Keep mana open on your opponent's turn and wait for their key spell.",
    finisher: "Protect with counterspells or haste enablers for maximum impact.",
    support:  "Deploy before your key threats to protect them immediately.",
    threat:   "Commit to the board early and apply pressure before they stabilize.",
    utility:  "Evaluate the board carefully — this card rewards flexible play.",
    lands:    "Play on curve every turn to ensure you hit your mana needs.",
    combo:    "Assemble the pieces carefully and avoid telegraphing the plan too early.",
  };
  return tips[role] ?? "Deploy at the moment that maximizes its impact.";
}

/**
 * Format raw combo results — findCombos() already returns string[],
 * this is a pass-through shim for CardDetailModal compatibility.
 */
export function formatCombos(combos: string[]): string[] {
  return combos;
}
