# Liquidation Hub

A standalone e-commerce marketplace for overstock, open-box electronics and wholesale liquidation
lots. Shoppers browse live deals and join the VIP Deals Club on the storefront (`/`); operators
manage the inventory behind it in the operator console (`/login` → `/inventory`).

---

## 🏗️ System Architecture

This application is built with a strict separation of concerns between the client and server:

* **Frontend:** Next.js (Client-side UI, routing, and responsive dashboard components)
* **Backend:** Express.js REST API (Running on port `4000`, handling business logic, database queries, and middleware configuration)
* **Database:** PostgreSQL (Relational data storage for products, orders, and inventory states)
* **AI Integration:** OpenAI API pipeline (Dynamic injection of database schemas and live table context into LLM prompts for intelligent automated analysis)

---

## 🛠️ Tech Stack

* **Client:** Next.js, React, Tailwind CSS
* **Server:** Node.js, Express, `cors`, `dotenv`
* **Database:** PostgreSQL
* **AI / Intelligence:** OpenAI API with structured data injection

---

## ⚙️ Environment Configuration

To prevent configuration mismatches and secure sensitive credentials, environment variables are isolated within their respective root folders:

1. **Backend (`.env` in the server directory):**
   ```env
   PORT=4000
   DATABASE_URL=your_postgresql_connection_string
   OPENAI_API_KEY=your_openai_api_key
   ```


### Environment Configuration

To connect the frontend to the backend server, create a `.env.local` file inside your frontend/client directory with the following variable:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### Why this is best practice:
* **`NEXT_PUBLIC_` Prefix:** In Next.js, any environment variable starting with `NEXT_PUBLIC_` is safely exposed to the browser client so it knows where to send API requests (in this case, pointing straight to your Express server running on port `4000`).
* **Zero Secrets Exposed:** It contains only a public local URL, keeping your API keys and database credentials strictly locked down on the backend server.

---

## 🧊 Storefront and operator console

The public storefront (`/`) lists live deals from `GET /api/products` and collects VIP Deals Club
signups through `POST /api/vip-signup` (stored in `vip_signups`, 10 per IP per hour). Operator login
(`/login`) and the PostgreSQL inventory dashboard (`/inventory`) sit behind it. Everything shares one
dark palette plus a three-layer liquid-glass system (see the header of
`frontend/flash-sale-client/app/globals.css`).

1. **Schema.** `backend/db/schema.sql` is idempotent. The API applies it on boot, and you can also
   run it from pgAdmin (Query Tool → open file → Execute). It adds the liquidation columns to
   `products` (existing rows keep their data) and creates `hub_users` / `hub_sessions` / `vip_signups`.
2. **Create an operator** (password is prompted, never passed on the command line):
   ```bash
   cd backend && node create-user.js ops@liquidationhub.com "Ops Lead" admin
   ```
3. **Point Next.js at the API** in `frontend/flash-sale-client/.env.local` (server-side only):
   ```env
   BACKEND_URL=http://localhost:4000
   ```
   `next.config.ts` rewrites `/api/*` to Express, so the session cookie is first-party
   (`HttpOnly`, `SameSite=Strict`, `Secure` in production). The rewrite target is fixed at
   **`next build`** time, so set `BACKEND_URL` before building, not only before `next start`.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | scrypt passwords, hashed session tokens, per-IP+email throttling |
| `GET /api/inventory?q=&category=&status=` | Filtered grid rows plus the category list |
| `GET /api/inventory/summary` | Recovery value, book value, recovery rate, units by liquidation stage |
| `POST /api/inventory`, `PATCH /api/inventory/:id`, `DELETE /api/inventory/:id?version=` | CRUD with optimistic concurrency: stale `version` returns `409` with the current row |

### Portfolio demo mode

Two one-click buttons on `/login`: **Demo Manager** (admin, full CRUD) and **Demo Viewer**
(read-only; the API returns `403` to its writes). Off by default. Enable it in `backend/.env`:

