# Changelog

All notable changes to the PaySick project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-01-25

### Changed

#### Design System Overhaul
- **Replaced all emoji icons with custom SVG icons** across entire platform
  - Created unified SVG icon system using PaySick brand gradient (#FF4757 to #E01E37)
  - Replaced emojis in: `index.html`, `dashboard.html`, `admin-dashboard.html`, `onboarding.html`, `collections.html`
  - Icons include: lightning bolt, calendar, shield, network nodes, mobile phone, headset, menu, home, credit card, documents, charts, settings, notifications, logout, and more
  - All SVG icons sized at 40px within 80px containers for consistency
  - Menu icons use `currentColor` for seamless theme adaptation

- **Updated provider network statement to generic, compliant language**
  - Removed all references to specific healthcare provider business names (Netcare, Mediclinic, Life Healthcare)
  - Changed "Wide Network" feature text to generic statement: "Access healthcare services at facilities in our growing network of medical providers across South Africa"
  - Ensures compliance with partnership agreements and marketing regulations

### Added

#### New Website Pages
- **Providers Partnership Page** (`providers.html`)
  - Complete provider recruitment page with benefits grid
  - Partnership statistics and features
  - Contact form for provider inquiries
  - Custom SVG icons for all features
  - POPIA-compliant data handling

- **Privacy Policy Page** (`privacy.html`)
  - Comprehensive POPIA-compliant privacy policy
  - Detailed coverage of Sections 19-22 of POPIA
  - Information on data collection, usage, storage, and rights
  - Professional legal layout with table of contents

- **Terms of Service Page** (`terms.html`)
  - Detailed terms and conditions
  - Explicit "not credit" disclaimers
  - Legal compliance with NCA, POPIA, and FICA
  - Clear payment plan terms and user responsibilities

- **About Us Page** (`about.html`)
  - Company mission, vision, and story
  - Core values with custom SVG icons
  - Statistics and impact metrics
  - Team introduction section

- **Contact Us Page** (`contact.html`)
  - Multi-method contact options
  - Contact form with client-side validation
  - Office hours and location information
  - Custom SVG icons for contact methods

#### Deployment Infrastructure
- **Root-level `package.json`** for Vercel serverless deployment
  - All backend dependencies included
  - Node.js version set to 24.x per Vercel requirements
  - Proper engine specifications

- **Vercel serverless entry point** (`/api/index.js`)
  - Created serverless function entry point
  - Exports Express app for Vercel serverless architecture

### Fixed

#### Vercel Deployment Issues
- **Modernized `vercel.json` configuration**
  - Removed deprecated `builds` and `routes` configuration
  - Replaced with modern `rewrites` configuration
  - Eliminated "Build Settings will not apply" warning

- **Node.js version compatibility**
  - Updated from Node.js 18.x to 24.x
  - Fixed ">=18.x will auto-upgrade" warning
  - Ensures compatibility with latest Vercel platform

- **Server.js conditional execution**
  - Updated `backend/src/server.js` to conditionally start HTTP server
  - Only runs `app.listen()` in development/non-Vercel environments
  - Exports app module for serverless function usage

### Documentation

- Updated `DESIGN_SYSTEM.md` with custom SVG icon system documentation
- Created comprehensive `CHANGELOG.md` (this file)
- Updated `README.md` to reflect new features and remove emoji usage
- Updated `VERCEL_DEPLOYMENT.md` with Node.js 24.x requirements

## [1.1.0] - 2026-01-16

### Added
- Complete database schema with POPIA compliance
- User authentication system with JWT
- Payment plan application system
- Collections management dashboard
- Admin dashboard with analytics
- Comprehensive API documentation
- Vercel deployment configuration

### Security
- JWT-based authentication
- POPIA compliance logging
- Audit trail system
- Rate limiting (100 requests per 15 minutes)
- Helmet.js security headers
- CORS protection

## [1.0.0] - 2026-01-15

### Added
- Initial release of PaySick platform
- Landing page with feature showcase
- User login and registration
- User onboarding flow
- Patient dashboard
- PostgreSQL database schema
- Express.js REST API
- Basic documentation

---

## Upgrade Guide

### Upgrading to 1.2.0

#### For Developers

1. **Pull latest changes:**
   ```bash
   git pull origin main
   ```

2. **Update dependencies (if needed):**
   ```bash
   cd backend
   npm install
   ```

3. **No database migrations required** - This release only updates frontend files and deployment configuration

#### For Deployment

1. **Vercel users:**
   - Automatic deployment on push to main branch
   - No environment variable changes needed
   - Node.js 24.x will be automatically used

2. **Local development:**
   - No changes required to existing setup
   - SVG icons are static HTML/CSS, no additional dependencies

#### Breaking Changes

**None** - This release is fully backward compatible. All changes are additive (new pages) or visual improvements (SVG icons replacing emojis).

---

## Migration Notes

### From Emoji Icons to SVG Icons

All emoji icons have been replaced with custom SVG implementations. If you have customized any HTML files, you may need to update your custom code to use the new SVG icon format:

**Old (Emoji):**
```html
<div class="feature-icon">⚡</div>
```

**New (SVG):**
```html
<div class="feature-icon">
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="lightningGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#FF4757;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#E01E37;stop-opacity:1" />
            </linearGradient>
        </defs>
        <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" fill="url(#lightningGradient)" stroke="url(#lightningGradient)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
</div>
```

See `DESIGN_SYSTEM.md` for complete icon documentation and all available icons.

---

## Contributors

- **Claude AI** - Development assistance and code generation
- **Jaxxtheart** - Product vision and requirements

---

## Links

- [Repository](https://github.com/Jaxxtheart/PaySick)
- [Documentation](./README.md)
- [Design System](./DESIGN_SYSTEM.md)
- [Deployment Guide](./VERCEL_DEPLOYMENT.md)
