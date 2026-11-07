/**
 * Unit Tests: Kehr v1.22.0 wiring
 *
 * Written BEFORE each implementation (test-first, per CLAUDE.md).
 * Static-source checks for routes, server mounts, the API client and pages,
 * which cannot be loaded here (express/pg are not installable). The logic
 * is covered by the executable service tests.
 *
 * Run: node --test tests/unit/kehr-v1-22-wiring.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '../..');
const read = (rel) => {
  const p = path.join(REPO_ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};

const routeSource = read('backend/src/routes/kehr.js');
const serverSource = read('backend/src/server.js');
const apiClientSource = read('api-client.js');
const passPage = read('kehr-pass.html');

function block(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start !== -1, `expected ${signature}`);
  const next = source.indexOf('\nrouter.', start + signature.length);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('document reader (upload)', () => {
  const sig = "router.post('/preapprovals/:id/documents/upload',";

  test('the upload route requires authentication and calls the flow', () => {
    const b = block(routeSource, sig);
    assert.match(b, /authenticateToken/);
    assert.match(b, /flow\.readDocument\(req\.user\.userId, req\.params\.id/);
  });

  test('checks the media type and size before reading', () => {
    const b = block(routeSource, sig);
    assert.match(b, /ALLOWED_MEDIA_TYPES\.includes/);
    assert.match(b, /MAX_DOCUMENT_BYTES/);
  });

  test('says so plainly when the reader is not available', () => {
    assert.match(block(routeSource, sig), /isAvailable\(\)/);
  });

  test('the flow is given the document reader', () => {
    assert.match(routeSource, /require\('\.\.\/services\/kehr-document-reader\.service'\)/);
    assert.match(routeSource, /documentReader/);
  });

  test('uploads share the tight assess bucket', () => {
    assert.match(serverSource, /app\.use\('\/api\/kehr\/preapprovals\/:id\/documents\/upload', kehrAssessLimiter\)/);
  });

  test('the express body limit fits a 4MB file as base64', () => {
    const m = /express\.json\(\{[\s\S]*?limit: '(\d+)mb'/.exec(serverSource);
    assert.ok(m && Number(m[1]) >= 6, 'json limit must be at least 6mb');
  });

  test('the API client and the pass page can upload', () => {
    assert.match(apiClientSource, /async uploadDocument\(preapprovalId, \{ fileBase64, mediaType \}\)/);
    assert.match(passPage, /PaySickAPI\.kehr\.uploadDocument/);
    assert.match(passPage, /<input[^>]*type="file"[^>]*accept="\.pdf,\.jpg,\.jpeg,\.png"/);
  });
});

describe('WhatsApp delivery', () => {
  const repoSource = read('backend/src/services/kehr-repository.js');
  const providerPage = read('provider-kehr.html');
  const sig = "router.post('/provider/plan-links',";

  test('the flow is given the WhatsApp adapter as messenger', () => {
    assert.match(routeSource, /require\('\.\.\/adapters\/whatsapp\.adapter'\)/);
    assert.match(routeSource, /messenger: whatsappAdapter/);
  });

  test('the provider route passes the delivery choice and the agreement only when literally true', () => {
    const b = block(routeSource, sig);
    assert.match(b, /deliver: deliver === 'whatsapp' \? 'whatsapp' : null/);
    assert.match(b, /patientAgreedToWhatsApp: patientAgreedToWhatsApp === true/);
  });

  test('the repository looks up the provider name for the message', () => {
    assert.match(repoSource, /async getProviderName\(providerId\)/);
    assert.match(repoSource, /SELECT provider_name FROM providers WHERE provider_id = \$1/);
  });

  test('the provider page asks for the patient\'s agreement before sending on WhatsApp', () => {
    assert.match(providerPage, /id="wa-agree"/);
    assert.match(providerPage, /deliver: 'whatsapp'/);
    assert.match(providerPage, /patientAgreedToWhatsApp/);
    assert.match(providerPage, /mock_sent/);
  });

  test('the API client forwards the delivery fields', () => {
    assert.match(apiClientSource, /async createPlanLink\(\{ patientPhone, amountCents, billTotalCents, procedureCode, deliver, patientAgreedToWhatsApp \}\)/);
  });
});

describe('passkeys', () => {
  const migration = read('backend/src/migrations/015_passkeys.sql');
  const repoSource = read('backend/src/services/passkey-repository.js');
  const passkeyRoutes = read('backend/src/routes/passkeys.js');
  const helper = read('js/passkey.js');
  const loginPage = read('login.html');

  test('migration 015 stores public keys and single-use challenges, never a private key', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS user_passkeys/);
    assert.match(migration, /credential_id TEXT PRIMARY KEY/);
    assert.match(migration, /public_key_jwk JSONB NOT NULL/);
    assert.match(migration, /sign_count BIGINT NOT NULL/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS webauthn_challenges/);
    assert.match(migration, /purpose IN \('register', 'login'\)/);
    assert.doesNotMatch(migration, /private/i);
  });

  test('a challenge is consumed atomically, once', () => {
    assert.match(repoSource, /UPDATE webauthn_challenges SET used_at = \$2\s+WHERE challenge_id = \$1 AND used_at IS NULL/);
  });

  test('a passkey is only removed by its owner', () => {
    assert.match(repoSource, /DELETE FROM user_passkeys WHERE user_id = \$1 AND credential_id = \$2/);
  });

  test('registering and managing passkeys requires authentication', () => {
    for (const sig of ["router.post('/register/options',", "router.post('/register/verify',", "router.get('/',", "router.delete('/:credentialId',"]) {
      assert.match(block(passkeyRoutes, sig), /authenticateToken/, sig);
    }
  });

  test('sign-in issues the same session as the password login and refuses inactive accounts', () => {
    const b = block(passkeyRoutes, "router.post('/login/verify',");
    assert.match(b, /createSession\(/);
    assert.match(b, /status !== 'active'/);
    assert.match(b, /logSecurityEvent\('PASSKEY_LOGIN'/);
  });

  test('a failed sign-in is logged and gives one generic answer', () => {
    const b = block(passkeyRoutes, "router.post('/login/verify',");
    assert.match(b, /logSecurityEvent\('PASSKEY_LOGIN_FAILED'/);
    assert.match(b, /status\(401\)/);
  });

  test('the relying party comes from config; production refuses without it', () => {
    assert.match(passkeyRoutes, /WEBAUTHN_RP_ID/);
    assert.match(passkeyRoutes, /WEBAUTHN_ORIGINS/);
    assert.match(passkeyRoutes, /NODE_ENV === 'production'/);
  });

  test('sets X-Robots-Tag', () => {
    assert.match(passkeyRoutes, /X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex'/);
  });

  test('server mounts the routes behind the auth rate limit', () => {
    assert.match(serverSource, /const passkeyRoutes = require\('\.\/routes\/passkeys'\)/);
    assert.match(serverSource, /app\.use\('\/api\/auth\/passkeys', passkeyRoutes\)/);
    assert.match(serverSource, /app\.use\('\/api\/auth\/passkeys\/login', authLimiter\)/);
    assert.match(serverSource, /app\.use\('\/api\/auth\/passkeys\/register', authLimiter\)/);
  });

  test('the browser helper converts base64url and calls the WebAuthn API', () => {
    assert.match(helper, /navigator\.credentials\.create/);
    assert.match(helper, /navigator\.credentials\.get/);
    assert.match(helper, /window\.PublicKeyCredential/);
  });

  test('login offers passkey sign-in and the pass page offers to add one', () => {
    assert.match(loginPage, /<script src="js\/passkey\.js"><\/script>/);
    assert.match(loginPage, /id="passkey-login"/);
    assert.match(loginPage, /KehrPasskey\.signIn/);
    assert.match(passPage, /<script src="js\/passkey\.js"><\/script>/);
    assert.match(passPage, /KehrPasskey\.register/);
  });
});

describe('login returns to a pending plan link', () => {
  test('after sign-in, a held plan link takes the patient back to kehr-pass.html', () => {
    const loginPage = read('login.html');
    const fn = loginPage.slice(loginPage.indexOf('function redirectByRole'), loginPage.indexOf('// ── Guard'));
    assert.match(fn, /sessionStorage\.getItem\('kehr_pending_link'\)/);
    assert.match(fn, /kehr-pass\.html/);
  });
});

describe('provider result rows', () => {
  test('labels never break mid-word; only the long value (the link) wraps', () => {
    const providerPage = read('provider-kehr.html');
    assert.match(providerPage, /\.out \.row span \{[^}]*white-space: nowrap/);
    assert.match(providerPage, /\.out \.row strong \{[^}]*overflow-wrap: anywhere/);
    assert.doesNotMatch(providerPage, /\.out \{[^}]*word-break: break-all/);
  });
});

describe('v1.22.0 bot blocklist review', () => {
  const { isBotUserAgent } = require('../../backend/src/middleware/bot-blocker');
  for (const ua of ['GoogleOther', 'GoogleOther-Image/1.0', 'Amzn-User/0.1', 'Gemini-Deep-Research', 'Mozilla/5.0 (compatible; ChatGPT-Agent/1.0)', 'meta-webindexer/1.1', 'Mozilla/5.0 (compatible; Cloudflare-AutoRAG/1.0)']) {
    test(`blocks ${ua}`, () => assert.equal(isBotUserAgent(ua), true));
  }
  test('still allows an ordinary Android browser', () => {
    assert.equal(isBotUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'), false);
  });
});