```env
DEMO_MODE=true
DEMO_ANALYTICS_SALT=any-long-random-string   # keeps unique-visitor counts stable across restarts
```

* `POST /api/auth/demo` `{ "kind": "manager" | "consumer" }` signs the visitor into a dedicated demo
  account (2-hour session, max 20 per IP per hour) and logs the click in `demo_clicks`. Visitor IPs
  are stored only as a salted SHA-256 hash. Demo accounts cannot sign in with a password.
* Engagement report (non-demo admins only): `GET /api/analytics/demo-clicks`, or in pgAdmin:
  ```sql
  SELECT * FROM demo_click_daily ORDER BY day DESC;          -- clicks and unique visitors per day
  SELECT action_type, count(*) FROM demo_clicks GROUP BY 1;  -- all-time totals
  ```
* **Auto-heal:** in demo mode the API keeps 8 showcase items (`backend/db/showcase.js`, SKUs `VX-*`)
  present. Missing ones are re-inserted on boot, hourly, and before every demo session starts; surviving
  and edited rows are never touched or duplicated. `SHOWCASE_AUTOHEAL=false` turns it off. Outside demo
  mode it never runs, so real inventory is never seeded.

### Deploying to Render

`render.yaml` defines the Postgres database (`liquidation-hub-db`), the API (`liquidation-hub-api`) and
the Next.js frontend (`liquidation-hub`).

1. **Create the stack:** Render dashboard → New → Blueprint → select this repo. When prompted, set
   `OPENAI_API_KEY` (only the owner-only `/api/add-product` uses it) and set `BACKEND_URL` to the API's
   public URL, e.g. `https://liquidation-hub-api.onrender.com`.
2. **First boot** applies `backend/db/schema.sql` and seeds the showcase inventory automatically.
   Check `https://liquidation-hub-api.onrender.com/health` returns `{"status":"ok"}`.
3. **Create your owner account** from your machine, using the database's *External Database URL*
   (Render dashboard → liquidation-hub-db → Connect):
   ```bash
   cd backend
   DATABASE_URL="<External Database URL>?sslmode=require" node create-user.js you@example.com "Your Name" admin
   ```
4. **Calibrate `TRUST_PROXY`:** sign in on the frontend as the owner, open `/api/admin/request-info`.
   If `ip` is not your own public address, add `TRUST_PROXY` on the API service (try `2`, then `3`)
   until it is. This makes rate limits and unique-visitor counts per visitor instead of per proxy.
5. **pgAdmin:** register a server with the External Database URL's host, port, database, user and
   password, SSL mode `require`. `SELECT * FROM demo_click_daily ORDER BY day DESC;` shows engagement.

| Variable (API) | Set by | Notes |
| --- | --- | --- |
| `NODE_ENV=production` | blueprint | Marks the session cookie `Secure`; the server warns on Render if unset |
| `DATABASE_URL` | blueprint | Internal connection string of `liquidation-hub-db` |
| `DEMO_MODE=true` | blueprint | Demo buttons, showcase auto-heal |
| `DEMO_ANALYTICS_SALT` | blueprint (generated once) | Never change it, or unique-visitor counts restart |
| `TRUST_PROXY` | you, after step 4 | Defaults to `1` on Render, `loopback` locally |
| `SHOWCASE_AUTOHEAL=false` | optional | Stops re-seeding the showcase items |

Frontend: `BACKEND_URL` is read **at build time** (the `/api` rewrite), so redeploy the frontend after
changing it. The free plans sleep after inactivity; the first request after a sleep takes up to a minute.

Owner-only routes (never demo accounts): `POST /api/add-product`, `DELETE /api/orders/:id`,
`GET /api/analytics/demo-clicks`, `GET /api/admin/request-info`. Public routes: `GET /api/products`
(listed and reserved items, no cost data), `POST /api/purchases` (30 per IP per 10 minutes),
`POST /api/vip-signup` (10 per IP per hour), `/health`.
