# PaySick Database Setup Guide

This guide will help you set up and connect the PaySick application to a PostgreSQL database.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **PostgreSQL** (v12 or higher) - [Download here](https://www.postgresql.org/download/)
- **npm** or **yarn** package manager

## Installation Steps

### 1. Install PostgreSQL

#### On Ubuntu/Debian:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### On macOS:
```bash
brew install postgresql
brew services start postgresql
```

#### On Windows:
Download and install from [PostgreSQL official website](https://www.postgresql.org/download/windows/)

### 2. Create Database User

Connect to PostgreSQL as the postgres user:

```bash
sudo -u postgres psql
```

Create a new database user:

```sql
CREATE USER paysick_user WITH PASSWORD 'your_secure_password';
ALTER USER paysick_user CREATEDB;
\q
```

### 3. Install Backend Dependencies

Navigate to the backend directory and install Node.js dependencies:

```bash
cd backend
npm install
```

### 4. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit the `.env` file with your database credentials:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=paysick_db
DB_USER=paysick_user
DB_PASSWORD=your_secure_password

# JWT Secret (Generate a secure random string)
JWT_SECRET=generate_a_secure_random_string_here
JWT_EXPIRES_IN=24h

# Application Settings
CORS_ORIGIN=http://localhost:8080,http://127.0.0.1:8080
ENCRYPTION_KEY=generate_another_secure_random_string_here
```

**Important:** Replace `your_secure_password` with the password you created for `paysick_user`.

### 5. Set Up the Database

Run the database setup script:

```bash
npm run db:setup
```

This will:
- Create the `paysick_db` database
- Run all schema migrations
- Create all tables, indexes, views, and triggers
- Insert sample provider data

### 6. Start the Backend Server

#### Development mode (with auto-reload):
```bash
npm run dev
```

#### Production mode:
```bash
npm start
```

The server will start on `http://localhost:3000`

### 7. Verify the Setup

Test the API health endpoint:

```bash
curl http://localhost:3000/health
```

You should see a response like:

```json
{
  "status": "healthy",
  "timestamp": "2026-01-16T...",
  "database": {
    "status": "healthy",
    "timestamp": "2026-01-16T...",
    "database": "paysick_db"
  }
}
```

## Database Schema Overview

The PaySick database includes the following main tables:

### Core Tables
- **users** - User accounts and personal information
- **banking_details** - User banking information (encrypted)
- **providers** - Healthcare provider directory

### Application Tables
- **applications** - Payment applications submitted by users

### Payment Tables
- **payment_plans** - Active payment plans
- **payments** - Individual scheduled payments
- **transactions** - Payment transaction ledger

### Collections & Recovery
- **collections** - Overdue payment collection cases
- **collection_actions** - Collection action history

### Provider Settlements
- **settlements** - Provider payment settlements
- **settlement_items** - Settlement line items

### Notifications & Communications
- **notifications** - User notifications

### Audit & Compliance
- **audit_log** - System audit trail
- **popia_access_log** - POPIA compliance logging

## API Endpoints

Once the backend is running, you can access these endpoints:

### User Management
- `POST /api/users/register` - Register a new user
- `POST /api/users/login` - User login
- `GET /api/users/profile` - Get user profile (authenticated)
- `PUT /api/users/profile` - Update user profile (authenticated)
- `POST /api/users/banking` - Add banking details (authenticated)
- `GET /api/users/banking` - Get banking details (authenticated)
- `GET /api/users/dashboard` - Get dashboard summary (authenticated)

### Applications
- `POST /api/applications` - Submit new application (authenticated)
- `GET /api/applications` - Get all user applications (authenticated)
- `GET /api/applications/:id` - Get specific application (authenticated)

### Payments
- `GET /api/payments/plans` - Get all payment plans (authenticated)
- `GET /api/payments/plans/:id` - Get specific payment plan (authenticated)
- `GET /api/payments/upcoming` - Get upcoming payments (authenticated)
- `GET /api/payments/history` - Get payment history (authenticated)
- `POST /api/payments/:payment_id/pay` - Make a payment (authenticated)

### Providers
- `GET /api/providers` - Get all providers
- `GET /api/providers/:id` - Get specific provider
- `GET /api/providers/search/:term` - Search providers

## Frontend Integration

To connect your HTML frontend to the backend API:

### 1. Update API Base URL

Create a configuration file or add to your existing JavaScript:

```javascript
const API_BASE_URL = 'http://localhost:3000/api';
```

### 2. Example: User Registration

```javascript
async function registerUser(userData) {
  try {
    const response = await fetch(`${API_BASE_URL}/users/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData)
    });

    const data = await response.json();

    if (response.ok) {
      // Store the token
      localStorage.setItem('paysick_auth_token', data.token);
      localStorage.setItem('paysick_user', JSON.stringify(data.user));
      return data;
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
}
```

### 3. Example: Authenticated Request

```javascript
async function getUserProfile() {
  try {
    const token = localStorage.getItem('paysick_auth_token');

    const response = await fetch(`${API_BASE_URL}/users/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (response.ok) {
      return data;
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Profile fetch error:', error);
    throw error;
  }
}
```

## Troubleshooting

### Database Connection Issues

1. **Check PostgreSQL is running:**
   ```bash
   sudo systemctl status postgresql
   ```

2. **Verify database credentials:**
   ```bash
   psql -U paysick_user -d paysick_db -h localhost
   ```

3. **Check PostgreSQL logs:**
   ```bash
   sudo tail -f /var/log/postgresql/postgresql-*.log
   ```

### Port Already in Use

If port 3000 is already in use, change the `PORT` in your `.env` file:

```env
PORT=3001
```

### CORS Issues

If you're getting CORS errors, make sure your frontend URL is included in the `CORS_ORIGIN` environment variable:

```env
CORS_ORIGIN=http://localhost:8080,http://127.0.0.1:8080,http://localhost:3001
```

## Security Considerations

### Production Deployment

When deploying to production:

1. **Generate secure secrets:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Use environment-specific .env files:**
   - `.env.development`
   - `.env.production`

3. **Enable SSL/TLS for database connections**

4. **Implement proper encryption for banking details**

5. **Set up proper logging and monitoring**

6. **Use a process manager like PM2:**
   ```bash
   npm install -g pm2
   pm2 start src/server.js --name paysick-api
   ```

## Database Maintenance

### Backup Database

```bash
pg_dump -U paysick_user paysick_db > backup.sql
```

### Restore Database

```bash
psql -U paysick_user paysick_db < backup.sql
```

### View Database Size

```sql
SELECT pg_size_pretty(pg_database_size('paysick_db'));
```

## Support

For issues or questions:
- Check the troubleshooting section above
- Review the API documentation
- Check application logs: `tail -f logs/app.log`

## Next Steps

1. Start building your frontend integration
2. Test all API endpoints
3. Implement proper error handling
4. Add user authentication to your HTML pages
5. Deploy to production

---

**Important:** This is a development setup. For production deployment, ensure you implement proper security measures, use secure connections, and follow best practices for handling sensitive data.
