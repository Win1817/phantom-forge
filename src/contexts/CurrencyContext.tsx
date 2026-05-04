import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { type Currency, getSavedCurrency, saveCurrency, formatPrice, formatScryfallPrice, fetchLiveRates } from "@/lib/currency";

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  fmt: (usdValue: number | null | undefined) => string;
  fmtScryfall: (prices: { usd?: string | null; eur?: string | null; usd_foil?: string | null; eur_foil?: string | null } | null | undefined, foil?: boolean) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(getSavedCurrency);
  const [, setRateVersion] = useState(0); // bump to re-render after live rate loads

  // Fetch live rates on mount — warms the cache, triggers re-render once done
  useEffect(() => {
    fetchLiveRates().then(() => setRateVersion((v) => v + 1));
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    saveCurrency(c);
    setCurrencyState(c);
    // Re-fetch rates when user switches currency
    fetchLiveRates().then(() => setRateVersion((v) => v + 1));
  }, []);

  const fmt = useCallback(
    (v: number | null | undefined) => formatPrice(v, currency),
    [currency]
  );

  const fmtScryfall = useCallback(
    (prices: Parameters<typeof formatScryfallPrice>[0], foil = false) =>
      formatScryfallPrice(prices, currency, foil),
    [currency]
  );

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, fmt, fmtScryfall }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
