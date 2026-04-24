<p align="center">
  <img src="public/logo.png" alt="PhantomMTG" width="480" />
</p>

<h1 align="center">PhantomMTG — AI MTG Collection & Deck Builder</h1>

<p align="center">
  <strong>Master your collection. Build smarter decks.</strong><br/>
  AI-powered Magic: The Gathering inventory manager, deck builder, and deckbuilding mentor.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Supabase-backend-3ECF8E?logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/Cloudflare-Pages-F6821F?logo=cloudflare&logoColor=white" />
  <img src="https://img.shields.io/badge/Scryfall-card%20data-9B59B6" />
</p>

---

## Features

| Feature | Description |
|---|---|
| **Smart Inventory** | Track cards by quantity, foil, condition, rarity, price, CMC, and color |
| **Advanced Filters** | Filter collection by WUBRG, rarity, foil, CMC range — with mana curve + color pie stats |
| **Bulk Select** | Multi-select cards in collection for bulk delete |
| **Multiverse Search** | Full Scryfall API with autocomplete, type/subtype/tribe/format filters, load-more pagination |
| **Export Search Results** | Export any search result as Arena/MTGO format, CSV, or plain text |
| **Card Detail Modal** | Oracle text, legalities, prices, keyboard navigation, AI instant analysis |
| **AI Card Insights** | Gemini-powered explanation: role, gameplay tips, combos (CommanderSpellbook), related cards |
| **Deck Workshop** | Import Arena/MTGO format, view by type groups, mana curve, color pie, inline card add/remove |
| **AI Decksmith** | Math-first deck builder: Scryfall selects real cards → Gemini writes name & strategy |
| **Forge from Collection** | Decksmith prioritizes cards you already own, fills gaps from Scryfall |
| **Forge Guide** | Commander fundamentals, archetypes, deckbuilding checklist, common mistakes + AI Oracle |
| **Card Scanner** | Camera → Gemini Vision identifies card → Scryfall lookup → add to collection |
| **Wishlist & Trades** | Track wanted cards, see missing cost, one-tap add to collection |
| **Dashboard** | Collection stats, value trend chart, AI daily insight from your cards |
| **Keyboard Shortcuts** | ⌘K global search, 1–5 nav, ? help overlay |
| **Mobile-first** | Bottom nav, responsive grid, drawer modals |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, shadcn/ui, Radix UI |
| Backend | Supabase (Auth, PostgreSQL, Edge Functions, Storage) |
| Card Data | [Scryfall REST API](https://scryfall.com/docs/api) |
| Combo Data | [CommanderSpellbook API](https://commanderspellbook.com) |
| AI | Google Gemini (configurable via `VITE_GEMINI_API_KEY`) |
| Deployment | Cloudflare Workers with static assets |

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- A [Google AI Studio](https://aistudio.google.com) API key (free tier works)

### Local Development

```bash
git clone https://github.com/Win1817/phantom-forge.git
cd phantom-forge
npm install

cp .env.example .env
# Edit .env with your Supabase URL, anon key, and Gemini API key
npm run dev
```

### Environment Variables

`.env` (frontend):
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_GEMINI_API_KEY=your-gemini-api-key
```

---

## Database Setup

Apply all migrations to your Supabase project:

```bash
supabase db push
```

Or apply manually in the SQL editor — files are in `supabase/migrations/`.

**Tables:** `profiles`, `collection_cards`, `decks`, `deck_cards`, `wishlist_cards`
All tables have Row Level Security enabled.

**Storage:** Create an `avatars` bucket (public) in Supabase Storage — policies are applied by migration.

---

## Deployment — Cloudflare Workers

**Option A — GitHub Actions (automatic)**

1. Push to GitHub
2. Add secrets in `Settings → Secrets → Actions`:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_GEMINI_API_KEY`
3. Push to `main` — `.github/workflows/deploy.yml` deploys automatically

**Option B — Wrangler CLI**

```bash
npm run build
npx wrangler deploy
```

**Option C — Cloudflare Dashboard**

Connect your GitHub repo → set build command `npm run build` → output directory `dist`.

---

## Edge Functions

Optional AI features run via Supabase Edge Functions:

```bash
supabase functions deploy explain-card
supabase functions deploy generate-deck
supabase secrets set AI_API_KEY=your-key
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Global card search |
| `1` | Dashboard |
| `2` | Collection |
| `3` | Card Search |
| `4` | Decks |
| `5` | AI Decksmith |
| `←` / `→` | Navigate cards in modal |
| `?` | Show shortcut help |

---

## License

PhantomMTG is an unofficial fan tool. Magic: The Gathering is a trademark of Wizards of the Coast LLC.
Card data provided by [Scryfall](https://scryfall.com). Combo data by [CommanderSpellbook](https://commanderspellbook.com).
