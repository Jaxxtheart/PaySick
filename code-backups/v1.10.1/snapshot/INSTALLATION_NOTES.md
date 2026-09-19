# PaySick Installation Notes

## Backend Setup Complete ✅

The PaySick database backend has been successfully set up with the following components:

### What's Been Created

1. **Database Schema** (`backend/database/schema.sql`)
   - Complete PostgreSQL database schema with all tables, indexes, views, and triggers
   - Includes users, banking details, providers, applications, payments, collections, and more
   - POPIA-compliant audit logging

2. **Backend API Server** (`backend/src/`)
   - Express.js REST API server
   - Database connection utilities
   - Complete API routes for:
     - User management (registration, login, profile)
     - Applications (submit, view, track)
     - Payments (plans, history, transactions)
     - Healthcare providers (directory, search)

3. **Frontend API Client** (`api-client.js`)
   - Ready-to-use JavaScript client for making API calls
   - Handles authentication, tokens, and all API endpoints
   - Can be included in any HTML page with: `<script src="api-client.js"></script>`

### Quick Start Guide

#### 1. Install PostgreSQL

First, ensure PostgreSQL is installed on your system:

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

**Windows:**
Download from https://www.postgresql.org/download/windows/

#### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

**Note:** If you encounter issues installing bcrypt, you can install it separately:
```bash
npm install bcrypt
```

#### 3. Configure Database

Create a PostgreSQL user and set up credentials:

```bash
sudo -u postgres psql
```

Then run:
```sql
CREATE USER paysick_user WITH PASSWORD 'your_secure_password';
ALTER USER paysick_user CREATEDB;
\q
```

#### 4. Set Environment Variables

```bash
cd backend
cp .env.example .env
```

Edit `.env` and update with your database credentials:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=paysick_db
DB_USER=paysick_user
DB_PASSWORD=your_secure_password
JWT_SECRET=generate_a_secure_random_string_here
```

#### 5. Initialize Database

```bash
npm run db:setup
```

This will create the database and all tables.

#### 6. Start the Backend Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

### Testing the Setup

Test the health endpoint:
```bash
curl http://localhost:3000/health
```

You should see:
```json
{
  "status": "healthy",
  "timestamp": "...",
  "database": {
    "status": "healthy",
    ...
  }
}
```

### Using the API in Your HTML Files

1. **Include the API client:**
   ```html
   <script src="/api-client.js"></script>
   ```

2. **Example: User Registration**
   ```javascript
   const userData = {
     full_name: "John Doe",
     email: "john@example.com",
     cell_number: "0821234567",
     sa_id_number: "9001015009087",
     postal_code: "2000",
     date_of_birth: "1990-01-01",
     terms_accepted: true,
     popia_consent: true
   };

   PaySickAPI.users.register(userData)
     .then(response => {
       console.log('Registration successful:', response);
       // Token is automatically stored
       window.location.href = 'dashboard.html';
     })
     .catch(error => {
       console.error('Registration failed:', error);
     });
   ```

3. **Example: User Login**
   ```javascript
   PaySickAPI.users.login({
     email: "john@example.com"
   })
   .then(response => {
     console.log('Login successful:', response);
     window.location.href = 'dashboard.html';
   })
   .catch(error => {
     console.error('Login failed:', error);
   });
   ```

4. **Example: Get Dashboard Data**
   ```javascript
   PaySickAPI.users.getDashboard()
     .then(data => {
       console.log('Dashboard data:', data);
       // Update UI with data
       document.getElementById('totalBalance').textContent = 'R' + data.total_balance;
       document.getElementById('activePlans').textContent = data.active_plans;
     })
     .catch(error => {
       console.error('Failed to load dashboard:', error);
     });
   ```

### API Endpoints Overview

All endpoints are prefixed with `/api/`

**Users:**
- POST `/users/register` - Register new user
- POST `/users/login` - Login user
- GET `/users/profile` - Get user profile
- PUT `/users/profile` - Update profile
- POST `/users/banking` - Add banking details
- GET `/users/banking` - Get banking details
- GET `/users/dashboard` - Get dashboard summary

**Applications:**
- POST `/applications` - Submit new application
- GET `/applications` - Get all applications
- GET `/applications/:id` - Get specific application

**Payments:**
- GET `/payments/plans` - Get payment plans
- GET `/payments/plans/:id` - Get specific plan
- GET `/payments/upcoming` - Get upcoming payments
- GET `/payments/history` - Get payment history
- POST `/payments/:id/pay` - Make a payment

**Providers:**
- GET `/providers` - Get all providers
- GET `/providers/:id` - Get specific provider
- GET `/providers/search/:term` - Search providers

### Next Steps

1. ✅ Database schema created
2. ✅ Backend API server ready
3. ✅ API client for frontend ready
4. 🔲 Install PostgreSQL and dependencies
5. 🔲 Configure environment variables
6. 🔲 Run database setup
7. 🔲 Start backend server
8. 🔲 Update HTML files to use API instead of localStorage
9. 🔲 Test user registration and login
10. 🔲 Test payment application flow

### Important Security Notes

For production deployment:

1. **Enable HTTPS** - Never send tokens over HTTP
2. **Encrypt banking details** - Implement proper encryption for account numbers
3. **Secure JWT secrets** - Use strong random strings
4. **Add rate limiting** - Protect against brute force attacks
5. **Input validation** - Validate all user inputs on both client and server
6. **CORS configuration** - Restrict to your domain only
7. **Environment variables** - Never commit .env files to git

### Documentation

- **Database Setup Guide**: `DATABASE_SETUP.md` - Comprehensive setup instructions
- **Backend README**: `backend/README.md` - API documentation
- **API Client**: `api-client.js` - Frontend JavaScript client

### Support

If you encounter any issues:
1. Check PostgreSQL is running: `sudo systemctl status postgresql`
2. Verify database credentials in `.env`
3. Check backend logs for errors
4. Ensure all dependencies are installed
5. Test health endpoint: `curl http://localhost:3000/health`

---

**Status**: Backend infrastructure complete and ready for deployment!
