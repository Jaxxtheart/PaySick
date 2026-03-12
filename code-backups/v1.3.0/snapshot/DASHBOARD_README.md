# PaySick Dashboard Documentation

## Overview

The PaySick platform includes a complete dashboard system with role-based access control, featuring patient, provider, lender, and admin views. The platform manages healthcare payment plans with banking-grade security.

## Features

### Authentication System

- **Role-based access control** (User, Provider, Lender, Admin)
- **Opaque token authentication** (banking-grade, database-validated)
- **Session management** with server-side token validation
- **Protected routes** with automatic redirection
- **Account lockout** after failed login attempts
- **AES-256-GCM encryption** for sensitive banking data

### Patient Dashboard

The patient dashboard (`dashboard.html`) provides a comprehensive view of personal payment plans and financial information.

- **Stats Overview**: Total balance, next payment, total paid this year, active plans
- **Active Payment Plans**: Detailed plan information with progress tracking
- **Upcoming Payments**: Chronological scheduled payments
- **Quick Actions**: Make payment, view statements, account settings

### Admin Dashboard

The admin dashboard (`admin-dashboard.html`) provides system-wide management capabilities.

- **System Statistics**: Users, revenue, active plans, payment success rate
- **User Management**: View and manage all registered users
- **Payment Plans**: System-wide plan management and monitoring
- **Activity Feed**: Real-time system activity and audit trail
- **Shield Underwriting**: Risk assessment framework management

## Architecture

### Technology Stack
- **Backend**: Node.js, Express.js, PostgreSQL
- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Security**: Opaque tokens, AES-256-GCM encryption, rate limiting
- **Auth**: Server-side session validation on every request

### Authentication Flow

1. User navigates to login page
2. Enters email and password
3. Backend validates credentials against database
4. Opaque access + refresh tokens issued
5. Token stored in localStorage
6. All API calls include Bearer token
7. Server validates token against database on every request
8. Unauthorized requests return 401

### Security Implementation

- Server-side opaque token authentication (no JWT)
- Password hashing with scrypt
- IP-based rate limiting and account lockout
- CORS origin validation
- Helmet security headers (HSTS, X-Frame-Options, etc.)
- Input sanitization on all routes
- Encrypted banking details (AES-256-GCM)
- POPIA compliance audit logging

## File Structure

```
PaySick/
├── index.html                  # Landing page
├── login.html                  # Authentication page
├── onboarding.html             # User registration flow
├── dashboard.html              # Patient dashboard
├── admin-dashboard.html        # Admin dashboard
├── marketplace-apply.html      # Loan marketplace application
├── backend/
│   ├── src/
│   │   ├── server.js           # Express server with security middleware
│   │   ├── config/database.js  # PostgreSQL connection pool
│   │   ├── middleware/         # Auth middleware
│   │   ├── routes/            # API route handlers
│   │   ├── services/          # Business logic services
│   │   └── utils/             # Database setup utilities
│   └── database/
│       ├── schema.sql          # Core database schema
│       └── migrations/         # SQL migrations
└── DASHBOARD_README.md         # This file
```

## Deployment

### Environment Variables Required

```env
NODE_ENV=production
TOKEN_SECRET=<secure-random-string>
ENCRYPTION_KEY=<32-byte-hex-key>
DB_HOST=<database-host>
DB_PORT=5432
DB_NAME=paysick_db
DB_USER=<database-user>
DB_PASSWORD=<database-password>
CORS_ORIGIN=https://yourdomain.com
```

### Database Setup

```bash
npm run db:setup
```

This runs the core schema and all migrations from both `src/migrations/` and `database/migrations/`.

### Starting the Server

```bash
npm start
```

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

PaySick. All rights reserved.
