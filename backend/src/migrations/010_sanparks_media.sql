-- =========================================================================
-- MIGRATION 010: SANParks Media Licensing
--
-- Subscription-based licensing of imagery and footage captured on SANParks
-- property, with the transfer of rights recorded in the same transaction as
-- the sale.
--
-- Tables:
--   sanparks_subscriptions      — one row per subscriber, current term
--   sanparks_subscription_terms — one row per term bought or renewed
--   sanparks_assets             — the catalogue, with its rights state
--   sanparks_licences           — every grant made, exclusive or not
--   sanparks_rights_chain       — hash-linked chain of title per asset
--   sanparks_revenue_splits     — conservation levy / royalty / platform fee
--   sanparks_payments           — money captured against a licence
--
-- All money is stored in integer cents. All tables are prefixed sanparks_ and
-- are independent of the healthcare facilitation schema.
-- =========================================================================

-- ── Subscriptions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sanparks_subscriptions (
  subscription_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  licensee_name     VARCHAR(200),
  plan_code         VARCHAR(20) NOT NULL,
  term_months       INTEGER NOT NULL,

  starts_at         TIMESTAMPTZ NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  cancelled_at      TIMESTAMPTZ,
  auto_renew        BOOLEAN NOT NULL DEFAULT true,

  credits_remaining INTEGER NOT NULL DEFAULT 0,

  list_cents        BIGINT NOT NULL,
  net_cents         BIGINT NOT NULL,
  vat_cents         BIGINT NOT NULL,
  gross_cents       BIGINT NOT NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_sp_plan CHECK (plan_code IN ('SUPPORTER', 'CREATOR', 'COMMERCIAL', 'BROADCAST')),
  CONSTRAINT chk_sp_term CHECK (term_months IN (12, 24)),
  CONSTRAINT chk_sp_credits CHECK (credits_remaining >= 0)
);

CREATE INDEX IF NOT EXISTS idx_sp_subs_user ON sanparks_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_sp_subs_expiry ON sanparks_subscriptions (expires_at);

