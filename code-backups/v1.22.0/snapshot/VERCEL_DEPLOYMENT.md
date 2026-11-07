# Deploy PaySick to Vercel

This guide will walk you through deploying the PaySick application to Vercel with Vercel Postgres database.

**Latest Updates (v1.2.0):**
- Node.js version upgraded to 24.x
- Modernized `vercel.json` configuration (using rewrites instead of builds/routes)
- Added serverless function entry point (`/api/index.js`)
- Updated `server.js` for conditional execution in serverless environment

## Prerequisites

- A [Vercel account](https://vercel.com/signup) (free tier works great!)
- [Vercel CLI](https://vercel.com/cli) installed (optional but recommended)
- Git repository (already set up)
- Node.js 24.x or higher (for local development)

## Serverless Architecture

PaySick uses Vercel's serverless functions for the backend API. The architecture consists of:

1. **Root `package.json`**: Contains all backend dependencies and specifies Node.js 24.x
2. **`/api/index.js`**: Serverless entry point that exports the Express app
3. **`backend/src/server.js`**: Conditionally runs HTTP server (only in development)
4. **`vercel.json`**: Modern configuration using rewrites (not deprecated builds/routes)

### Vercel Configuration

The project uses a modernized `vercel.json`:

```json
{
  "version": 2,
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api"
    },
    {
      "source": "/health",
      "destination": "/api"
    }
  ]
}
```

This configuration:
- Uses `rewrites` instead of deprecated `builds` and `routes`
- Routes all `/api/*` requests to the serverless function
- Routes `/health` endpoint to the API
- Automatically detects and deploys frontend HTML files

### Node.js Version

The project requires Node.js 24.x as specified in root `package.json`:

```json
{
  "engines": {
    "node": "24.x"
  }
}
```

## Deployment Options

### Option 1: Deploy via Vercel Dashboard (Easiest)

#### Step 1: Import Your Repository

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New Project"**
3. Import your GitHub repository: `Jaxxtheart/PaySick`
4. Vercel will auto-detect the configuration from `vercel.json`

#### Step 2: Add Vercel Postgres

1. In your Vercel project dashboard, go to the **Storage** tab
2. Click **"Create Database"**
3. Select **"Postgres"**
4. Choose a database name: `paysick-db`
5. Select your region (choose closest to your users)
6. Click **"Create"**

**Important:** Vercel will automatically add these environment variables to your project:
- `POSTGRES_URL` - Full connection string
- `POSTGRES_PRISMA_URL` - Prisma connection string (not needed)
- `POSTGRES_URL_NON_POOLING` - Non-pooling connection string

#### Step 3: Add Additional Environment Variables

In your project settings, go to **Environment Variables** and add:

| Variable | Value | Description |
|----------|-------|-------------|
| `JWT_SECRET` | (generate secure string) | JWT signing secret |
| `JWT_EXPIRES_IN` | `24h` | Token expiration time |
| `CORS_ORIGIN` | `https://your-domain.vercel.app` | Your frontend URL |
| `ENCRYPTION_KEY` | (generate secure string) | For encrypting banking details |

**Generate Secure Secrets:**
```bash
# Run this locally to generate secure random strings
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Step 4: Set Up the Database Schema

After deployment, you need to initialize the database:

**Method A: Using Vercel Postgres SQL Editor**

1. Go to your Vercel project → **Storage** → Your Postgres database
2. Click on **"SQL"** or **".sql"** tab
3. Copy the contents of `backend/database/schema.sql`
4. Paste and execute in the SQL editor
5. This will create all tables, indexes, views, and triggers

**Method B: Using psql (Advanced)**

1. Get your database connection string from Vercel
2. Connect using psql:
   ```bash
   psql "your-connection-string-from-vercel"
   ```
3. Run the schema:
   ```bash
   \i backend/database/schema.sql
   ```

#### Step 5: Deploy

1. Click **"Deploy"**
2. Wait for the build to complete
3. Your API will be available at: `https://your-project.vercel.app`

### Option 2: Deploy via Vercel CLI

#### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

#### Step 2: Login to Vercel

```bash
vercel login
```

#### Step 3: Link Your Project

From your project root:

```bash
vercel link
```

Follow the prompts to link to your Vercel project.

#### Step 4: Add Vercel Postgres

```bash
vercel postgres create paysick-db
```

Choose your preferred region when prompted.

#### Step 5: Link Database to Project

```bash
vercel postgres connect paysick-db
```

This automatically adds the `POSTGRES_URL` environment variable.

#### Step 6: Add Environment Variables

```bash
# JWT Secret
vercel env add JWT_SECRET
# Paste your generated secret when prompted

# JWT Expiration
vercel env add JWT_EXPIRES_IN
# Enter: 24h

# CORS Origin
vercel env add CORS_ORIGIN
# Enter your frontend URL

# Encryption Key
vercel env add ENCRYPTION_KEY
# Paste your generated secret
```

#### Step 7: Deploy

```bash
vercel --prod
```

#### Step 8: Initialize Database

After deployment, get your database connection string:

```bash
vercel postgres connect paysick-db
```

Then run the schema file using the connection string provided.

## Testing Your Deployment

### Test the API Health Endpoint

```bash
curl https://your-project.vercel.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-16T...",
  "database": {
    "status": "healthy",
    "timestamp": "...",
    "database": "verceldb"
  }
}
```

### Test User Registration

```bash
curl -X POST https://your-project.vercel.app/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Test User",
    "email": "test@example.com",
    "cell_number": "0821234567",
    "sa_id_number": "9001015009087",
    "postal_code": "2000",
    "date_of_birth": "1990-01-01",
    "terms_accepted": true,
    "popia_consent": true
  }'
```

## Update Frontend to Use Vercel API

Update your `api-client.js` to use the Vercel API URL:

```javascript
// At the top of api-client.js
const API_BASE_URL = 'https://your-project.vercel.app/api';
```

Or make it environment-aware:

```javascript
const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : 'https://your-project.vercel.app/api';
```

## Alternative: Deploy Frontend and Backend Separately

If you prefer to deploy the frontend separately:

### Deploy Backend Only

1. Create a new Vercel project just for the backend
2. Set the **Root Directory** to `backend` in project settings
3. Follow the same database setup steps above

### Deploy Frontend Separately

1. Create another Vercel project for the frontend (HTML files)
2. Update `api-client.js` with your backend API URL
3. Deploy

## Database Management

### View Database

Access your database through:
- **Vercel Dashboard**: Storage → Your Database → SQL tab
- **psql CLI**: Use the connection string from Vercel

### Backup Database

```bash
# Get connection string from Vercel dashboard
pg_dump "your-connection-string" > backup.sql
```

### Restore Database

```bash
psql "your-connection-string" < backup.sql
```

### Monitor Database

- Go to Vercel Dashboard → Storage → Your Database
- View **Metrics** for:
  - Query performance
  - Connection usage
  - Storage usage
  - Row counts

## Vercel Postgres Limits (Free Tier)

- **Storage**: 256 MB
- **Compute**: 60 hours/month
- **Data transfer**: 256 MB/month
- **Connections**: Pooled connections

**For production**: Consider upgrading to Pro plan for:
- 10 GB storage
- Unlimited compute hours
- 1 GB data transfer
- Better connection pooling

## Alternative Database Options

If you need more storage or features, you can also use:

### Supabase (PostgreSQL)

1. Create a [Supabase](https://supabase.com) project
2. Get your connection string from Supabase dashboard
3. Add `POSTGRES_URL` environment variable in Vercel
4. Deploy as normal

**Supabase Free Tier:**
- 500 MB database
- Unlimited API requests
- Real-time subscriptions
- Built-in authentication

### Neon (Serverless PostgreSQL)

1. Create a [Neon](https://neon.tech) project
2. Get your connection string
3. Add to Vercel environment variables
4. Deploy

**Neon Free Tier:**
- 3 GB storage
- Serverless scaling
- Instant branching
- Point-in-time restore

### Railway

1. Create a [Railway](https://railway.app) project
2. Add PostgreSQL service
3. Get connection string
4. Add to Vercel

**Railway Free Tier:**
- $5 free credit/month
- Auto-scaling
- Easy deployment

## Troubleshooting

### Database Connection Issues

**Error: `connection refused`**
- Check that `POSTGRES_URL` is set in Vercel environment variables
- Verify the connection string is correct
- Ensure SSL is enabled (it's required for Vercel Postgres)

**Error: `too many connections`**
- Vercel Postgres uses connection pooling
- Reduce `max` connections in `database.js`
- Consider upgrading your plan

### Deployment Failures

**Build Error: `Cannot find module`**
- Ensure all dependencies are in root `package.json` (not just `backend/package.json`)
- Run `npm install` locally first
- Check that `node_modules` is in `.gitignore`

**Error: "Build Settings will not apply"**
- This occurred with old `builds` configuration
- Now resolved with modern `rewrites` configuration
- If you see this, ensure your `vercel.json` uses `rewrites` not `builds`/`routes`

**Node.js Version Warning**
- If you see warnings about Node.js version auto-upgrading
- Ensure `package.json` has `"node": "24.x"` (not `">=24.x"`)
- Vercel will use the exact version specified

**Serverless Function Timeout**
- Vercel has a 10-second timeout on free tier
- Optimize slow queries
- Consider upgrading to Pro (60-second timeout)

**Error: "Cannot start server on Vercel"**
- Ensure `backend/src/server.js` has conditional execution:
  ```javascript
  if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  }
  module.exports = app;
  ```
- This prevents trying to start HTTP server in serverless environment

### CORS Errors

**Error: `Access-Control-Allow-Origin`**
- Add your frontend URL to `CORS_ORIGIN` environment variable
- Use `*` for testing (not recommended for production)
- Ensure the variable includes `https://` prefix

## Production Checklist

Before going live:

### Configuration
- [ ] Node.js version set to 24.x in root `package.json`
- [ ] Modern `vercel.json` using `rewrites` (not `builds`/`routes`)
- [ ] `/api/index.js` serverless entry point exists
- [ ] `server.js` has conditional execution for serverless

### Security & Environment
- [ ] Generated secure `JWT_SECRET` and `ENCRYPTION_KEY`
- [ ] Set `NODE_ENV=production` in Vercel
- [ ] Updated `CORS_ORIGIN` with your actual domain
- [ ] All environment variables configured

### Database
- [ ] Database schema is initialized
- [ ] Database connection string is correct
- [ ] SSL enabled for database connections
- [ ] Database backups schedule configured

### Testing
- [ ] Tested all API endpoints
- [ ] Frontend updated with production API URL
- [ ] Tested user registration and login flows
- [ ] Verified payment application submission
- [ ] Tested all new pages (Providers, Privacy, Terms, About, Contact)
- [ ] Verified SVG icons display correctly
- [ ] Mobile responsiveness tested

### Monitoring & Compliance
- [ ] Set up monitoring and alerts
- [ ] Reviewed Vercel logs for errors
- [ ] Checked POPIA compliance logging
- [ ] Verified audit trail functionality
- [ ] Legal pages reviewed (Privacy, Terms)

### Performance
- [ ] Implemented proper error handling
- [ ] Optimized database queries
- [ ] Verified serverless function response times
- [ ] Tested under load

## Monitoring & Logs

### View Application Logs

1. Go to Vercel Dashboard → Your Project
2. Click on any deployment
3. View **Functions** tab to see serverless function logs
4. Check **Build Logs** for deployment issues

### Database Logs

1. Go to Storage → Your Database
2. View **Logs** tab for query logs
3. Monitor slow queries in **Metrics**

## Cost Optimization

### Free Tier Tips

1. **Optimize queries**: Use indexes effectively
2. **Connection pooling**: Already configured
3. **Cache responses**: Consider adding Redis for caching
4. **Compress responses**: Enable gzip compression
5. **Monitor usage**: Check Vercel dashboard regularly

### When to Upgrade

Consider upgrading when:
- Database exceeds 256 MB
- Need more than 60 compute hours/month
- Require faster builds
- Need team collaboration features
- Want custom domains on multiple projects

## Support & Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Postgres Docs](https://vercel.com/docs/storage/vercel-postgres)
- [Vercel Community](https://github.com/vercel/vercel/discussions)
- [Vercel Support](https://vercel.com/support)

## Next Steps

1. Deploy your application to Vercel
2. Set up the database and run schema
3. Configure environment variables
4. Test all API endpoints
5. Verify all pages load correctly (including new Providers, Privacy, Terms, About, Contact)
6. Test user registration and login flows
7. Review POPIA compliance and legal pages
8. Set up monitoring and backups
9. Share your live application!

## What's New in v1.2.0

- Custom SVG icon system across all pages
- New pages: Providers, Privacy Policy, Terms of Service, About, Contact
- Modernized Vercel deployment configuration
- Node.js 24.x support
- Improved serverless architecture
- POPIA-compliant privacy policy
- Complete legal documentation

For detailed changelog, see [CHANGELOG.md](../CHANGELOG.md)

---

**Your PaySick app is now ready for production on Vercel!**

Need help? Check out:
- [README.md](../README.md) - Project overview
- [CHANGELOG.md](../CHANGELOG.md) - Recent updates
- [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) - Design guidelines and SVG icons
- [Vercel Documentation](https://vercel.com/docs)
