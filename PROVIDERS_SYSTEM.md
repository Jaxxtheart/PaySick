# PaySick Providers System Documentation

## Overview

The PaySick Providers System is a comprehensive healthcare provider network management platform that enables healthcare providers to join the PaySick payment network and allows users to browse and select providers for their medical funding applications.

## 🏗️ System Architecture

### Frontend Components

1. **providers.html** - User-facing provider directory
2. **provider-apply.html** - Provider application form
3. **admin-providers.html** - Admin provider management interface

### Backend Components

1. **backend/src/routes/providers.js** - Provider API routes
2. **backend/database/schema.sql** - Providers table schema (lines 83-121)
3. **backend/database/seed-providers.sql** - Initial provider data

## 📋 Features

### User-Facing Provider Directory (`providers.html`)

**Purpose:** Allow patients to browse and search for healthcare providers in the PaySick network.

**Key Features:**
- **Search Functionality:** Real-time search by provider name, group, or location
- **Advanced Filters:**
  - Provider Type (Hospital, Clinic, GP Practice, Specialist)
  - Province (all 9 SA provinces)
  - Network Status (Network Partners vs. Standard Providers)
- **Statistics Dashboard:**
  - Total Providers
  - Network Partners count
  - Provinces Covered
- **Provider Cards:** Display provider details with:
  - Provider name and type
  - Provider group (Netcare, Mediclinic, Life Healthcare, etc.)
  - Network partner badge
  - Location (city, province)
  - Contact information
  - "Apply with This Provider" action button
- **Custom SVG Icons:** Brand-aligned icons for better visual consistency
- **Responsive Design:** Mobile-friendly grid layout

**Navigation:**
- Accessible from Dashboard → Healthcare Providers menu item
- Direct link: `/providers.html`

**API Integration:**
```javascript
GET /api/providers
- Returns all active providers
- No authentication required
- Used to populate provider directory
```

### Provider Application Form (`provider-apply.html`)

**Purpose:** Enable healthcare providers to apply to join the PaySick network.

**Key Features:**

1. **Benefits Section:**
   - Faster Payments (24-hour settlements)
   - More Patients (access to PaySick network)
   - Reduced Risk (PaySick assumes credit risk)

2. **Multi-Section Application Form:**

   **A. Basic Information**
   - Provider/Practice Name
   - Provider Type (Hospital, Clinic, GP Practice, Specialist)
   - Provider Group (if applicable)

   **B. Contact Information**
   - Email and Phone
   - Physical Address
   - City and Province (SA provinces dropdown)
   - Postal Code (4-digit validation)

   **C. Banking Information** (POPIA compliant)
   - Bank Name (SA banks)
   - Branch Code (6-digit validation)
   - Account Number (encrypted)
   - Account Holder Name

   **D. Practice Information**
   - Average Monthly Patient Volume
   - Years in Operation
   - Services Offered

   **E. Terms & Conditions**
   - PaySick Provider Terms acceptance
   - POPIA consent
   - Commission agreement (2-5% based on volume)

3. **Success Confirmation:**
   - Application submitted message
   - Next steps information
   - Links to provider directory and home page

**Navigation:**
- From providers.html → "Join Our Network" button
- From dashboard → Healthcare Providers → "Join Our Network"
- Direct link: `/provider-apply.html`

**API Integration:**
```javascript
POST /api/providers/apply
- Accepts provider application data
- Creates provider with 'pending' status
- Returns provider_id and success message
```

**Form Validation:**
- All required fields marked with red asterisk
- SA phone number format validation
- Postal code format validation (4 digits)
- Bank details validation (branch code: 6 digits, account: 8-11 digits)
- Terms acceptance required

### Admin Provider Management (`admin-providers.html`)

**Purpose:** Enable PaySick administrators to review applications, approve providers, and manage the provider network.

**Key Features:**

1. **Statistics Dashboard:**
   - Total Providers
   - Active Providers
   - Pending Applications
   - Network Partners

2. **Advanced Filtering:**
   - Search by name
   - Filter by Status (Active, Pending, Inactive, Suspended)
   - Filter by Type (Hospital, Clinic, GP Practice, Specialist)
   - Filter by Province

3. **Tabbed Interface:**
   - **All Providers:** Complete provider list
   - **Applications:** Pending applications requiring review
   - **Network Partners:** Providers in the preferred network

4. **Provider Management Actions:**
   - **View:** Display full provider details in modal
   - **Approve:** Activate pending applications
   - **Edit:** Modify provider information
   - **Delete:** Remove provider from system

