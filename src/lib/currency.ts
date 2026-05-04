/**
 * currency.ts — Global currency config and live exchange rates.
 *
 * Scryfall provides prices in USD and EUR.
 * PHP is derived from USD using a live rate fetched from
 * the Frankfurter API (free, no key required).
 * Rates are cached in localStorage for 1 hour to avoid hammering the API.
 */

export type Currency = "USD" | "EUR" | "PHP";

export interface CurrencyConfig {
  code: Currency;
  symbol: string;
  label: string;
  scryfallField: "usd" | "eur";
  /** Fallback rate if live fetch fails */
  fallbackRateFromUsd: number;
}

export const CURRENCIES: Record<Currency, CurrencyConfig> = {
  USD: { code: "USD", symbol: "$",  label: "US Dollar",       scryfallField: "usd", fallbackRateFromUsd: 1     },
  EUR: { code: "EUR", symbol: "€",  label: "Euro",            scryfallField: "eur", fallbackRateFromUsd: 1     },
  PHP: { code: "PHP", symbol: "₱",  label: "Philippine Peso", scryfallField: "usd", fallbackRateFromUsd: 56.5  },
};

const LS_KEY      = "phantom_currency";
const RATE_KEY    = "phantom_fx_rates";
const RATE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function getSavedCurrency(): Currency {
  const saved = localStorage.getItem(LS_KEY) as Currency | null;
  return saved && saved in CURRENCIES ? saved : "USD";
}

export function saveCurrency(c: Currency) {
  localStorage.setItem(LS_KEY, c);
}

// ─── Live rate cache ─────────────────────────────────────────────────────────

interface RateCache {
  rates: Partial<Record<Currency, number>>;
  fetchedAt: number;
}

let _rateCache: RateCache | null = null;

function loadRateCache(): RateCache | null {
  try {
    const raw = localStorage.getItem(RATE_KEY);
    if (!raw) return null;
    const parsed: RateCache = JSON.parse(raw);
    if (Date.now() - parsed.fetchedAt > RATE_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function saveRateCache(cache: RateCache) {
  try { localStorage.setItem(RATE_KEY, JSON.stringify(cache)); } catch {}
}

/**
 * Fetch live USD→PHP rate from Frankfurter (free, no API key).
 * Falls back to CURRENCIES[PHP].fallbackRateFromUsd if unavailable.
 * Result cached 1h in localStorage + module-level variable.
 */
export async function fetchLiveRates(): Promise<Partial<Record<Currency, number>>> {
  // 1. Module cache (instant)
  if (_rateCache && Date.now() - _rateCache.fetchedAt < RATE_TTL_MS) {
    return _rateCache.rates;
  }
  // 2. localStorage cache
  const persisted = loadRateCache();
  if (persisted) {
    _rateCache = persisted;
    return persisted.rates;
  }
  // 3. Live fetch — Frankfurter: USD base → PHP
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=PHP,EUR");
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    const rates: Partial<Record<Currency, number>> = {
      USD: 1,
      EUR: 1, // EUR/EUR always 1 (Scryfall gives EUR prices directly)
      PHP: data.rates?.PHP ?? CURRENCIES.PHP.fallbackRateFromUsd,
    };
    _rateCache = { rates, fetchedAt: Date.now() };
    saveRateCache(_rateCache);
    return rates;
  } catch {
    // Fallback to hardcoded rates
    return { USD: 1, EUR: 1, PHP: CURRENCIES.PHP.fallbackRateFromUsd };
  }
}

/**
 * Synchronous rate lookup — uses cache if available, fallback otherwise.
 * Call fetchLiveRates() on mount to warm the cache.
 */
function getRate(currency: Currency): number {
  const cfg = CURRENCIES[currency];
  const cached = _rateCache ?? loadRateCache();
  if (cached) {
    _rateCache = cached;
    return cached.rates[currency] ?? cfg.fallbackRateFromUsd;
  }
  return cfg.fallbackRateFromUsd;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatPrice(usdValue: number | null | undefined, currency: Currency): string {
  if (usdValue == null || isNaN(Number(usdValue))) return "";
  const cfg = CURRENCIES[currency];
  const rate = getRate(currency);
  const converted = Number(usdValue) * rate;
  return `${cfg.symbol}${converted.toFixed(2)}`;
}

export function formatScryfallPrice(
  prices: { usd?: string | null; eur?: string | null; usd_foil?: string | null; eur_foil?: string | null } | null | undefined,
  currency: Currency,
  foil = false,
): string {
  if (!prices) return "";
  const cfg = CURRENCIES[currency];
  const field = foil
    ? cfg.scryfallField === "eur" ? "eur_foil" : "usd_foil"
    : cfg.scryfallField;
  const raw = prices[field as keyof typeof prices];
  if (!raw) return "";
  const rate = getRate(currency);
  const converted = Number(raw) * rate;
  return `${cfg.symbol}${converted.toFixed(2)}`;
}
