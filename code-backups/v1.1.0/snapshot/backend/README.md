# PaySick Backend API

REST API for the PaySick Healthcare Payment Platform built with Node.js, Express, and PostgreSQL.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. Set up the database:
   ```bash
   npm run db:setup
   ```

4. Start the server:
   ```bash
   npm run dev  # Development mode with auto-reload
   # or
   npm start    # Production mode
   ```

The API will be available at `http://localhost:3000`

## API Documentation

### Health Check
- **GET** `/health` - Check API and database health

### User Management
- **POST** `/api/users/register` - Register new user
- **POST** `/api/users/login` - User login
- **GET** `/api/users/profile` - Get user profile (auth required)
- **PUT** `/api/users/profile` - Update user profile (auth required)
- **POST** `/api/users/banking` - Add banking details (auth required)
- **GET** `/api/users/banking` - Get banking details (auth required)
- **GET** `/api/users/dashboard` - Get dashboard summary (auth required)

### Applications
- **POST** `/api/applications` - Submit new application (auth required)
- **GET** `/api/applications` - Get all user applications (auth required)
- **GET** `/api/applications/:id` - Get specific application (auth required)

### Payments
- **GET** `/api/payments/plans` - Get all payment plans (auth required)
- **GET** `/api/payments/plans/:id` - Get specific payment plan (auth required)
- **GET** `/api/payments/upcoming` - Get upcoming payments (auth required)
- **GET** `/api/payments/history` - Get payment history (auth required)
- **POST** `/api/payments/:payment_id/pay` - Make a payment (auth required)
- **GET** `/api/payments/:payment_id/transactions` - Get payment transactions (auth required)

### Providers
- **GET** `/api/providers` - Get all providers
- **GET** `/api/providers/:id` - Get specific provider
- **GET** `/api/providers/search/:term` - Search providers

## Authentication

Protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

Tokens are returned from the `/api/users/login` and `/api/users/register` endpoints.

## Environment Variables

See `.env.example` for all available configuration options.

## Scripts

- `npm start` - Start the server
- `npm run dev` - Start with nodemon for development
- `npm run db:setup` - Set up the database
- `npm run db:migrate` - Run database migrations

## Technology Stack

- **Node.js** - Runtime environment
- **Express** - Web framework
- **PostgreSQL** - Database
- **JWT** - Authentication
- **bcrypt** - Password hashing
- **Helmet** - Security middleware
- **CORS** - Cross-origin resource sharing

## Project Structure

```
backend/
├── database/
│   └── schema.sql          # Database schema
├── src/
│   ├── config/
│   │   └── database.js     # Database configuration
│   ├── routes/
│   │   ├── users.js        # User routes
│   │   ├── applications.js # Application routes
│   │   ├── payments.js     # Payment routes
│   │   └── providers.js    # Provider routes
│   ├── utils/
│   │   └── setupDatabase.js # Database setup utility
│   └── server.js           # Main server file
├── .env.example            # Environment variables template
├── package.json            # Dependencies
└── README.md              # This file
```

## License

ISC
