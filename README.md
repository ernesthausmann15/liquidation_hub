# Flash Sale & AI Inventory Management Platform

A production-ready, full-stack application featuring a modern client-server architecture, real-time data synchronization, and integrated modular AI capabilities for dynamic database analysis.

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

## 🧊 Staged Portfolio Liquidation Hub

Operator login (`/login`) and the PostgreSQL inventory dashboard (`/inventory`), styled with the
Vrymnox tokens from `vrymnox-systems` plus a three-layer liquid-glass system (see the header of
`frontend/flash-sale-client/app/globals.css`).

1. **Schema.** `backend/db/schema.sql` is idempotent. The API applies it on boot, and you can also
   run it from pgAdmin (Query Tool → open file → Execute). It adds the liquidation columns to
   `products` (existing rows keep their data) and creates `hub_users` / `hub_sessions`.
2. **Create an operator** (password is prompted, never passed on the command line):
   ```bash
   cd backend && node create-user.js ops@vrymnox.com "Ops Lead" admin
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
* Demo managers can change and delete real rows, so back up the portfolio data you show.
