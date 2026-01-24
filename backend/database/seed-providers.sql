-- =============================================
-- PaySick Provider Seed Data
-- South African Healthcare Providers
-- =============================================

-- This file seeds the providers table with representative SA healthcare providers
-- Run this after schema.sql to populate initial provider data

-- Major Hospital Groups (Network Partners)

-- Netcare Hospitals (Platinum Network Partner)
INSERT INTO providers (
    provider_name, provider_type, provider_group,
    contact_email, contact_phone,
    address, city, province, postal_code,
    bank_name, branch_code, account_number_encrypted,
    network_partner, partnership_tier, commission_rate, status
) VALUES
('Netcare Milpark Hospital', 'hospital', 'Netcare',
 'info@milpark.co.za', '011 480 5600',
 '9 Guild Road, Parktown West', 'Johannesburg', 'Gauteng', '2193',
 'Standard Bank', '051001', encode('1234567890', 'base64'),
 true, 'platinum', 2.5, 'active'),

('Netcare Christiaan Barnard Memorial Hospital', 'hospital', 'Netcare',
 'info@christianbarnard.co.za', '021 480 6111',
 '181 Longmarket Street', 'Cape Town', 'Western Cape', '8001',
 'Standard Bank', '051001', encode('1234567891', 'base64'),
 true, 'platinum', 2.5, 'active'),

('Netcare Sunninghill Hospital', 'hospital', 'Netcare',
 'info@sunninghill.co.za', '011 806 1500',
 'Cnr Nanyuki & Wetherby Road', 'Johannesburg', 'Gauteng', '2157',
 'Standard Bank', '051001', encode('1234567892', 'base64'),
 true, 'platinum', 2.5, 'active');

-- Life Healthcare Group (Gold Network Partner)
INSERT INTO providers (
    provider_name, provider_type, provider_group,
    contact_email, contact_phone,
    address, city, province, postal_code,
    bank_name, branch_code, account_number_encrypted,
    network_partner, partnership_tier, commission_rate, status
) VALUES
('Life Fourways Hospital', 'hospital', 'Life Healthcare',
 'info@lifefourways.co.za', '011 875 1000',
 'Cedar Road West', 'Johannesburg', 'Gauteng', '2055',
 'FNB', '250655', encode('2345678901', 'base64'),
 true, 'gold', 3.0, 'active'),

('Life Vincent Pallotti Hospital', 'hospital', 'Life Healthcare',
 'info@lifevincentpallotti.co.za', '021 506 5111',
 'Alexandra Road, Pinelands', 'Cape Town', 'Western Cape', '7405',
 'FNB', '250655', encode('2345678902', 'base64'),
 true, 'gold', 3.0, 'active'),

('Life Entabeni Hospital', 'hospital', 'Life Healthcare',
 'info@lifeentabeni.co.za', '031 204 1300',
 '148 South Ridge Road', 'Durban', 'KwaZulu-Natal', '4001',
 'FNB', '250655', encode('2345678903', 'base64'),
 true, 'gold', 3.0, 'active');

-- Mediclinic Group (Gold Network Partner)
INSERT INTO providers (
    provider_name, provider_type, provider_group,
    contact_email, contact_phone,
    address, city, province, postal_code,
    bank_name, branch_code, account_number_encrypted,
    network_partner, partnership_tier, commission_rate, status
) VALUES
('Mediclinic Sandton', 'hospital', 'Mediclinic',
 'info@mediclinicsandton.co.za', '011 709 2000',
 'Peter Place, Lyme Park', 'Johannesburg', 'Gauteng', '2196',
 'ABSA', '632005', encode('3456789012', 'base64'),
 true, 'gold', 3.0, 'active'),

('Mediclinic Cape Town', 'hospital', 'Mediclinic',
 'info@mediclinic.capetown.co.za', '021 464 5500',
 '21 Hof Street, Oranjezicht', 'Cape Town', 'Western Cape', '8001',
 'ABSA', '632005', encode('3456789013', 'base64'),
 true, 'gold', 3.0, 'active'),

('Mediclinic Newcastle', 'hospital', 'Mediclinic',
 'info@mediclinicnewcastle.co.za', '034 328 8000',
 'Voortrekker Street', 'Newcastle', 'KwaZulu-Natal', '2940',
 'ABSA', '632005', encode('3456789014', 'base64'),
 true, 'gold', 3.0, 'active');

