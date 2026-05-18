-- =============================================
-- PaySick Marketplace Seed Data
-- Seeds initial lender (PaySick Balance Sheet)
-- =============================================

-- Insert PaySick as the first lender (balance sheet lending)
INSERT INTO lenders (
    name,
    code,
    type,
    active,

    -- Loan Limits
    min_loan_amount,
    max_loan_amount,

    -- Risk Appetite (accepts all risk tiers)
    min_risk_score,
    max_risk_score,

    -- Pricing
    base_rate,
    risk_premium_low,
    risk_premium_mid,
    risk_premium_high,

    -- Terms
    min_term,
    max_term,

    -- Fees
    origination_fee_perc,
    service_fee_monthly,

    -- Contact
    contact_email,
    contact_phone
) VALUES (
    'PaySick',
    'PAYSICK',
    'PAYSICK_BALANCE_SHEET',
    true,

    -- Loan Limits: R5,000 to R500,000
    5000.00,
    500000.00,

    -- Risk: Accept scores 20-100
    20,
    100,

    -- Pricing: 18% base rate
    0.18,
    0.02,   -- +2% for low risk
    0.05,   -- +5% for medium risk
    0.10,   -- +10% for high risk

    -- Terms: 3 to 24 months
    3,
    24,

    -- Fees: 2.5% origination, no monthly service fee
    0.025,
    0.00,

    -- Contact
    'lending@paysick.co.za',
    '+27 21 123 4567'
) ON CONFLICT (code) DO NOTHING;

-- Insert sample external lender (for testing marketplace competition)
INSERT INTO lenders (
    name,
    code,
    type,
    active,

    -- Loan Limits
    min_loan_amount,
    max_loan_amount,

    -- Risk Appetite (only low and medium risk)
    min_risk_score,
    max_risk_score,

    -- Pricing (competitive rates)
    base_rate,
    risk_premium_low,
    risk_premium_mid,
    risk_premium_high,

    -- Terms
    min_term,
    max_term,

    -- Fees
    origination_fee_perc,
    service_fee_monthly,

    -- Contact
    contact_email,
    contact_phone
) VALUES (
    'MediFin Bank',
    'MEDIFIN',
    'BANK',
    true,

    -- Loan Limits: R10,000 to R250,000
    10000.00,
    250000.00,

    -- Risk: Only accept scores 50-100 (low and medium risk)
    50,
    100,

    -- Pricing: 16% base rate (more competitive)
    0.16,
    0.01,   -- +1% for low risk
    0.03,   -- +3% for medium risk
    0.08,   -- +8% for high risk (rarely used due to min score)

    -- Terms: 6 to 36 months
    6,
    36,

    -- Fees: 2% origination, R50 monthly service fee
    0.02,
    50.00,

    -- Contact
    'loans@medifin.example.com',
    '+27 11 987 6543'
) ON CONFLICT (code) DO NOTHING;

-- Verify insertion
DO $$
DECLARE
    lender_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO lender_count FROM lenders;
    RAISE NOTICE '✅ Marketplace seeded with % lender(s)', lender_count;
END $$;
