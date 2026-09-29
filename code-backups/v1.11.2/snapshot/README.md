# PaySick

> South African Healthcare Payment Platform - Making medical care accessible through flexible payment plans

PaySick is a fintech healthcare platform that enables patients to split their medical bills into manageable 3-month payment plans. We partner with healthcare providers across South Africa to make quality healthcare accessible to everyone.

## Features

### For Patients
- **Fast Decisions**: Applications are risk-assessed and typically decisioned within minutes — outcomes are approve, decline, or manual review, not a guaranteed approval
- **Flexible Amounts**: Payment plans available from R1,000 up to R500,000
- **Flexible Terms**: Split bills into 3 equal monthly payments
- **No Hidden Fees**: Transparent pricing and no surprises — 0% interest, a 5% late fee applies only on overdue months
- **Dashboard**: Track all your payment plans in one place
- **POPIA Compliant**: Your data is protected and secure

### For Healthcare Providers
- **Fast Settlements**: Get paid upfront, we handle collections
- **Network Partners**: Join our provider network for preferential rates
- **Dashboard**: Track applications and settlements
- **Analytics**: View performance metrics and approval rates

### Technical Features
- **PostgreSQL Database**: Robust, scalable data storage
- **REST API**: Complete backend API with authentication
- **JWT Security**: Secure token-based authentication
- **POPIA Compliance**: Full audit logging for data protection
- **Risk Scoring**: Automated risk assessment
- **Transaction Tracking**: Complete payment ledger
- **Collections System**: Automated overdue payment management

## Quick Start

### Choose Your Deployment Method

**Option 1: Deploy to Vercel (Recommended - Easiest)**
```bash
# See detailed instructions in VERCEL_DEPLOYMENT.md
vercel
```

**Option 2: Local Development**
```bash
# See detailed instructions in DATABASE_SETUP.md
cd backend
npm install
npm run db:setup
npm run dev
```

## Documentation

- **[Changelog](CHANGELOG.md)** - Version history and recent updates
- **[Design System](DESIGN_SYSTEM.md)** - UI/UX guidelines and SVG icon system
- **[Vercel Deployment Guide](VERCEL_DEPLOYMENT.md)** - Deploy to Vercel with Vercel Postgres
- **[Database Setup Guide](DATABASE_SETUP.md)** - Set up local PostgreSQL database
- **[Installation Notes](INSTALLATION_NOTES.md)** - Quick reference for setup
- **[Backend API Documentation](backend/README.md)** - API endpoints and usage
- **[Dashboard Guide](DASHBOARD_README.md)** - User dashboard documentation

## Project Structure

```
PaySick/
├── api/
│   └── index.js                 # Vercel serverless entry point
│
├── backend/                      # Backend API server
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js      # Database connection (supports Vercel Postgres)
│   │   ├── routes/
│   │   │   ├── users.js         # User management endpoints
│   │   │   ├── applications.js  # Payment application endpoints
│   │   │   ├── payments.js      # Payment and plan endpoints
│   │   │   └── providers.js     # Provider directory endpoints
│   │   ├── utils/
│   │   │   └── setupDatabase.js # Database initialization
│   │   └── server.js            # Express server
│   ├── database/
│   │   └── schema.sql           # Complete database schema
│   ├── .env.example             # Environment variables template
│   └── package.json             # Backend dependencies
│
├── Frontend Files (HTML/CSS/JS)
│   ├── index.html               # Landing page with custom SVG icons
│   ├── login.html               # User login
│   ├── onboarding.html          # User onboarding flow
│   ├── dashboard.html           # User dashboard
│   ├── admin-dashboard.html     # Admin interface
│   ├── collections.html         # Collections management
│   ├── providers.html           # Provider partnership page
│   ├── privacy.html             # POPIA-compliant privacy policy
│   ├── terms.html               # Terms of service
│   ├── about.html               # About us page
│   ├── contact.html             # Contact page
│   └── api-client.js            # Frontend API client
│
├── package.json                 # Root package.json for Vercel deployment
├── vercel.json                  # Vercel deployment config (modernized)
├── .vercelignore               # Vercel ignore rules
│
└── Documentation
    ├── README.md                # This file
    ├── CHANGELOG.md             # Version history
    ├── DESIGN_SYSTEM.md         # Design guidelines and SVG icons
    ├── VERCEL_DEPLOYMENT.md     # Deployment guide
    ├── DATABASE_SETUP.md        # Database setup
    ├── INSTALLATION_NOTES.md    # Setup notes
    └── DASHBOARD_README.md      # Dashboard documentation
```

## Database Schema

### Core Tables
- **users** - Patient accounts and personal information
- **banking_details** - Encrypted banking information
- **providers** - Healthcare provider directory

### Application & Payments
- **applications** - Payment applications
- **payment_plans** - Active payment plans
- **payments** - Individual scheduled payments
- **transactions** - Complete transaction ledger

### Collections & Compliance
- **collections** - Overdue payment cases
- **audit_log** - System audit trail
- **popia_access_log** - POPIA compliance logging

[View complete schema](backend/database/schema.sql)

## API Endpoints

### Authentication
```
POST   /api/users/register      Register new user
POST   /api/users/login         User login
GET    /api/users/profile       Get user profile (auth)
PUT    /api/users/profile       Update profile (auth)
```

### Applications
```
POST   /api/applications        Submit new application (auth)
GET    /api/applications        Get all applications (auth)
GET    /api/applications/:id    Get specific application (auth)
```

### Payments
```
GET    /api/payments/plans      Get all payment plans (auth)
GET    /api/payments/upcoming   Get upcoming payments (auth)
GET    /api/payments/history    Get payment history (auth)
POST   /api/payments/:id/pay    Make a payment (auth)
```