-- Independent Clinics (Silver Network Partners)
INSERT INTO providers (
    provider_name, provider_type, provider_group,
    contact_email, contact_phone,
    address, city, province, postal_code,
    bank_name, branch_code, account_number_encrypted,
    network_partner, partnership_tier, commission_rate, status
) VALUES
('Parktown Medi-Clinic', 'clinic', NULL,
 'info@parktownmedic.co.za', '011 482 5100',
 'Jan Smuts Avenue', 'Johannesburg', 'Gauteng', '2193',
 'Nedbank', '198765', encode('4567890123', 'base64'),
 true, 'silver', 3.5, 'active'),

('Century City Medical Centre', 'clinic', NULL,
 'info@ccmedical.co.za', '021 528 7000',
 'Sable Road, Century City', 'Cape Town', 'Western Cape', '7441',
 'Nedbank', '198765', encode('4567890124', 'base64'),
 true, 'silver', 3.5, 'active'),

('Gateway Private Hospital', 'clinic', NULL,
 'info@gatewayprivate.co.za', '031 303 2300',
 'Aurora Drive, Umhlanga', 'Durban', 'KwaZulu-Natal', '4319',
 'Capitec', '470010', encode('4567890125', 'base64'),
 true, 'silver', 3.5, 'active');

-- GP Practices (Basic Network Partners)
INSERT INTO providers (
    provider_name, provider_type, provider_group,
    contact_email, contact_phone,
    address, city, province, postal_code,
    bank_name, branch_code, account_number_encrypted,
    network_partner, partnership_tier, commission_rate, status
) VALUES
('Rosebank Family Practice', 'gp_practice', NULL,
 'info@rosebankfamily.co.za', '011 447 3456',
 'Tyrwhitt Avenue, Rosebank', 'Johannesburg', 'Gauteng', '2196',
 'Capitec', '470010', encode('5678901234', 'base64'),
 true, 'basic', 4.0, 'active'),

('Sea Point Medical Centre', 'gp_practice', NULL,
 'info@seapointmed.co.za', '021 434 7890',
 'Main Road, Sea Point', 'Cape Town', 'Western Cape', '8005',
 'Discovery Bank', '679000', encode('5678901235', 'base64'),
 true, 'basic', 4.0, 'active'),

('Morningside Health Clinic', 'gp_practice', NULL,
 'info@morningsidehealth.co.za', '031 312 4567',
 'Windermere Road, Morningside', 'Durban', 'KwaZulu-Natal', '4001',
 'Standard Bank', '051001', encode('5678901236', 'base64'),
 true, 'basic', 4.0, 'active'),

('Menlyn Family Doctors', 'gp_practice', NULL,
 'info@menlynfamily.co.za', '012 348 5678',
 'Atterbury Road, Menlyn', 'Pretoria', 'Gauteng', '0181',
 'FNB', '250655', encode('5678901237', 'base64'),
 true, 'basic', 4.0, 'active');

-- Specialist Practices (Basic Network Partners)
INSERT INTO providers (
    provider_name, provider_type, provider_group,
    contact_email, contact_phone,
    address, city, province, postal_code,
    bank_name, branch_code, account_number_encrypted,
    network_partner, partnership_tier, commission_rate, status
) VALUES
('Sandton Orthopaedic Centre', 'specialist', NULL,
 'info@sandtonortho.co.za', '011 784 5000',
 'Rivonia Road, Sandton', 'Johannesburg', 'Gauteng', '2196',
 'ABSA', '632005', encode('6789012345', 'base64'),
 true, 'basic', 4.5, 'active'),

('Cape Town Dental Specialists', 'specialist', NULL,
 'info@ctdentalspec.co.za', '021 421 8900',
 'Loop Street, City Centre', 'Cape Town', 'Western Cape', '8001',
 'Nedbank', '198765', encode('6789012346', 'base64'),
 true, 'basic', 4.5, 'active'),

('Spec-Savers Menlyn', 'specialist', 'Spec-Savers',
 'menlyn@specsavers.co.za', '012 368 3600',
 'Menlyn Park Shopping Centre', 'Pretoria', 'Gauteng', '0181',
 'Capitec', '470010', encode('6789012347', 'base64'),
 true, 'basic', 4.0, 'active'),

('Spec-Savers Canal Walk', 'specialist', 'Spec-Savers',
 'canalwalk@specsavers.co.za', '021 555 2828',
 'Canal Walk Shopping Centre', 'Cape Town', 'Western Cape', '7441',
 'Capitec', '470010', encode('6789012348', 'base64'),
 true, 'basic', 4.0, 'active'),