-- Each term bought or renewed is kept, so the covered periods behind any
-- historical licence can be reconstructed years later.
CREATE TABLE IF NOT EXISTS sanparks_subscription_terms (
  term_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   UUID NOT NULL REFERENCES sanparks_subscriptions(subscription_id),
  sequence          INTEGER NOT NULL,
  plan_code         VARCHAR(20) NOT NULL,
  term_months       INTEGER NOT NULL,

  starts_at         TIMESTAMPTZ NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,

  continuous        BOOLEAN NOT NULL DEFAULT true,
  price_locked      BOOLEAN NOT NULL DEFAULT false,

  list_cents        BIGINT NOT NULL,
  net_cents         BIGINT NOT NULL,
  vat_cents         BIGINT NOT NULL,
  gross_cents       BIGINT NOT NULL,

  credits_added     INTEGER NOT NULL DEFAULT 0,
  credits_carried   INTEGER NOT NULL DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_sp_term_months CHECK (term_months IN (12, 24)),
  CONSTRAINT uq_sp_term_sequence UNIQUE (subscription_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_sp_terms_sub ON sanparks_subscription_terms (subscription_id);

-- ── Catalogue ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sanparks_assets (
  asset_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference         VARCHAR(32) UNIQUE NOT NULL,
  title             VARCHAR(300) NOT NULL,
  description       TEXT,
  park              VARCHAR(60) NOT NULL,
  species           VARCHAR(120),
  captured_at       TIMESTAMPTZ,

  media_type        VARCHAR(10) NOT NULL,
  max_resolution_tier VARCHAR(10) NOT NULL DEFAULT 'FULL',
  duration_seconds  INTEGER,
  rarity_tier       VARCHAR(24) NOT NULL DEFAULT 'STANDARD',
  demand_index      INTEGER NOT NULL DEFAULT 0,

  -- Rights state
  rights_status     VARCHAR(24) NOT NULL DEFAULT 'AVAILABLE',
  rights_holder_id  VARCHAR(64) NOT NULL DEFAULT 'sanparks',
  contributor_id    VARCHAR(64),
  contributor_type  VARCHAR(16) NOT NULL DEFAULT 'CONTRIBUTOR',
  contributor_royalty_bps INTEGER,

  -- Releases and conservation controls
  property_release_id VARCHAR(64),
  contains_identifiable_persons BOOLEAN NOT NULL DEFAULT false,
  model_release_id  VARCHAR(64),
  sensitive_species BOOLEAN NOT NULL DEFAULT false,
  geo_redacted      BOOLEAN NOT NULL DEFAULT false,
  embargo_until     TIMESTAMPTZ,

  preview_url       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_sp_media CHECK (media_type IN ('IMAGE', 'VIDEO')),
  CONSTRAINT chk_sp_resolution CHECK (max_resolution_tier IN ('WEB', 'FULL', 'MASTER')),
  CONSTRAINT chk_sp_rarity CHECK (rarity_tier IN ('STANDARD', 'NOTABLE', 'RARE', 'ONCE_IN_A_LIFETIME')),
  CONSTRAINT chk_sp_rights_status CHECK (rights_status IN ('AVAILABLE', 'EXCLUSIVELY_LICENSED', 'ASSIGNED', 'WITHDRAWN')),
  CONSTRAINT chk_sp_contributor_type CHECK (contributor_type IN ('SANPARKS', 'CONTRIBUTOR')),
  CONSTRAINT chk_sp_demand CHECK (demand_index >= 0),

  -- A species at poaching risk never leaves the platform with its location on it.
  CONSTRAINT chk_sp_sensitive_geo CHECK (sensitive_species = false OR geo_redacted = true)
);

CREATE INDEX IF NOT EXISTS idx_sp_assets_park ON sanparks_assets (park);
CREATE INDEX IF NOT EXISTS idx_sp_assets_status ON sanparks_assets (rights_status);
CREATE INDEX IF NOT EXISTS idx_sp_assets_demand ON sanparks_assets (demand_index DESC);
CREATE INDEX IF NOT EXISTS idx_sp_assets_media ON sanparks_assets (media_type);

-- ── Licences ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sanparks_licences (
  licence_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id          UUID NOT NULL REFERENCES sanparks_assets(asset_id),
  subscription_id   UUID NOT NULL REFERENCES sanparks_subscriptions(subscription_id),
  licensee_id       UUID NOT NULL,
  licensee_name     VARCHAR(200),

  scope             VARCHAR(24) NOT NULL,
  territory         VARCHAR(20) NOT NULL,
  territory_code    VARCHAR(12),
  licence_term      VARCHAR(16) NOT NULL,
  resolution_tier   VARCHAR(10) NOT NULL,
  exclusive         BOOLEAN NOT NULL DEFAULT false,
  instrument_type   VARCHAR(20) NOT NULL,

  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ,

  list_cents        BIGINT NOT NULL,
  net_cents         BIGINT NOT NULL,
  vat_cents         BIGINT NOT NULL,
  gross_cents       BIGINT NOT NULL,
  credits_spent     INTEGER NOT NULL DEFAULT 0,
  overage_units     INTEGER NOT NULL DEFAULT 0,

  status            VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  -- A replayed request must never write a second licence or take a second payment.
  idempotency_key   VARCHAR(120) UNIQUE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_sp_scope CHECK (scope IN ('PERSONAL', 'EDITORIAL', 'COMMERCIAL', 'BROADCAST', 'EXCLUSIVE_BUYOUT')),
  CONSTRAINT chk_sp_territory CHECK (territory IN ('SINGLE_COUNTRY', 'REGIONAL', 'WORLDWIDE')),
  CONSTRAINT chk_sp_licence_term CHECK (licence_term IN ('ONE_YEAR', 'THREE_YEARS', 'PERPETUAL')),
  CONSTRAINT chk_sp_licence_resolution CHECK (resolution_tier IN ('WEB', 'FULL', 'MASTER')),
  CONSTRAINT chk_sp_instrument CHECK (instrument_type IN ('LICENCE', 'EXCLUSIVE_LICENCE', 'ASSIGNMENT')),
  CONSTRAINT chk_sp_licence_status CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
  -- Anything narrower than worldwide has to say where.
  CONSTRAINT chk_sp_territory_code CHECK (territory = 'WORLDWIDE' OR territory_code IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_sp_lic_asset ON sanparks_licences (asset_id);
CREATE INDEX IF NOT EXISTS idx_sp_lic_licensee ON sanparks_licences (licensee_id);
CREATE INDEX IF NOT EXISTS idx_sp_lic_subscription ON sanparks_licences (subscription_id);
-- The exclusivity check reads this on every sale, under a row lock.
CREATE INDEX IF NOT EXISTS idx_sp_lic_active ON sanparks_licences (asset_id, status)
  WHERE status = 'ACTIVE';

-- ── Chain of title ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sanparks_rights_chain (
  chain_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id          UUID NOT NULL REFERENCES sanparks_assets(asset_id),
  licence_id        UUID REFERENCES sanparks_licences(licence_id),

  sequence          INTEGER NOT NULL,
  previous_hash     CHAR(64) NOT NULL,
  entry_hash        CHAR(64) NOT NULL,

  event             VARCHAR(32) NOT NULL,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at       TIMESTAMPTZ NOT NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_sp_chain_sequence UNIQUE (asset_id, sequence),
  CONSTRAINT uq_sp_chain_hash UNIQUE (entry_hash),
  CONSTRAINT chk_sp_chain_event CHECK (event IN (
    'ASSET_REGISTERED', 'LICENCE_GRANTED', 'RIGHTS_ASSIGNED', 'LICENCE_REVOKED', 'ASSET_WITHDRAWN'
  ))
);

CREATE INDEX IF NOT EXISTS idx_sp_chain_asset ON sanparks_rights_chain (asset_id, sequence);

-- ── Money out ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sanparks_revenue_splits (
  split_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licence_id        UUID NOT NULL REFERENCES sanparks_licences(licence_id),
  asset_id          UUID NOT NULL REFERENCES sanparks_assets(asset_id),

  beneficiary_type  VARCHAR(24) NOT NULL,
  beneficiary_id    VARCHAR(64),
  amount_cents      BIGINT NOT NULL,

  settled_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_sp_beneficiary CHECK (beneficiary_type IN ('CONSERVATION_LEVY', 'CONTRIBUTOR_ROYALTY', 'PLATFORM_FEE')),
  CONSTRAINT chk_sp_split_amount CHECK (amount_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_sp_splits_licence ON sanparks_revenue_splits (licence_id);
CREATE INDEX IF NOT EXISTS idx_sp_splits_beneficiary ON sanparks_revenue_splits (beneficiary_type, settled_at);

CREATE TABLE IF NOT EXISTS sanparks_payments (
  payment_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licence_id        UUID REFERENCES sanparks_licences(licence_id),
  subscription_id   UUID REFERENCES sanparks_subscriptions(subscription_id),
  payer_id          UUID NOT NULL,

  net_cents         BIGINT NOT NULL,
  vat_cents         BIGINT NOT NULL,
  gross_cents       BIGINT NOT NULL,

  status            VARCHAR(16) NOT NULL DEFAULT 'CAPTURED',
  captured_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_sp_payment_status CHECK (status IN ('PENDING', 'CAPTURED', 'REFUNDED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_sp_payments_payer ON sanparks_payments (payer_id);
CREATE INDEX IF NOT EXISTS idx_sp_payments_licence ON sanparks_payments (licence_id);

-- ── Seed catalogue ───────────────────────────────────────────────────────
-- A starting catalogue so the licensing flow is exercisable end to end.
-- Idempotent on the asset reference, because the migration runner re-applies
-- every migration on boot.

INSERT INTO sanparks_assets (
  reference, title, description, park, species, captured_at,
  media_type, max_resolution_tier, duration_seconds, rarity_tier, demand_index,
  contributor_id, contributor_type, property_release_id,
  contains_identifiable_persons, sensitive_species, geo_redacted
) VALUES
  ('SP-KRU-0001',
   'Lioness giving birth, Satara sector',
   'Continuous footage of a wild lioness delivering and cleaning three cubs at dawn. Captured under permit; the pride was not approached.',
   'KRUGER', 'Panthera leo', '2026-06-14T04:52:00Z',
   'VIDEO', 'MASTER', 247, 'ONCE_IN_A_LIFETIME', 912,
   'ranger-mokoena', 'CONTRIBUTOR', 'PR-KRU-2026-004', false, false, false),

  ('SP-KRU-0002',
   'Leopard descending a marula at last light',
   'Adult male leopard carrying an impala kill down a marula tree, Lower Sabie.',
   'KRUGER', 'Panthera pardus', '2026-04-02T17:10:00Z',
   'IMAGE', 'MASTER', NULL, 'RARE', 61,
   'ranger-mokoena', 'CONTRIBUTOR', 'PR-KRU-2026-004', false, false, false),

  ('SP-KRU-0003',
   'Black rhino cow and calf at a seep',
   'Critically endangered black rhino with calf. Location metadata stripped before ingest.',
   'KRUGER', 'Diceros bicornis', '2026-05-21T06:30:00Z',
   'IMAGE', 'FULL', NULL, 'RARE', 44,
   'sanparks-media', 'SANPARKS', 'PR-KRU-2026-001', false, true, true),

  ('SP-ADD-0004',
   'Elephant herd crossing at Hapoor',
   'Breeding herd of forty crossing the main road at Hapoor dam.',
   'ADDO', 'Loxodonta africana', '2026-03-11T09:05:00Z',
   'VIDEO', 'FULL', 96, 'NOTABLE', 23,
   'sanparks-media', 'SANPARKS', 'PR-ADD-2026-002', false, false, false),

  ('SP-TMN-0005',
   'Table Mountain under the tablecloth, aerial',
   'Aerial pass along the northern face as orographic cloud spills over the plateau.',
   'TABLE_MOUNTAIN', NULL, '2026-02-08T16:40:00Z',
   'VIDEO', 'MASTER', 184, 'NOTABLE', 78,
   'contributor-jvr', 'CONTRIBUTOR', 'PR-TMN-2026-011', false, false, false),

  ('SP-KGA-0006',
   'Black-maned Kalahari lion on a dune crest',
   'Male lion silhouetted on a red dune at first light, Nossob riverbed.',
   'KGALAGADI', 'Panthera leo', '2026-07-19T05:58:00Z',
   'IMAGE', 'MASTER', NULL, 'RARE', 37,
   'contributor-jvr', 'CONTRIBUTOR', 'PR-KGA-2026-007', false, false, false),

  ('SP-ISI-0007',
   'Loggerhead turtle nesting, Bhanga Nek',
   'Female loggerhead returning to the surf after nesting. Beach location generalised.',
   'ISIMANGALISO', 'Caretta caretta', '2026-01-27T22:15:00Z',
   'VIDEO', 'FULL', 143, 'RARE', 19,
   'sanparks-media', 'SANPARKS', 'PR-ISI-2026-003', false, true, true),

  ('SP-GGH-0008',
   'Bearded vulture over the Maluti escarpment',
   'Adult bearded vulture in flight against the sandstone escarpment. Fewer than 400 remain in southern Africa.',
   'GOLDEN_GATE', 'Gypaetus barbatus', '2026-05-03T11:22:00Z',
   'IMAGE', 'FULL', NULL, 'ONCE_IN_A_LIFETIME', 52,
   'contributor-nkosi', 'CONTRIBUTOR', NULL, false, true, true)
ON CONFLICT (reference) DO NOTHING;