### Providers
```
GET    /api/providers           Get all providers
GET    /api/providers/:id       Get specific provider
GET    /api/providers/search/:term  Search providers
```

[Full API documentation](backend/README.md)

## Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **PostgreSQL** - Primary database
- **JWT** - Authentication
- **Helmet** - Security middleware
- **CORS** - Cross-origin resource sharing

### Frontend
- **HTML5/CSS3** - Structure and styling
- **Vanilla JavaScript** - Client-side logic
- **Fetch API** - HTTP requests

### Deployment
- **Vercel** - Hosting platform
- **Vercel Postgres** - Managed PostgreSQL database

## Security Features

- **JWT Authentication** - Secure token-based auth
- **Password Hashing** - bcrypt encryption (when implemented)
- **SQL Injection Protection** - Parameterized queries
- **Rate Limiting** - 100 requests per 15 minutes
- **CORS Protection** - Restricted origins
- **Helmet.js** - Security headers
- **POPIA Compliance** - Complete audit logging
- **Data Encryption** - Banking details encrypted at rest

## Deployment

### Deploy to Vercel (Recommended)

1. **Fork this repository**
2. **Import to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
3. **Add Vercel Postgres**:
   - Go to Storage tab
   - Create new Postgres database
4. **Set Environment Variables**:
   - `JWT_SECRET` - Your secure secret
   - `CORS_ORIGIN` - Your frontend URL
   - `ENCRYPTION_KEY` - Encryption key
5. **Initialize Database**:
   - Run the schema from `backend/database/schema.sql`
6. **Deploy**:
   - Vercel will auto-deploy on push to main

[Complete Vercel deployment guide](VERCEL_DEPLOYMENT.md)

### Local Development

1. **Install PostgreSQL**
2. **Clone repository**:
   ```bash
   git clone https://github.com/Jaxxtheart/PaySick.git
   cd PaySick
   ```
3. **Set up backend**:
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your database credentials
   ```
4. **Initialize database**:
   ```bash
   npm run db:setup
   ```
5. **Start server**:
   ```bash
   npm run dev
   ```

[Complete local setup guide](DATABASE_SETUP.md)

## Database Hosting Options

### Vercel Postgres (Recommended)
- ✅ Easy integration with Vercel
- ✅ Automatic SSL
- ✅ Connection pooling
- 💰 Free tier: 256 MB storage

### Supabase
- ✅ 500 MB free storage
- ✅ Real-time subscriptions
- ✅ Built-in auth
- 🔗 [supabase.com](https://supabase.com)

### Neon
- ✅ 3 GB free storage
- ✅ Serverless PostgreSQL
- ✅ Instant branching
- 🔗 [neon.tech](https://neon.tech)

### Railway
- ✅ $5 free credit/month
- ✅ Auto-scaling
- ✅ Easy deployment
- 🔗 [railway.app](https://railway.app)

## Testing

### Test the API

```bash
# Health check
curl http://localhost:3000/health

# Register user
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "John Doe",
    "email": "john@example.com",
    "cell_number": "0821234567",
    "sa_id_number": "9001015009087",
    "postal_code": "2000",
    "date_of_birth": "1990-01-01",
    "terms_accepted": true,
    "popia_consent": true
  }'
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License.

## Support

- **Documentation**: See guides in the root directory
- **Issues**: Open an issue on GitHub
- **Email**: support@paysick.co.za (example)

## Roadmap

### Phase 1: Core Platform (Completed)
- [x] Database schema and backend API
- [x] User authentication and authorization
- [x] Frontend UI with custom SVG icons
- [x] All website pages (Providers, Privacy, Terms, About, Contact)
- [x] POPIA compliance and legal documentation
- [x] Vercel deployment configuration

### Phase 2: Payment Integration (In Progress)
- [ ] Payment gateway integration (Stripe/PayFast)
- [ ] Automated payment processing
- [ ] Payment reconciliation system
- [ ] Refund and dispute handling

### Phase 3: Communication & Notifications
- [ ] SMS notifications via Twilio
- [ ] Email notifications (transactional)
- [ ] Payment reminders and alerts
- [ ] Provider communication portal

### Phase 4: Advanced Features
- [ ] Mobile app (React Native)
- [ ] Real-time payment tracking
- [ ] ML-based fraud detection
- [ ] Biometric authentication
- [ ] Multi-language support (Afrikaans, Zulu, Xhosa)

### Phase 5: Analytics & Optimization
- [ ] Advanced provider analytics dashboard
- [ ] Customer behavior analytics
- [ ] A/B testing framework
- [ ] Performance monitoring and optimization

## Status

### Completed
- ✅ Database schema complete
- ✅ Backend API complete
- ✅ User authentication implemented
- ✅ Frontend UI complete with custom SVG icons
- ✅ Vercel deployment ready (Node.js 24.x)
- ✅ All website pages (Providers, Privacy, Terms, About, Contact)
- ✅ POPIA-compliant privacy policy
- ✅ Custom SVG icon system matching brand design
- ✅ Responsive design across all pages
- ✅ Provider partnership page
- ✅ Complete legal documentation

### In Progress
- 🔲 Payment gateway integration
- 🔲 SMS/Email notifications
- 🔲 Production deployment

### Planned
- 🔲 Mobile app (React Native)
- 🔲 Real-time payment tracking
- 🔲 ML-based fraud detection
- 🔲 Multi-language support

## Acknowledgments

- Built with care for South Africa
- Designed to comply with NCA and POPIA regulations
- Inspired by the need for accessible healthcare
- Custom SVG icon system designed for brand consistency

---

**Made in South Africa**

**PaySick** - Making Healthcare Accessible, One Payment at a Time

For version history and recent updates, see [CHANGELOG.md](CHANGELOG.md)
