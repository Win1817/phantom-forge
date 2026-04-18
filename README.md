# PhantomMTG — AI MTG Collection & Deck Builder

> Master your collection. Build smarter decks.

PhantomMTG is a premium, AI-powered Magic: The Gathering inventory manager and deck builder. Track every card you own, search the full Scryfall database, and let AI craft the strongest deck from your existing collection.

---

## Features

- **Smart Inventory** — Track cards by quantity, foil status, condition, rarity, and price
- **Multiverse Search** — Full Scryfall API integration. Filter by color, type, CMC, rarity, and more
- **Card Detail Modal** — Full card details, legalities across 8 formats, pricing, and keyboard navigation
- **AI Insights** — On-demand AI explanation: plain-English breakdown, gameplay tips, combos, and related cards
- **Dashboard** — Total cards, unique cards, estimated collection value, deck count
- **Deck Workshop** *(coming soon)* — Drag-and-drop builder for Commander, Standard, Modern, Pioneer & Casual
- **AI Decksmith** *(coming soon)* — Build the best deck from cards you already own
- **Card Scanner** *(coming soon)* — Photo-based card identification and instant collection add
- **Wishlist & Trades** *(coming soon)* — Track cards you want and duplicates to trade

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, shadcn/ui, Radix UI |
| Backend | Supabase (Auth, PostgreSQL, Edge Functions) |
| Card Data | Scryfall REST API |
| AI | Configurable — OpenAI-compatible API |
| Deployment | Cloudflare Pages |

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- An OpenAI-compatible API key (for AI Insights)

### Local Development

```bash
npm install
cp .env.example .env
# Fill in your Supabase credentials
npm run dev
```

### Environment Variables

`.env` (frontend):
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

Supabase Edge Function secrets (AI):
```
AI_API_KEY=your-openai-or-compatible-key
AI_BASE_URL=https://api.openai.com/v1   # optional, defaults to OpenAI
AI_MODEL=gpt-4o-mini                    # optional
```

---

## Deployment — Cloudflare Pages

**Option A — GitHub Actions (automatic)**

1. Push repo to GitHub
2. Add secrets to `Settings → Secrets → Actions`:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
3. Push to `main` — `.github/workflows/deploy.yml` handles the rest

**Option B — Wrangler CLI**

```bash
npm install -g wrangler
npm run build
wrangler pages deploy dist --project-name phantommtg
```

**Option C — Cloudflare Pages Dashboard**

1. Connect your GitHub repo
2. Build command: `npm run build`
3. Output directory: `dist`
4. Add env vars in the dashboard

---

## Database

Apply the migration once:

```bash
supabase db push
```

Tables: `profiles`, `collection_cards`, `decks`, `deck_cards` — all with Row Level Security.

---

## Edge Functions

```bash
supabase functions deploy explain-card
supabase secrets set AI_API_KEY=your-key
```

---

## License

PhantomMTG is an unofficial fan tool. Magic: The Gathering is a trademark of Wizards of the Coast LLC. Card data by [Scryfall](https://scryfall.com).