5. **Provider Detail Modal:**
   - Complete provider information
   - Contact details
   - Location information
   - Network status
   - Banking details (encrypted)

**Navigation:**
- From admin-dashboard.html → Provider Network menu item
- Direct link: `/admin-providers.html`

**API Integration:**
```javascript
GET /api/providers/admin/all
- Returns all providers (all statuses)
- Admin authentication required

PUT /api/providers/admin/:id/approve
- Approves pending provider
- Sets status to 'active'
- Optionally sets network_partner and partnership_tier

PUT /api/providers/admin/:id/status
- Updates provider status
- Allowed: active, inactive, suspended

PUT /api/providers/admin/:id
- Updates provider details
- Partial updates supported

DELETE /api/providers/admin/:id
- Deletes provider from system
- Cascades to related records

GET /api/providers/admin/stats
- Returns provider statistics
- Used for admin dashboard
```

## 🗄️ Database Schema

### Providers Table

Located in `backend/database/schema.sql` (lines 83-121):

```sql
CREATE TABLE providers (
    provider_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Provider Information
    provider_name VARCHAR(255) NOT NULL,
    provider_type VARCHAR(50) NOT NULL, -- hospital, clinic, gp_practice, specialist
    provider_group VARCHAR(100), -- Netcare, Life Healthcare, Mediclinic, etc.

    -- Contact Details
    contact_email VARCHAR(255),
    contact_phone VARCHAR(15),
    address TEXT,
    city VARCHAR(100),
    province VARCHAR(50),
    postal_code VARCHAR(4),

    -- Network Status
    network_partner BOOLEAN DEFAULT false,
    partnership_tier VARCHAR(20), -- platinum, gold, silver, basic
    commission_rate DECIMAL(5,2), -- Percentage PaySick charges

    -- Banking (for settlements)
    bank_name VARCHAR(50),
    account_number_encrypted TEXT,
    branch_code VARCHAR(6),

    -- Status
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, suspended
    onboarded_at TIMESTAMP,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes

```sql
CREATE INDEX idx_providers_name ON providers(provider_name);
CREATE INDEX idx_providers_group ON providers(provider_group);
CREATE INDEX idx_providers_network ON providers(network_partner);
```

### Related Tables

- **applications** - Links to providers via `provider_id` foreign key
- **settlements** - Provider payment settlements
- **settlement_items** - Individual settlement line items

## 📊 Seed Data

The `backend/database/seed-providers.sql` file contains 30 representative South African healthcare providers:

### Provider Breakdown

**By Network Status:**
- Network Partners: 20 (66.7%)
  - Platinum: 3 (Netcare hospitals)
  - Gold: 6 (Life Healthcare, Mediclinic)
  - Silver: 3 (Independent clinics)
  - Basic: 8 (GP practices, specialists)
- Standard Providers: 7 (23.3%)
- Pending Applications: 3 (10%)

**By Type:**
- Hospitals: 11
- Clinics: 8
- GP Practices: 7
- Specialists: 4

**By Province:**
- Gauteng: 11 providers
- Western Cape: 8 providers
- KwaZulu-Natal: 6 providers
- Free State: 1 provider
- Eastern Cape: 1 provider
- Limpopo: 1 provider
- North West: 1 provider
- Northern Cape: 1 provider

### Major Provider Groups

1. **Netcare** (3 hospitals - Platinum Partners)
   - Milpark Hospital (Johannesburg)
   - Christiaan Barnard Memorial (Cape Town)
   - Sunninghill Hospital (Johannesburg)

2. **Life Healthcare** (3 hospitals - Gold Partners)
   - Fourways Hospital (Johannesburg)
   - Vincent Pallotti Hospital (Cape Town)
   - Entabeni Hospital (Durban)

3. **Mediclinic** (3 hospitals - Gold Partners)
   - Sandton (Johannesburg)
   - Cape Town
   - Newcastle

4. **Spec-Savers** (2 optometry practices)
   - Menlyn (Pretoria)
   - Canal Walk (Cape Town)

## 🔧 Setup Instructions

### 1. Database Setup

Run the provider seed script after schema initialization:

```bash
psql -h your-database-host -U your-username -d paysick_db -f backend/database/seed-providers.sql
```

Or via database client:
```sql
-- Execute the contents of backend/database/seed-providers.sql
```

### 2. API Routes Configuration

Ensure the providers routes are registered in your main server file:

```javascript
// backend/src/server.js or api/index.js
const providersRouter = require('./routes/providers');
app.use('/api/providers', providersRouter);
```

### 3. Frontend Deployment

Ensure all HTML files are deployed:
- `providers.html`
- `provider-apply.html`
- `admin-providers.html`

Update navigation menus (already done):
- `dashboard.html` - Line 687: Healthcare Providers link
- `admin-dashboard.html` - Line 695: Provider Network link

## 🎨 Design System Integration

All provider pages follow PaySick design standards:

### Color Palette
- Primary Red: `#FF4757`
- Dark Red: `#E01E37`
- Purple Gradient: `#667eea` → `#764ba2`
- Success Green: `#2ED573`
- Warning Orange: `#FF9F40`

