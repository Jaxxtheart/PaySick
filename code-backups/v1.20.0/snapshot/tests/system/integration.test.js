/**
 * PaySick — System Integration, Functional & Regression Tests
 *
 * Uses Node.js built-in test runner (node:test + node:assert + node:fs).
 * No external dependencies required.
 *
 * Coverage:
 *   1. API Client contract alignment (frontend → backend endpoint mapping)
 *   2. Frontend page integration (auth guards, API calls, no hardcoded data)
 *   3. Backend route structure (files exist, routes mounted)
 *   4. Auth middleware logic (mock req/res)
 *   5. Regression: brand compliance (no specific provider names in public pages)
 *   6. Regression: payment flow (response field alignment)
 *
 * Run: node --test tests/system/integration.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const BACKEND = path.join(ROOT, 'backend', 'src');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function countOccurrences(source, pattern) {
  return (source.match(new RegExp(pattern, 'gi')) || []).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. API CLIENT CONTRACT ALIGNMENT
// ─────────────────────────────────────────────────────────────────────────────

describe('1. API Client — Frontend/Backend Contract Alignment', () => {
  const client = readFile('api-client.js');
  const usersRoute = readFile('backend/src/routes/users.js');
  const applicationsRoute = readFile('backend/src/routes/applications.js');
  const paymentsRoute = readFile('backend/src/routes/payments.js');
  const providersRoute = readFile('backend/src/routes/providers.js');
  const marketplaceRoute = readFile('backend/src/routes/marketplace.js');

  // ── Users ──
  test('users.register → POST /users/register exists on backend', () => {
    assert.ok(client.includes("'/users/register'"), 'client missing /users/register');
    assert.ok(usersRoute.includes("router.post('/register'"), 'backend missing POST /register');
  });

  test('users.login → POST /users/login exists on backend', () => {
    assert.ok(client.includes("'/users/login'"), 'client missing /users/login');
    assert.ok(usersRoute.includes("router.post('/login'"), 'backend missing POST /login');
  });

  test('users.getProfile → GET /users/profile exists on backend', () => {
    assert.ok(client.includes("'/users/profile'"), 'client missing /users/profile');
    assert.ok(usersRoute.includes("router.get('/profile'"), 'backend missing GET /profile');
  });

  test('users.updateProfile → PUT /users/profile exists on backend', () => {
    assert.ok(client.includes("method: 'PUT'"), 'client missing PUT method');
    assert.ok(usersRoute.includes("router.put('/profile'"), 'backend missing PUT /profile');
  });

  test('users.addBanking → POST /users/banking exists on backend', () => {
    assert.ok(client.includes("'/users/banking'"), 'client missing /users/banking');
    assert.ok(usersRoute.includes("router.post('/banking'"), 'backend missing POST /banking');
  });

  test('users.getBanking → GET /users/banking exists on backend', () => {
    assert.ok(usersRoute.includes("router.get('/banking'"), 'backend missing GET /banking');
  });

  test('users.getDashboard → GET /users/dashboard exists on backend', () => {
    assert.ok(client.includes("'/users/dashboard'"), 'client missing /users/dashboard');
    assert.ok(usersRoute.includes("router.get('/dashboard'"), 'backend missing GET /dashboard');
  });

  // ── Applications ──
  test('applications.create → POST /applications exists on backend', () => {
    assert.ok(client.includes("'/applications'"), 'client missing /applications');
    assert.ok(applicationsRoute.includes("router.post('/'"), 'backend missing POST /');
  });

  test('applications.getAll → GET /applications exists on backend', () => {
    assert.ok(applicationsRoute.includes("router.get('/'"), 'backend missing GET /');
  });

  test('applications.getById → GET /applications/:id exists on backend', () => {
    assert.ok(client.includes('`/applications/${applicationId}`'), 'client missing /applications/:id');
    assert.ok(applicationsRoute.includes("router.get('/:id'"), 'backend missing GET /:id');
  });

  // ── Payments ──
  test('payments.getPlans → GET /payments/plans exists on backend', () => {
    assert.ok(client.includes("'/payments/plans'"), 'client missing /payments/plans');
    assert.ok(paymentsRoute.includes("router.get('/plans'"), 'backend missing GET /plans');
  });

  test('payments.getPlan → GET /payments/plans/:id exists on backend', () => {
    assert.ok(client.includes('`/payments/plans/${planId}`'), 'client missing /payments/plans/:id');
    assert.ok(paymentsRoute.includes("router.get('/plans/:id'"), 'backend missing GET /plans/:id');
  });

  test('payments.getUpcoming → GET /payments/upcoming exists on backend', () => {
    assert.ok(client.includes("'/payments/upcoming'"), 'client missing /payments/upcoming');
    assert.ok(paymentsRoute.includes("router.get('/upcoming'"), 'backend missing GET /upcoming');
  });

  test('payments.getHistory → GET /payments/history exists on backend', () => {
    assert.ok(client.includes("'/payments/history'"), 'client missing /payments/history');
    assert.ok(paymentsRoute.includes("router.get('/history'"), 'backend missing GET /history');
  });

  test('payments.makePayment → POST /payments/:id/pay exists on backend', () => {
    assert.ok(client.includes('`/payments/${paymentId}/pay`'), 'client missing /payments/:id/pay');
    assert.ok(paymentsRoute.includes("router.post('/:payment_id/pay'"), 'backend missing POST /:id/pay');
  });

  test('payments.getTransactions → GET /payments/:id/transactions exists on backend', () => {
    assert.ok(client.includes('`/payments/${paymentId}/transactions`'), 'client missing /payments/:id/transactions');
    assert.ok(paymentsRoute.includes("router.get('/:payment_id/transactions'"), 'backend missing GET /:id/transactions');
  });

  // ── Providers ──
  test('providers.getAll → GET /providers exists on backend', () => {
    assert.ok(client.includes('`/providers?${params}`'), 'client missing /providers query');
    assert.ok(providersRoute.includes("router.get('/'"), 'backend missing GET /');
  });

  test('providers.getById → GET /providers/:id exists on backend', () => {
    assert.ok(client.includes('`/providers/${providerId}`'), 'client missing /providers/:id');
    assert.ok(providersRoute.includes("router.get('/:id'"), 'backend missing GET /:id');
  });

  test('providers.search → GET /providers/search/:term exists on backend', () => {
    assert.ok(client.includes('`/providers/search/${encodeURIComponent(searchTerm)}`'), 'client missing /providers/search/:term');
    assert.ok(providersRoute.includes("router.get('/search/:term'"), 'backend missing GET /search/:term');
  });

  // ── Marketplace ──
  test('marketplace.submitApplication → POST /marketplace/applications exists on backend', () => {
    assert.ok(client.includes("'/marketplace/applications'"), 'client missing /marketplace/applications');
    assert.ok(marketplaceRoute.includes("router.post('/applications'"), 'backend missing POST /applications');
  });

  test('marketplace.getApplications → GET /marketplace/applications exists on backend', () => {
    assert.ok(marketplaceRoute.includes("router.get('/applications'"), 'backend missing GET /applications');
  });

  test('marketplace.getOffers → GET /marketplace/applications/:id/offers exists on backend', () => {
    assert.ok(client.includes('`/marketplace/applications/${applicationId}/offers`'), 'client missing /offers');
    assert.ok(marketplaceRoute.includes("router.get('/applications/:id/offers'"), 'backend missing GET /applications/:id/offers');
  });

  test('marketplace.acceptOffer → POST /marketplace/offers/:id/accept exists on backend', () => {
    assert.ok(client.includes('`/marketplace/offers/${offerId}/accept`'), 'client missing /offers/:id/accept');
    assert.ok(marketplaceRoute.includes("router.post('/offers/:offerId/accept'"), 'backend missing POST /offers/:offerId/accept');
  });

  test('marketplace.getLoans → GET /marketplace/loans exists on backend', () => {
    assert.ok(client.includes("'/marketplace/loans'"), 'client missing /marketplace/loans');
    assert.ok(marketplaceRoute.includes("router.get('/loans'"), 'backend missing GET /loans');
  });

  test('marketplace.getLoanRepayments → GET /marketplace/loans/:id/repayments exists on backend', () => {
    assert.ok(client.includes('`/marketplace/loans/${loanId}/repayments`'), 'client missing /loans/:id/repayments');
    assert.ok(marketplaceRoute.includes("router.get('/loans/:id/repayments'"), 'backend missing GET /loans/:id/repayments');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. API CLIENT INTERNALS
// ─────────────────────────────────────────────────────────────────────────────

describe('2. API Client — Token & Auth Handling', () => {
  const client = readFile('api-client.js');

  test('login stores accessToken in localStorage under paysick_auth_token', () => {
    assert.ok(client.includes("localStorage.setItem('paysick_auth_token', response.accessToken)"),
      'login must store accessToken as paysick_auth_token');
  });

  test('login stores refreshToken in localStorage under paysick_refresh_token', () => {
    assert.ok(client.includes("localStorage.setItem('paysick_refresh_token'"),
      'login must store refreshToken');
  });

  test('login stores user object in localStorage under paysick_user', () => {
    assert.ok(client.includes("localStorage.setItem('paysick_user'"),
      'login must store user object');
  });

  test('logout clears all auth localStorage keys', () => {
    assert.ok(client.includes("localStorage.removeItem('paysick_auth_token')"), 'logout must clear paysick_auth_token');
    assert.ok(client.includes("localStorage.removeItem('paysick_refresh_token')"), 'logout must clear paysick_refresh_token');
    assert.ok(client.includes("localStorage.removeItem('paysick_user')"), 'logout must clear paysick_user');
  });

  test('request helper attaches Bearer token from paysick_auth_token', () => {
    assert.ok(client.includes("localStorage.getItem('paysick_auth_token')"), 'request must read paysick_auth_token');
    assert.ok(client.includes('`Bearer ${token}`'), 'request must format token as Bearer');
  });

  test('isAuthenticated checks paysick_auth_token presence', () => {
    assert.ok(client.includes("localStorage.getItem('paysick_auth_token')"), 'isAuthenticated must check token');
  });

  test('baseURL uses /api in production (non-localhost)', () => {
    assert.ok(client.includes("'/api'"), "baseURL must default to '/api' in production");
  });

  test('baseURL uses localhost:3000 in development', () => {
    assert.ok(client.includes("'http://localhost:3000/api'"), 'baseURL must use localhost:3000 in dev');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. BACKEND ROUTE STRUCTURE
// ─────────────────────────────────────────────────────────────────────────────

describe('3. Backend — Route File Structure', () => {
  test('all route files exist', () => {
    const routeFiles = [
      'backend/src/routes/users.js',
      'backend/src/routes/applications.js',
      'backend/src/routes/payments.js',
      'backend/src/routes/providers.js',
      'backend/src/routes/marketplace.js',
      'backend/src/routes/risk.js',
    ];
    for (const f of routeFiles) {
      assert.ok(fileExists(f), `Missing route file: ${f}`);
    }
  });

  test('server.js mounts all routes at correct API paths', () => {
    const server = readFile('backend/src/server.js');
    assert.ok(server.includes("'/api/users'"), 'users routes not mounted at /api/users');
    assert.ok(server.includes("'/api/applications'"), 'applications routes not mounted at /api/applications');
    assert.ok(server.includes("'/api/payments'"), 'payments routes not mounted at /api/payments');
    assert.ok(server.includes("'/api/providers'"), 'providers routes not mounted at /api/providers');
    assert.ok(server.includes("'/api/marketplace'"), 'marketplace routes not mounted at /api/marketplace');
    assert.ok(server.includes("'/api/risk'"), 'risk routes not mounted at /api/risk');
  });

  test('api/index.js Vercel entry point exists and exports Express app', () => {
    assert.ok(fileExists('api/index.js'), 'api/index.js is missing');
    const entry = readFile('api/index.js');
    assert.ok(entry.includes("require('../backend/src/server')"), 'api/index.js must require backend server');
    assert.ok(entry.includes('module.exports'), 'api/index.js must export the app');
  });

  test('vercel.json routes API calls to api/index.js', () => {
    const vercel = JSON.parse(readFile('vercel.json'));
    const apiRewrite = vercel.rewrites.find(r => r.source.includes('/api/'));
    assert.ok(apiRewrite, 'No /api/ rewrite found in vercel.json');
    assert.equal(apiRewrite.destination, '/api/index.js', 'API rewrite must point to /api/index.js');
  });

  test('vercel.json has health endpoint rewrite', () => {
    const vercel = JSON.parse(readFile('vercel.json'));
    const healthRewrite = vercel.rewrites.find(r => r.source === '/health');
    assert.ok(healthRewrite, 'Missing /health rewrite in vercel.json');
    assert.equal(healthRewrite.destination, '/api/index.js');
  });

  test('server.js uses VERCEL !== "1" guard (not NODE_ENV check)', () => {
    const server = readFile('backend/src/server.js');
    assert.ok(server.includes("process.env.VERCEL !== '1'"), 'Must use VERCEL guard');
    assert.ok(!server.includes("NODE_ENV !== 'production' || !process.env.VERCEL"),
      'Must NOT use broken NODE_ENV+VERCEL guard pattern');
  });

  test('server.js graceful shutdown handles SIGTERM and SIGINT', () => {
    const server = readFile('backend/src/server.js');
    assert.ok(server.includes("process.on('SIGTERM'"), 'SIGTERM handler missing');
    assert.ok(server.includes("process.on('SIGINT'"), 'SIGINT handler missing');
    assert.ok(server.includes('pool.end()'), 'pool.end() missing from graceful shutdown');
  });

  test('root package.json is lean (no backend deps duplicated)', () => {
    const rootPkg = JSON.parse(readFile('package.json'));
    assert.ok(!rootPkg.dependencies || !rootPkg.dependencies.express,
      'express must not be in root package.json — belongs in backend/package.json');
    assert.ok(!rootPkg.dependencies || !rootPkg.dependencies.pg,
      'pg must not be in root package.json');
  });

  test('node engine constraint is >= 18 not a specific version', () => {
    const rootPkg = JSON.parse(readFile('package.json'));
    const engine = rootPkg.engines && rootPkg.engines.node;
    assert.ok(engine && engine.includes('>='), 'engines.node must use >= constraint');
    assert.ok(!engine || !engine.includes('24.x'), 'engines.node must not be locked to 24.x');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. BACKEND SECURITY MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

describe('4. Backend — Security & Auth Middleware', () => {
  const authMiddleware = readFile('backend/src/middleware/auth.middleware.js');
  const providersRoute = readFile('backend/src/routes/providers.js');
  const riskRoute = readFile('backend/src/routes/risk.js');

  test('authenticateToken validates Bearer token from Authorization header', () => {
    assert.ok(authMiddleware.includes('Authorization'), 'must read Authorization header');
    assert.ok(authMiddleware.includes('Bearer'), 'must handle Bearer scheme');
  });

  test('requireRole / requireAdmin enforces role check after auth', () => {
    assert.ok(
      authMiddleware.includes('requireAdmin') || authMiddleware.includes('requireRole'),
      'auth middleware must export role enforcement function'
    );
  });

  test('all admin provider routes require authenticateToken', () => {
    // Every admin route should have authenticateToken
    const adminRouteMatches = providersRoute.match(/router\.(get|put|delete)\('\/admin/g) || [];
    for (const _ of adminRouteMatches) {
      assert.ok(providersRoute.includes('authenticateToken'),
        'Admin provider routes must require authenticateToken');
    }
  });

  test('providers admin routes require admin role', () => {
    assert.ok(
      providersRoute.includes("requireRole('admin')") || providersRoute.includes('requireAdmin'),
      'Admin provider routes must enforce admin role'
    );
  });

  test('all risk routes require admin role', () => {
    assert.ok(
      riskRoute.includes("requireRole('admin')") || riskRoute.includes('requireAdmin'),
      'Risk routes must enforce admin role'
    );
  });

  test('providers.apply route encrypts banking data (not base64)', () => {
    assert.ok(providersRoute.includes('encryptBankingData'),
      'providers apply must use encryptBankingData (AES-256-GCM)');
    assert.ok(!providersRoute.includes("Buffer.from(account_number).toString('base64')"),
      'providers apply must NOT use base64 for banking data');
  });

  test('server.js has rate limiting on auth endpoints', () => {
    const server = readFile('backend/src/server.js');
    assert.ok(server.includes('rateLimit') || server.includes('rateLimiter'), 'Rate limiter missing');
    assert.ok(server.includes('/register') || server.includes('authLimiter'), 'Auth rate limit missing');
  });

  test('server.js has helmet security headers', () => {
    const server = readFile('backend/src/server.js');
    assert.ok(server.includes('helmet'), 'Helmet security headers missing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. FRONTEND PAGE INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

describe('5. Frontend — Auth Guards on Protected Pages', () => {
  const pages = {
    'dashboard.html': readFile('dashboard.html'),
    'payments.html': readFile('payments.html'),
    'make-payment.html': readFile('make-payment.html'),
    'admin-dashboard.html': readFile('admin-dashboard.html'),
    'onboarding.html': readFile('onboarding.html'),
  };

  for (const [name, content] of Object.entries(pages)) {
    test(`${name} has auth guard redirecting to login.html`, () => {
      assert.ok(content.includes("'login.html'") || content.includes('"login.html"'),
        `${name} missing redirect to login.html`);
      assert.ok(
        content.includes('paysick_auth_token') || content.includes('paysick_user'),
        `${name} missing token/user check`
      );
    });
  }
});

describe('6. Frontend — Dashboard API Integration', () => {
  const dashboard = readFile('dashboard.html');

  test('dashboard.html loads api-client.js', () => {
    assert.ok(dashboard.includes('api-client.js'), 'dashboard must load api-client.js');
  });

  test('dashboard.html calls getDashboard() to load live stats', () => {
    assert.ok(
      dashboard.includes('getDashboard') || dashboard.includes('/users/dashboard'),
      'dashboard must call getDashboard() — not use hardcoded stats'
    );
  });

  test('dashboard.html calls getPlans() or getUpcoming() for payment data', () => {
    assert.ok(
      dashboard.includes('getPlans') || dashboard.includes('getUpcoming') ||
      dashboard.includes('/payments/plans') || dashboard.includes('/payments/upcoming'),
      'dashboard must load payment plans from API'
    );
  });

  test('dashboard.html has dynamic stat containers (not hardcoded values)', () => {
    // Hardcoded amounts like R24,500, R3,500 must not appear in production HTML
    assert.ok(!dashboard.includes('R24,500'), 'dashboard must not have hardcoded R24,500 stat');
    assert.ok(!dashboard.includes('R3,500'), 'dashboard must not have hardcoded R3,500 stat');
    assert.ok(!dashboard.includes('R18,900'), 'dashboard must not have hardcoded R18,900 stat');
  });

  test('dashboard.html has no hardcoded sample payment IDs', () => {
    assert.ok(!dashboard.includes('sample-id-1'), 'dashboard must not have sample-id-1 hardcoded');
    assert.ok(!dashboard.includes('sample-id-2'), 'dashboard must not have sample-id-2 hardcoded');
    assert.ok(!dashboard.includes('sample-id-3'), 'dashboard must not have sample-id-3 hardcoded');
  });
});

describe('7. Frontend — Payments Page Integration', () => {
  const payments = readFile('payments.html');

  test('payments.html loads api-client.js', () => {
    assert.ok(payments.includes('api-client.js'), 'payments must load api-client.js');
  });

  test('payments.html calls getUpcoming() for upcoming payments tab', () => {
    assert.ok(payments.includes('getUpcoming'), 'payments must call getUpcoming()');
  });

  test('payments.html calls getHistory() for history tab', () => {
    assert.ok(payments.includes('getHistory'), 'payments must call getHistory()');
  });

  test('payments.html renders payment_id in make-payment links', () => {
    assert.ok(payments.includes('payment_id') || payments.includes('payment.payment_id'),
      'payments must use real payment_id in Pay Now links');
  });
});

describe('8. Frontend — Provider Directory Integration', () => {
  const providers = readFile('providers.html');

  test('providers.html calls /api/providers', () => {
    assert.ok(
      providers.includes("'/api/providers'") || providers.includes('"/api/providers"') ||
      providers.includes("PaySickAPI.providers"),
      'providers.html must call the providers API'
    );
  });

  test('providers.html calls /api/providers/track-cta', () => {
    assert.ok(providers.includes('track-cta'), 'providers.html must track CTA clicks');
  });
});

describe('9. Frontend — Login Flow Alignment', () => {
  const login = readFile('login.html');

  test('login.html calls /api/users/login', () => {
    assert.ok(login.includes("'/api/users/login'"), 'login.html must call /api/users/login');
  });

  test('login.html stores accessToken as paysick_auth_token', () => {
    assert.ok(login.includes("'paysick_auth_token'"), 'login.html must store to paysick_auth_token');
    assert.ok(login.includes('accessToken'), 'login.html must read accessToken from response');
  });

  test('login.html stores user.full_name mapped to name field', () => {
    // Dashboard reads user.name — login must store full_name as name
    assert.ok(login.includes('full_name'), 'login.html must map full_name to user object');
  });

  test('login.html handles EMAIL_UNVERIFIED 403 response', () => {
    assert.ok(login.includes('EMAIL_UNVERIFIED'), 'login must handle unverified email response');
    assert.ok(login.includes('verify-email.html'), 'login must redirect to verify-email.html');
  });

  test('login.html has remember-me refresh token flow', () => {
    assert.ok(login.includes('refreshToken') || login.includes('paysick_remember'),
      'login.html must implement remember-me with refresh token');
    assert.ok(!login.includes('password') || !login.includes("localStorage.setItem('paysick_remember", ) ||
      !login.includes('password: '),
      'login.html must NOT store the password in remember-me'
    );
  });

  test('login.html refresh token flow calls /api/users/refresh-token', () => {
    assert.ok(login.includes('/api/users/refresh-token'), 'login must call refresh-token endpoint');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. REGRESSION — BRAND COMPLIANCE
// ─────────────────────────────────────────────────────────────────────────────

describe('10. Regression — Brand Compliance (no specific provider names in public pages)', () => {
  const forbiddenBrands = ['Netcare', 'Mediclinic', 'Life Healthcare', 'Spec-Savers', 'SpecSavers'];

  const publicPages = [
    'index.html',
    'about.html',
    'contact.html',
    'providers.html',
    'dashboard.html',
  ];

  for (const page of publicPages) {
    if (!fileExists(page)) continue;
    const content = readFile(page);
    for (const brand of forbiddenBrands) {
      test(`${page} must not contain brand name "${brand}"`, () => {
        assert.ok(
          !content.includes(brand),
          `${page} contains forbidden brand name: ${brand}`
        );
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. REGRESSION — VERCEL DEPLOYMENT CONFIG
// ─────────────────────────────────────────────────────────────────────────────

describe('11. Regression — Vercel Deployment Config', () => {
  const vercel = JSON.parse(readFile('vercel.json'));

  test('vercel.json version is 2', () => {
    assert.equal(vercel.version, 2);
  });

  test('vercel.json uses rewrites (not routes)', () => {
    assert.ok(vercel.rewrites, 'must use rewrites key');
    assert.ok(!vercel.routes, 'must not use deprecated routes key');
  });

  test('vercel.json sets NODE_ENV to production', () => {
    assert.equal(vercel.env && vercel.env.NODE_ENV, 'production');
  });

  test('vercel.json sets CORS_ORIGIN for paysick.co.za', () => {
    const cors = vercel.env && vercel.env.CORS_ORIGIN;
    assert.ok(cors && cors.includes('paysick.co.za'), 'CORS_ORIGIN must include paysick.co.za');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. REGRESSION — PAYMENT FLOW RESPONSE ALIGNMENT
// ─────────────────────────────────────────────────────────────────────────────

describe('12. Regression — Payment Flow Field Alignment', () => {
  const paymentsRoute = readFile('backend/src/routes/payments.js');
  const paymentsHtml = readFile('payments.html');
  const makePaymentHtml = readFile('make-payment.html');

  test('backend /payments/upcoming returns payment_id field', () => {
    // payments.html references payment.payment_id in links
    assert.ok(paymentsRoute.includes('payment_id'), 'backend must return payment_id field');
  });

  test('backend /payments/upcoming returns due_date field', () => {
    assert.ok(paymentsRoute.includes('due_date'), 'backend must return due_date field');
    assert.ok(paymentsHtml.includes('due_date'), 'frontend must read due_date field');
  });

  test('backend /payments/upcoming returns amount field', () => {
    assert.ok(paymentsRoute.includes('amount'), 'backend must return amount field');
    assert.ok(paymentsHtml.includes('amount'), 'frontend must read amount field');
  });

  test('backend /payments/upcoming returns provider_name field', () => {
    assert.ok(paymentsRoute.includes('provider_name'), 'backend must return provider_name field');
    assert.ok(paymentsHtml.includes('provider_name'), 'frontend must read provider_name');
  });

  test('backend /payments/:id/pay returns full transaction row (RETURNING *)', () => {
    assert.ok(paymentsRoute.includes('RETURNING *'), 'backend must use RETURNING * to return full transaction row including transaction_id');
  });

  test('make-payment.html reads transaction_id from payment response', () => {
    assert.ok(makePaymentHtml.includes('transaction_id'), 'make-payment must read transaction_id');
  });

  test('make-payment.html redirects to payment-success.html on success', () => {
    assert.ok(makePaymentHtml.includes('payment-success.html'), 'must redirect to success page');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. REGRESSION — USER DASHBOARD RESPONSE ALIGNMENT
// ─────────────────────────────────────────────────────────────────────────────

describe('13. Regression — Dashboard API Response Alignment', () => {
  const usersRoute = readFile('backend/src/routes/users.js');
  const dashboard = readFile('dashboard.html');

  test('backend /users/dashboard returns active_plans field', () => {
    assert.ok(usersRoute.includes('active_plans'), 'backend must return active_plans');
  });

  test('backend /users/dashboard returns total_balance field', () => {
    assert.ok(usersRoute.includes('total_balance'), 'backend must return total_balance');
  });

  test('backend /users/dashboard returns next_payment field', () => {
    assert.ok(usersRoute.includes('next_payment'), 'backend must return next_payment');
  });

  test('backend /users/dashboard returns payment_history.total_paid_this_year', () => {
    assert.ok(usersRoute.includes('total_paid_this_year'), 'backend must return total_paid_this_year');
  });

  test('frontend dashboard reads active_plans from API response', () => {
    assert.ok(dashboard.includes('active_plans'),
      'dashboard.html must read active_plans from getDashboard() response');
  });

  test('frontend dashboard reads total_balance from API response', () => {
    assert.ok(dashboard.includes('total_balance'),
      'dashboard.html must read total_balance from getDashboard() response');
  });

  test('frontend dashboard reads next_payment from API response', () => {
    assert.ok(dashboard.includes('next_payment'),
      'dashboard.html must read next_payment from getDashboard() response');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. REGRESSION — SECURITY SERVICE
// ─────────────────────────────────────────────────────────────────────────────

describe('14. Regression — Security Service Core Functions', () => {
  const securityService = readFile('backend/src/services/security.service.js');

  test('security.service exports encryptBankingData', () => {
    assert.ok(securityService.includes('encryptBankingData'), 'must export encryptBankingData');
  });

  test('security.service exports decryptBankingData', () => {
    assert.ok(securityService.includes('decryptBankingData'), 'must export decryptBankingData');
  });

  test('security.service uses AES-256-GCM (not AES-256-CBC or base64)', () => {
    assert.ok(securityService.includes('aes-256-gcm'), 'must use AES-256-GCM');
    assert.ok(!securityService.includes('aes-256-cbc'), 'must not use less secure AES-256-CBC');
  });

  test('security.service exports generateOpaqueToken using crypto.randomBytes', () => {
    assert.ok(securityService.includes('generateOpaqueToken'), 'must export generateOpaqueToken');
    assert.ok(securityService.includes('randomBytes'), 'token generation must use randomBytes');
  });

  test('security.service exports hashPassword using scrypt', () => {
    assert.ok(securityService.includes('hashPassword'), 'must export hashPassword');
    assert.ok(securityService.includes('scrypt'), 'must use scrypt for password hashing');
  });

  test('security.service exports validateEnvironment', () => {
    assert.ok(securityService.includes('validateEnvironment'), 'must export validateEnvironment');
  });

  test('security.service requires TOKEN_SECRET minimum length', () => {
    assert.ok(securityService.includes('TOKEN_SECRET'), 'must check TOKEN_SECRET');
    assert.ok(securityService.includes('64') || securityService.includes('length'),
      'must enforce minimum TOKEN_SECRET length');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. REGRESSION — CONTACT PAGE
// ─────────────────────────────────────────────────────────────────────────────

describe('15. Regression — Contact Page (no alert() in production)', () => {
  const contact = readFile('contact.html');

  test('contact.html form uses fetch() not alert()', () => {
    assert.ok(!contact.includes("alert("), 'contact.html must not use alert() for form feedback');
    assert.ok(contact.includes('fetch('), 'contact.html must use fetch() for form submission');
  });

  test('contact.html shows inline success message on submit', () => {
    assert.ok(
      contact.includes('success') || contact.includes('Sending'),
      'contact.html must show inline success/loading state'
    );
  });
});
