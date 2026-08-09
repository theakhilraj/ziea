# ZIEA

**Premium Kerala women's wear — storefront + admin console.**
A single Next.js 16 application serving a public e‑commerce storefront and a private, role‑gated admin dashboard over a Supabase backend.

- **Live:** [https://ziea.in](https://ziea.in)
- **Ordering:** WhatsApp click‑to‑chat (`wa.me`) — order recorded in the DB, no payment gateway
- **Design language:** calm, feminine "everyday luxury" — sage `#7A9268` / deep‑forest `#2C3829` on warm cream `#F5F0E8`

> 📄 In‑depth docs live at the repo root: **`Ziea-Architecture.html`** (full system architecture + live Lighthouse metrics) and **`Ziea-Deployment.html`** (step‑by‑step deployment guide). Open either in a browser.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, Turbopack), **React 19** Server Components |
| Backend | **Supabase** — Postgres, Auth (JWT), Realtime, Row‑Level Security |
| Styling | **Tailwind CSS v4** (`@theme` tokens), `next/font` (Playfair Display + Jost) |
| Media / CDN | Filesystem CDN (`/cdn`) served via a Node route |
| Email | **Resend** (footer contact enquiries) |
| Validation | **Zod** |
| Runtime | Node.js server (`next start`) |

> ⚠️ **This is Next.js 16** — its middleware file is `proxy.ts` (not `middleware.ts`), `params`/`searchParams` are async Promises, and `next/image`'s `priority` is deprecated in favour of `preload`+`fetchPriority`. See `AGENTS.md`; read the relevant guide in `node_modules/next/dist/docs/` before writing framework code.

---

## Features

**Storefront** — Home (hero carousel), Collections (filters + 32/page), Product detail (swipeable mobile gallery, Buy Now), About, Contact, Cart, Wishlist, live product search.

**Ordering** — "Buy Now" and cart checkout record an order (`status: Initiated`) then hand off to WhatsApp, so no lead is lost. Guest‑friendly.

**Admin console** (`/admin`, role‑gated) — Dashboard, Analytics, Products, Categories, Customers, Branding (editable site imagery), Activity feed, Enquiries inbox, Orders inbox — with live sidebar badges via Supabase Realtime.

**SEO** — code‑generated robots, sitemap, PWA manifest, per‑page canonicals, Organization + Product JSON‑LD. Scores 100 on desktop & mobile.

---

## Getting started

### Prerequisites
- **Node.js** 20.x or 22.x
- A **Supabase** project (URL, anon key, service‑role key)
- *(optional)* a **Resend** API key for the footer enquiry emails

### 1. Install
```bash
npm install
```

### 2. Configure environment
Create `.env.local` (git‑ignored) — see the table below. Minimum to boot: the three Supabase keys.

### 3. Run the dev server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### 4. Database
Run the SQL in **`Supabase_Queries/`** against your Supabase project (Products, Categories, Orders, Contact_Messages, Activity, Branding, Users, and the admin‑role claim hook).

---

## Environment variables

Set these in `.env.local` for local dev, and in your host's environment settings for production (the app deploys from GitHub, so it does **not** read `.env.local`).

| Key | Required | Purpose |
|---|:--:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server‑only key (admin uploads). **Never expose client‑side.** |
| `NEXT_PUBLIC_SITE_URL` | ✅ | Origin for canonicals/OG/sitemap. Local: `http://localhost:3000`; prod: `https://ziea.in` |
| `NEXT_PUBLIC_ASSET_BASE_URL` | prod | Public prefix for uploaded images, e.g. `https://ziea.in/cdn`. Local: leave unset → `/cdn` |
| `ASSET_UPLOAD_DIR` | prod | Absolute path where uploads are written, e.g. `/var/www/ziea/cdn`. Local: leave unset → `./storage/cdn` |
| `RESEND_API_KEY` | for email | Resend API key (footer enquiry emails) |

> The `BUNNY_*` keys in `.env.local` are legacy and no longer used by the code (kept only so old `b-cdn.net` image URLs keep resolving).

---

## Project structure

```
app/
  page.tsx                     # Home (static/ISR)
  collections/                 # Listing + [slug] product detail (prerendered)
  about-us/  contact-us/  cart/  wishlist/  login/  signup/
  admin/                       # Role-gated console (dynamic)
  actions/                     # Server actions (cart, wishlist, activity, …)
  api/upload/                  # Admin-gated image upload (filesystem CDN)
  cdn/[...path]/               # Serves uploaded files
  robots.ts  sitemap.ts  manifest.ts   # SEO
components/
  client/  server/  ui/        # UI, split by render boundary
utils/
  supabase/                    # server / client / public / user helpers
  products.ts  categories.ts  branding.server.ts   # cached readers
  whatsapp.ts  orders.ts  site.ts  format.ts
Supabase_Queries/              # SQL migrations
proxy.ts                       # Next 16 middleware (session refresh)
```

### Architecture notes
- **Static‑first:** catalog pages read Supabase through a **cookie‑less cached client** (`unstable_cache`, tagged `products` / `categories` / `branding`) and stay static/ISR; admin edits invalidate by tag via `revalidateTag`. Cart/wishlist read cookies → dynamic.
- **Auth:** identity from a **locally‑verified JWT** (`getClaims()` — fast) with **Row‑Level Security** as the real ownership guard. Email/password + Google OAuth.
- **Images:** admin‑gated upload writes to `ASSET_UPLOAD_DIR` and serves same‑origin from `/cdn`; fixed 4:5 frames (`SmartImage`) keep CLS at 0.

---

## Deployment

The app is a standard Next.js server (SSR + ISR), deployable to any Node.js host. Full guide in **`Ziea-Deployment.html`**. In short:

1. Set the environment variables from the table above in the host's settings.
2. Build `npm run build`, start `npm run start` (Node 20/22).
3. Point the domain at the app and enable HTTPS.
4. In **Supabase → Auth → URL Configuration** and **Google Cloud → OAuth**, add your production origin (+ `/auth/callback`).

**Performance tip:** keep the Node process warm (e.g. a periodic uptime ping) to avoid cold‑start latency on the first request.

---

## Scripts

```bash
npm run dev      # start dev server (Turbopack)
npm run build    # production build
npm run start    # start the production server
npm run lint     # eslint
```

---

## License

Proprietary — © ZIEA. All rights reserved.