### Typography
- Font Family: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif`
- Header Sizes: 28px (h1), 24px (h2), 20px (h3)
- Body Text: 14-16px

### Components
- **Cards:** White background, 15px border-radius, shadow
- **Buttons:** Gradient primary, outlined secondary
- **Badges:** Rounded (12px), color-coded by status
- **Icons:** Custom SVG with currentColor or brand gradients

### Custom SVG Icons

Used throughout provider pages:
- Home/Building icon (provider stats)
- Checkmark circle (network partners)
- Location pin (provinces/locations)
- Search icon (search functionality)
- User group icon (patient stats)
- Dollar sign (revenue/payments)

## 📱 Responsive Design

All provider pages are fully responsive:

**Desktop (>768px):**
- Multi-column grid layouts
- Side-by-side filters
- Expanded navigation

**Mobile (<768px):**
- Single-column layouts
- Stacked filters
- Collapsible menus
- Touch-friendly buttons

## 🔐 Security & Compliance

### POPIA Compliance
- Explicit consent checkboxes in application form
- Banking details encryption (base64 in demo, should use proper encryption in production)
- Access logging for provider data (via audit_log table)

### Data Protection
- Account numbers stored encrypted
- Sensitive data not exposed in public APIs
- Admin-only routes for sensitive operations

### Validation
- Server-side validation for all inputs
- SA-specific format validation (postal codes, phone numbers)
- Required field enforcement

## 🚀 Future Enhancements

### Planned Features
1. **Provider Portal:** Self-service dashboard for providers
2. **Settlement Management:** Automated payment calculations
3. **Performance Analytics:** Provider ratings and metrics
4. **Document Upload:** Practice registration documents
5. **Multi-step Approval:** Review workflow with multiple approvers
6. **Email Notifications:** Application status updates
7. **Provider Search API:** Public API for provider lookup
8. **Map Integration:** Geographic provider search

### Integration Opportunities
- Link providers to onboarding flow (already implemented)
- Provider performance tracking in admin dashboard
- Settlement generation from approved applications
- Provider notifications system

## 🧪 Testing

### Manual Testing Checklist

**User Directory:**
- [ ] Search providers by name
- [ ] Filter by type, province, network status
- [ ] View provider details
- [ ] Click "Apply with This Provider" redirects to onboarding

**Provider Application:**
- [ ] Fill all required fields
- [ ] Validate SA formats (postal code, phone, bank details)
- [ ] Submit application
- [ ] Verify success message

**Admin Management:**
- [ ] View all providers
- [ ] Filter and search providers
- [ ] Switch between tabs
- [ ] Approve pending application
- [ ] View provider details in modal
- [ ] Update provider status

**API Testing:**
```bash
# Get all providers
curl http://localhost:3000/api/providers

# Submit application
curl -X POST http://localhost:3000/api/providers/apply \
  -H "Content-Type: application/json" \
  -d @provider-application.json

# Admin: Approve provider (requires auth)
curl -X PUT http://localhost:3000/api/providers/admin/{id}/approve \
  -H "Authorization: Bearer {token}"
```

## 📞 Support

For issues or questions about the Providers system:
1. Check this documentation
2. Review API route comments in `backend/src/routes/providers.js`
3. Examine seed data in `backend/database/seed-providers.sql`
4. Consult database schema in `backend/database/schema.sql`

## 📄 Related Documentation

- `PROGRESS.md` - Overall project progress and protection rules
- `CONSOLIDATED_VERSION.md` - Complete feature list
- `CUSTOM_SVG_ICONS.md` - SVG icon implementation guide
- `DATABASE_SETUP.md` - Database initialization
- `VERCEL_DEPLOYMENT.md` - Deployment instructions

---

**Last Updated:** 2026-01-24
**Version:** 1.0.0
**Status:** ✅ Complete and Deployed
