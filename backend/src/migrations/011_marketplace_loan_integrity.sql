-- =============================================
-- Migration 011: Marketplace Loan Integrity
--
-- DB-level backstops for two bugs fixed in application code
-- (marketplace-auction.service.js):
--
--   1. The 22.25% marketplace rate cap (LENDER_HARD_RULES.max_rate_apr in
--      lender-gate.service.js) was defined but never enforced on the
--      offer-write path. It is now enforced in createLenderOffer(), and
--      this constraint makes it impossible to bypass by writing directly
--      to the table.
--
--   2. acceptOffer() could be raced: two concurrent accepts on two
--      different PENDING offers for the same application could both
--      succeed, creating two loans. The row lock added in application
--      code closes the race; this unique index makes a second loan for
--      the same application impossible even if some other code path ever
--      calls into marketplace_loans without going through acceptOffer().
-- =============================================

ALTER TABLE lender_offers
  ADD CONSTRAINT chk_offer_rate_marketplace_cap CHECK (interest_rate <= 0.2225);

CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_loans_one_per_application
  ON marketplace_loans (application_id);
