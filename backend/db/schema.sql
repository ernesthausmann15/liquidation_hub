-- Liquidation Hub: PostgreSQL schema.
--
-- Idempotent: server.js runs this file on boot, and it can be pasted into the pgAdmin
-- Query Tool as-is. Existing product rows keep their data; the liquidation columns are
-- added with defaults. Tables are created parent-first so the foreign keys resolve.

-- ------------------------------------------------------------------ catalog
CREATE TABLE IF NOT EXISTS products (
  product_id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  base_price NUMERIC(10, 2) NOT NULL,
  stock INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Liquidation metadata. base_price is the list (recovery) price; cost_basis is what the
-- unit cost to acquire, so the dashboard can show book value against recovery value.
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(64);
ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(80) NOT NULL DEFAULT 'Uncategorized';
ALTER TABLE products ADD COLUMN IF NOT EXISTS liquidation_status VARCHAR(20) NOT NULL DEFAULT 'staged';
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_basis NUMERIC(10, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
-- Optimistic concurrency: every UPDATE must name the version it read and bumps it by one.
ALTER TABLE products ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_liquidation_status_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_liquidation_status_check
      CHECK (liquidation_status IN ('staged', 'listed', 'reserved', 'liquidated', 'written_off'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_nonnegative') THEN
    ALTER TABLE products ADD CONSTRAINT products_stock_nonnegative CHECK (stock >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_prices_nonnegative') THEN
    ALTER TABLE products ADD CONSTRAINT products_prices_nonnegative
      CHECK (base_price >= 0 AND (cost_basis IS NULL OR cost_basis >= 0)) NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_key ON products (sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);
CREATE INDEX IF NOT EXISTS products_liquidation_status_idx ON products (liquidation_status);

-- ------------------------------------------------------------------ flash sales
CREATE TABLE IF NOT EXISTS flash_sales (
  flash_sale_id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(product_id),
  discount_price NUMERIC(10, 2) NOT NULL,
  stock_limit INT NOT NULL,
  sold_count INT NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  order_id SERIAL PRIMARY KEY,
  flash_sale_id INT NOT NULL REFERENCES flash_sales(flash_sale_id),
  customer_email VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  total_paid NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_management_logs (
  log_id SERIAL PRIMARY KEY,
  flash_sale_id INT NOT NULL REFERENCES flash_sales(flash_sale_id),
  action_type VARCHAR(100) NOT NULL,
  ai_payload JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------ operators & sessions
CREATE TABLE IF NOT EXISTS hub_users (
  user_id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(120),
  -- scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>, written by backend/create-user.js
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'operator' CHECK (role IN ('operator', 'admin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS hub_users_email_key ON hub_users (lower(email));

-- Only a SHA-256 of the session token is stored, so a leaked table row cannot be replayed.
CREATE TABLE IF NOT EXISTS hub_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id INT NOT NULL REFERENCES hub_users(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS hub_sessions_expires_idx ON hub_sessions (expires_at);

-- ------------------------------------------------------------------ portfolio demo mode
-- 'viewer' is read-only: the API rejects inventory writes from it (inventory.js requireWriter).
ALTER TABLE hub_users DROP CONSTRAINT IF EXISTS hub_users_role_check;
ALTER TABLE hub_users ADD CONSTRAINT hub_users_role_check CHECK (role IN ('viewer', 'operator', 'admin'));
-- Demo accounts are created by POST /api/auth/demo and can never sign in with a password.
ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- One row per demo-button click that produced a session. The visitor's IP is never stored:
-- visitor_hash is SHA-256(DEMO_ANALYTICS_SALT || ip), enough to count unique visitors.
CREATE TABLE IF NOT EXISTS demo_clicks (
  click_id BIGSERIAL PRIMARY KEY,
  action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('manager_demo', 'consumer_demo')),
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  visitor_hash CHAR(64),
  user_agent VARCHAR(512),
  referrer VARCHAR(512),
  accept_language VARCHAR(64)
);
CREATE INDEX IF NOT EXISTS demo_clicks_clicked_at_idx ON demo_clicks (clicked_at);

-- Reporting: SELECT * FROM demo_click_daily ORDER BY day DESC; (also GET /api/analytics/demo-clicks)
CREATE OR REPLACE VIEW demo_click_daily AS
SELECT date_trunc('day', clicked_at)::date AS day,
       action_type,
       count(*)::int AS clicks,
       count(DISTINCT visitor_hash)::int AS unique_visitors
  FROM demo_clicks
 GROUP BY 1, 2;

-- ------------------------------------------------------------------ VIP deals club
-- Storefront email signups (POST /api/vip-signup). One row per address; re-joining is a no-op.
CREATE TABLE IF NOT EXISTS vip_signups (
  signup_id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  interests TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vip_signups_email_key ON vip_signups (lower(email));
