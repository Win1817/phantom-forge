/**
 * currency.ts — Global currency config and formatting.
 *
 * Scryfall provides prices in USD, EUR, and TIX.
 * PHP is derived from USD via a fixed exchange rate (updated periodically).
 * The user's preference is persisted to localStorage.
 */

export type Currency = "USD" | "EUR" | "PHP";

export interface CurrencyConfig {
  code: Currency;
  symbol: string;
  label: string;
  /** Scryfall field to read raw price from */
  scryfallField: "usd" | "eur";
  /** Multiply USD by this rate to get the target currency (1 for USD/EUR) */
  rateFromUsd: number;
}

export const CURRENCIES: Record<Currency, CurrencyConfig> = {
  USD: { code: "USD", symbol: "$",  label: "US Dollar",        scryfallField: "usd", rateFromUsd: 1      },
  EUR: { code: "EUR", symbol: "€",  label: "Euro",             scryfallField: "eur", rateFromUsd: 1      },
  PHP: { code: "PHP", symbol: "₱",  label: "Philippine Peso",  scryfallField: "usd", rateFromUsd: 56.5   },
};

const LS_KEY = "phantom_currency";

export function getSavedCurrency(): Currency {
  const saved = localStorage.getItem(LS_KEY) as Currency | null;
  return saved && saved in CURRENCIES ? saved : "USD";
}

export function saveCurrency(c: Currency) {
  localStorage.setItem(LS_KEY, c);
}

/**
 * Format a USD price value into the target currency string.
 * Pass the raw USD numeric value stored in the DB.
 */
export function formatPrice(usdValue: number | null | undefined, currency: Currency): string {
  if (usdValue == null || isNaN(Number(usdValue))) return "";
  const cfg = CURRENCIES[currency];
  const converted = Number(usdValue) * cfg.rateFromUsd;
  return `${cfg.symbol}${converted.toFixed(2)}`;
}

/**
 * Format a Scryfall prices object into the target currency string.
 * Reads the correct Scryfall field (usd or eur) based on currency.
 */
export function formatScryfallPrice(
  prices: { usd?: string | null; eur?: string | null; usd_foil?: string | null; eur_foil?: string | null } | null | undefined,
  currency: Currency,
  foil = false
): string {
  if (!prices) return "";
  const cfg = CURRENCIES[currency];
  const field = foil
    ? (cfg.scryfallField === "eur" ? "eur_foil" : "usd_foil")
    : cfg.scryfallField;
  const raw = prices[field as keyof typeof prices];
  if (!raw) return "";
  const converted = Number(raw) * cfg.rateFromUsd;
  return `${cfg.symbol}${converted.toFixed(2)}`;
}
