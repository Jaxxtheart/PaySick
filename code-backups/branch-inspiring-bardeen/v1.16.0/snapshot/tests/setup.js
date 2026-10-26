/**
 * Jest global setup — runs before every test file.
 * Sets the minimum environment variables needed by the security service.
 */

process.env.NODE_ENV = 'test';
process.env.TOKEN_SECRET = 'a'.repeat(128); // 128-char dev secret
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'.padEnd(64, '0').slice(0, 64); // 64 hex chars = 32 bytes
process.env.POSTGRES_URL = 'postgresql://test:test@localhost/test'; // never actually connected
process.env.ALLOW_DEMO_LOGIN = 'true';