('Dr. Thato Kgosi - Plastic & Reconstructive Surgery', 'specialist', NULL,
 'contact@drkgosiplastics.co.za', '011 268 8900',
 'Morningside Medical Centre, Rivonia Road', 'Johannesburg', 'Gauteng', '2196',
 'Standard Bank', '051001', encode('6789012349', 'base64'),
 true, 'gold', 4.0, 'active');

-- Non-Network Providers (Standard providers, not in preferred network)
INSERT INTO providers (
    provider_name, provider_type, provider_group,
    contact_email, contact_phone,
    address, city, province, postal_code,
    bank_name, branch_code, account_number_encrypted,
    network_partner, partnership_tier, commission_rate, status
) VALUES
('Bloemfontein Medi-Cross', 'hospital', NULL,
 'info@bloemmedicross.co.za', '051 405 8000',
 'Kellner Street', 'Bloemfontein', 'Free State', '9301',
 'Standard Bank', '051001', encode('7890123456', 'base64'),
 false, NULL, NULL, 'active'),

('Port Elizabeth Provincial Hospital', 'hospital', NULL,
 'info@peprovincial.co.za', '041 405 2111',
 'Buckingham Road', 'Port Elizabeth', 'Eastern Cape', '6001',
 'FNB', '250655', encode('7890123457', 'base64'),
 false, NULL, NULL, 'active'),

('Polokwane Medi-Clinic', 'clinic', NULL,
 'info@polokwanemedic.co.za', '015 290 3000',
 'Market Street', 'Polokwane', 'Limpopo', '0700',
 'Nedbank', '198765', encode('7890123458', 'base64'),
 false, NULL, NULL, 'active'),

('Rustenburg Medical Centre', 'clinic', NULL,
 'info@rustenburgmedical.co.za', '014 592 3456',
 'Beyers Naude Drive', 'Rustenburg', 'North West', '0300',
 'ABSA', '632005', encode('7890123459', 'base64'),
 false, NULL, NULL, 'active'),

('Kimberley Day Hospital', 'clinic', NULL,
 'info@kimberleyday.co.za', '053 833 1111',
 'Du Toitspan Road', 'Kimberley', 'Northern Cape', '8301',
 'Capitec', '470010', encode('7890123460', 'base64'),
 false, NULL, NULL, 'active');

-- Pending Applications (To be reviewed by admin)
INSERT INTO providers (
    provider_name, provider_type, provider_group,
    contact_email, contact_phone,
    address, city, province, postal_code,
    bank_name, branch_code, account_number_encrypted,
    network_partner, partnership_tier, commission_rate, status
) VALUES
('Midrand Family Practice', 'gp_practice', NULL,
 'info@midrandfamily.co.za', '011 318 8900',
 'New Road, Midrand', 'Johannesburg', 'Gauteng', '1685',
 'Discovery Bank', '679000', encode('8901234567', 'base64'),
 false, NULL, NULL, 'pending'),

('Stellenbosch Dental Care', 'specialist', NULL,
 'info@stellenboschdental.co.za', '021 887 4500',
 'Church Street', 'Stellenbosch', 'Western Cape', '7600',
 'Standard Bank', '051001', encode('8901234568', 'base64'),
 false, NULL, NULL, 'pending'),

('Ballito Wellness Centre', 'clinic', NULL,
 'info@ballitowellness.co.za', '032 946 3200',
 'Ballito Drive', 'Ballito', 'KwaZulu-Natal', '4420',
 'FNB', '250655', encode('8901234569', 'base64'),
 false, NULL, NULL, 'pending');

-- =============================================
-- Summary Statistics
-- =============================================
-- Total Providers: 31
-- Network Partners: 21 (67.7%)
--   - Platinum: 3 (9.7%)
--   - Gold: 7 (22.6%) - includes Dr. Thato Kgosi
--   - Silver: 3 (9.7%)
--   - Basic: 8 (25.8%)
-- Standard Providers: 7 (22.6%)
-- Pending Applications: 3 (9.7%)
--
-- Coverage:
--   - Gauteng: 12 providers (includes Dr. Thato Kgosi)
--   - Western Cape: 8 providers
--   - KwaZulu-Natal: 6 providers
--   - Free State: 1 provider
--   - Eastern Cape: 1 provider
--   - Limpopo: 1 provider
--   - North West: 1 provider
--   - Northern Cape: 1 provider
--
-- Provider Types:
--   - Hospitals: 11
--   - Clinics: 8
--   - GP Practices: 7
--   - Specialists: 5 (includes Dr. Thato Kgosi - Plastic & Reconstructive Surgery)
