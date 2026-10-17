/**
 * Route harness for node:test — drives real Express route handlers without
 * Express, Postgres or network.
 *
 * Third-party packages that may not be installed in the sandbox (express,
 * pg, dotenv, jsonwebtoken, nodemailer) are replaced with minimal stubs at
 * require time. config/database's query() is swapped for a delegate BEFORE
 * any route captures it via destructuring, so each test sets `harness.db`
 * to a function (sql, params) => ({ rows }).
 *
 * Usage:
 *   const harness = require('./helpers/route-harness');
 *   const router = harness.loadRouter('routes/marketplace');
 *   const res = await harness.invoke(router, 'post', '/applications', { body, user });
 */

'use strict';

const Module = require('module');
const path = require('path');

const BACKEND = path.resolve(__dirname, '../../../backend/src');

function fakeRouter() {
  const r = { routes: [], use() { return r; }, param() { return r; } };
  for (const m of ['get', 'post', 'put', 'patch', 'delete', 'all']) {
    r[m] = (routePath, ...handlers) => { r.routes.push({ method: m, path: routePath, handlers }); return r; };
  }
  return r;
}

function fakeExpress() { return fakeRouter(); }
fakeExpress.Router = fakeRouter;
fakeExpress.json = () => (req, res, next) => next();
fakeExpress.urlencoded = () => (req, res, next) => next();
fakeExpress.static = () => (req, res, next) => next();

const STUBS = {
  express: fakeExpress,
  pg: { Pool: class { constructor() {} on() {} async query() { throw new Error('no database in tests'); } async connect() { throw new Error('no database in tests'); } } },
  dotenv: { config() { return {}; } },
  jsonwebtoken: { sign: () => 'test-token', verify: () => ({}), decode: () => ({}) },
  nodemailer: { createTransport: () => ({ sendMail: async () => ({ messageId: 'test' }), verify: async () => true }) }
};

if (!Module._load.__shieldHarness) {
  const originalLoad = Module._load;
  const patched = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(STUBS, request)) return STUBS[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  patched.__shieldHarness = true;
  Module._load = patched;
}

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0'.repeat(64);

const harness = {
  calls: [],
  db: async () => ({ rows: [], rowCount: 0 }),

  reset() {
    harness.calls = [];
    harness.db = async () => ({ rows: [], rowCount: 0 });
  },

  /** Fake DB that answers by table name; an Error value makes that query throw. */
  tables(map) {
    return async (sql) => {
      for (const [name, rows] of Object.entries(map)) {
        if (new RegExp(`(FROM|INTO|UPDATE)\\s+${name}\\b`, 'i').test(sql)) {
          if (rows instanceof Error) throw rows;
          return { rows: typeof rows === 'function' ? rows(sql) : rows, rowCount: Array.isArray(rows) ? rows.length : 0 };
        }
      }
      return { rows: [], rowCount: 0 };
    };
  },

  sql(pattern) {
    return harness.calls.filter(([text]) => pattern.test(text));
  },

  loadRouter(relPath) {
    return require(path.join(BACKEND, relPath));
  },

  async invoke(router, method, routePath, { body = {}, params = {}, query = {}, user = { userId: 'pat-1', role: 'patient' }, headers = {} } = {}) {
    const route = router.routes.find((r) => r.method === method && r.path === routePath);
    if (!route) throw new Error(`No ${method.toUpperCase()} ${routePath} route`);
    const handler = route.handlers[route.handlers.length - 1];
    const req = {
      body, params, query, user, headers,
      ip: '127.0.0.1',
      get: (h) => headers[h.toLowerCase()] || (h.toLowerCase() === 'user-agent' ? 'node-test' : undefined),
      header: (h) => headers[h.toLowerCase()]
    };
    const res = {
      statusCode: 200,
      body: undefined,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
      send(payload) { this.body = payload; return this; },
      set() { return this; },
      setHeader() { return this; }
    };
    await handler(req, res, () => {});
    return res;
  }
};

const db = require(path.join(BACKEND, 'config/database'));
db.query = async (text, params) => {
  harness.calls.push([text, params]);
  return harness.db(text, params);
};
db.transaction = async (cb) => cb({
  query: async (text, params) => { harness.calls.push([text, params]); return harness.db(text, params); },
  release: () => {}
});

module.exports = harness;
