/**
 * Unit Tests: passkey sign-in (WebAuthn) (v1.22.0)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * npm is not reachable here, so WebAuthn is verified with Node's crypto:
 *   utils/cbor.js            minimal CBOR (RFC 8949) for attestation objects and COSE keys
 *   webauthn.service.js      registration and authentication verification (pure)
 *   passkey.service.js       single-use challenges, stored credentials, sign counts
 *
 * The tests build real credentials with Node's crypto (P-256 and RSA), so
 * the verification code runs against genuine signatures.
 *
 * Run: node --test tests/unit/kehr-passkeys.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const cbor = require('../../backend/src/utils/cbor');
const webauthn = require('../../backend/src/services/webauthn.service');
const { createPasskeyService } = require('../../backend/src/services/passkey.service');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost:3000';
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sha256 = (d) => crypto.createHash('sha256').update(d).digest();

// ── A software authenticator ──────────────────────────────────────────
function makeAuthenticator({ alg = -7, rpId = RP_ID } = {}) {
  const pair = alg === -7
    ? crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
    : crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const cose = alg === -7
    ? new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]])
    : new Map([[1, 3], [3, -257], [-1, Buffer.from(jwk.n, 'base64url')], [-2, Buffer.from(jwk.e, 'base64url')]]);
  const credentialId = crypto.randomBytes(16);
  let counter = 0;

  function authData({ attested, flags = 0x01 | 0x04, count }) {
    const head = Buffer.concat([sha256(rpId), Buffer.from([flags | (attested ? 0x40 : 0)]), Buffer.alloc(4)]);
    head.writeUInt32BE(count, 33);
    if (!attested) return head;
    const len = Buffer.alloc(2); len.writeUInt16BE(credentialId.length);
    return Buffer.concat([head, Buffer.alloc(16), len, credentialId, cbor.encode(cose)]);
  }

  return {
    credentialId,
    create({ challenge, origin = ORIGIN, type = 'webauthn.create', flags, fmt = 'none' }) {
      const clientDataJSON = Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
      const attestationObject = cbor.encode(new Map([['fmt', fmt], ['attStmt', new Map()], ['authData', authData({ attested: true, flags, count: 0 })]]));
      return { id: b64u(credentialId), rawId: b64u(credentialId), type: 'public-key', response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(attestationObject) } };
    },
    get({ challenge, origin = ORIGIN, type = 'webauthn.get', flags, count, tamper = false }) {
      counter = count === undefined ? counter + 1 : count;
      const clientDataJSON = Buffer.from(JSON.stringify({ type, challenge, origin }));
      const ad = authData({ attested: false, flags, count: counter });
      const signature = crypto.sign('sha256', Buffer.concat([ad, sha256(clientDataJSON)]), pair.privateKey);
      if (tamper) signature[signature.length - 1] ^= 0xff;
      return { id: b64u(credentialId), rawId: b64u(credentialId), type: 'public-key', response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(ad), signature: b64u(signature), userHandle: null } };
    },
  };
}

// ── CBOR ─────────────────────────────────────────────────────────────
describe('utils/cbor', () => {
  test('round-trips integers, negatives, byte and text strings, arrays and maps', () => {
    const value = new Map([[1, 2], [-1, -300], ['fmt', 'none'], ['b', Buffer.from([1, 2, 3])], ['arr', [0, 23, 24, 255, 256, 65536]], ['t', true], ['n', null]]);
    const decoded = cbor.decode(cbor.encode(value));
    assert.equal(decoded.get(1), 2);
    assert.equal(decoded.get(-1), -300);
    assert.equal(decoded.get('fmt'), 'none');
    assert.deepEqual([...decoded.get('b')], [1, 2, 3]);
    assert.deepEqual(decoded.get('arr'), [0, 23, 24, 255, 256, 65536]);
    assert.equal(decoded.get('t'), true);
    assert.equal(decoded.get('n'), null);
  });

  test('decodeFirst reports how many bytes the first item used', () => {
    const a = cbor.encode(new Map([[1, 2]]));
    const { value, length } = cbor.decodeFirst(Buffer.concat([a, Buffer.from([0xff, 0xff])]));
    assert.equal(value.get(1), 2);
    assert.equal(length, a.length);
  });

  test('refuses truncated input and indefinite lengths', () => {
    assert.throws(() => cbor.decode(Buffer.from([0x59, 0x01])), /CBOR/);
    assert.throws(() => cbor.decode(Buffer.from([0x5f])), /CBOR/);
  });
});

// ── webauthn.service ─────────────────────────────────────────────────
describe('webauthn.verifyRegistration', () => {
  const challenge = webauthn.newChallenge();
  const verify = (credential, overrides = {}) => webauthn.verifyRegistration({ credential, expectedChallenge: challenge, expectedOrigins: [ORIGIN], rpId: RP_ID, ...overrides });

  test('accepts an ES256 passkey with user verification and returns its public key', () => {
    const auth = makeAuthenticator();
    const r = verify(auth.create({ challenge }));
    assert.equal(r.credentialId, b64u(auth.credentialId));
    assert.equal(r.alg, -7);
    assert.equal(r.publicKeyJwk.kty, 'EC');
    assert.equal(r.signCount, 0);
  });

  test('accepts an RS256 passkey', () => {
    const auth = makeAuthenticator({ alg: -257 });
    assert.equal(verify(auth.create({ challenge })).publicKeyJwk.kty, 'RSA');
  });

  test('refuses the wrong challenge, origin, ceremony type or relying party', () => {
    const auth = makeAuthenticator();
    assert.throws(() => verify(auth.create({ challenge: webauthn.newChallenge() })), /challenge/);
    assert.throws(() => verify(auth.create({ challenge, origin: 'https://evil.example' })), /origin/);
    assert.throws(() => verify(auth.create({ challenge, type: 'webauthn.get' })), /type/);
    assert.throws(() => verify(makeAuthenticator({ rpId: 'evil.example' }).create({ challenge })), /relying party/);
  });

  test('requires user presence and user verification', () => {
    const auth = makeAuthenticator();
    assert.throws(() => verify(auth.create({ challenge, flags: 0x01 })), /verification/);
  });

  test('accepts only "none" attestation (we ask for none)', () => {
    assert.throws(() => verify(makeAuthenticator().create({ challenge, fmt: 'fido-u2f' })), /attestation/);
  });
});

describe('webauthn.verifyAuthentication', () => {
  const regChallenge = webauthn.newChallenge();
  const auth = makeAuthenticator();
  const stored = webauthn.verifyRegistration({ credential: auth.create({ challenge: regChallenge }), expectedChallenge: regChallenge, expectedOrigins: [ORIGIN], rpId: RP_ID });
  const verify = (credential, challenge, signCount = 0) => webauthn.verifyAuthentication({ credential, stored: { publicKeyJwk: stored.publicKeyJwk, alg: stored.alg, signCount }, expectedChallenge: challenge, expectedOrigins: [ORIGIN], rpId: RP_ID });

  test('verifies a genuine signature and returns the new sign count', () => {
    const c = webauthn.newChallenge();
    assert.equal(verify(auth.get({ challenge: c, count: 5 }), c).signCount, 5);
  });

  test('refuses a tampered signature', () => {
    const c = webauthn.newChallenge();
    assert.throws(() => verify(auth.get({ challenge: c, tamper: true }), c), /signature/);
  });

  test('refuses a sign count that did not go up (a cloned authenticator)', () => {
    const c = webauthn.newChallenge();
    assert.throws(() => verify(auth.get({ challenge: c, count: 3 }), c, 7), /counter/);
  });

  test('allows authenticators that always report zero', () => {
    const c = webauthn.newChallenge();
    assert.equal(verify(auth.get({ challenge: c, count: 0 }), c, 0).signCount, 0);
  });

  test('refuses a signature made for another challenge', () => {
    assert.throws(() => verify(auth.get({ challenge: webauthn.newChallenge() }), webauthn.newChallenge()), /challenge/);
  });

  test('works for RS256', () => {
    const rsa = makeAuthenticator({ alg: -257 });
    const rc = webauthn.newChallenge();
    const reg = webauthn.verifyRegistration({ credential: rsa.create({ challenge: rc }), expectedChallenge: rc, expectedOrigins: [ORIGIN], rpId: RP_ID });
    const c = webauthn.newChallenge();
    const r = webauthn.verifyAuthentication({ credential: rsa.get({ challenge: c }), stored: { publicKeyJwk: reg.publicKeyJwk, alg: reg.alg, signCount: 0 }, expectedChallenge: c, expectedOrigins: [ORIGIN], rpId: RP_ID });
    assert.equal(r.signCount, 1);
  });
});

describe('webauthn options', () => {
  test('registration asks for a discoverable, user-verified passkey with no attestation', () => {
    const o = webauthn.registrationOptions({ rpId: RP_ID, rpName: 'Kehr by PaySick', user: { userId: 'u-1', name: 'thandi@example.com', displayName: 'Thandi' }, challenge: 'abc', excludeCredentialIds: ['x'] });
    assert.equal(o.rp.id, RP_ID);
    assert.equal(o.attestation, 'none');
    assert.equal(o.authenticatorSelection.residentKey, 'required');
    assert.equal(o.authenticatorSelection.userVerification, 'required');
    assert.deepEqual(o.pubKeyCredParams.map((p) => p.alg), [-7, -257]);
    assert.deepEqual(o.excludeCredentials, [{ type: 'public-key', id: 'x' }]);
  });

  test('sign-in asks for any passkey on this site, user-verified', () => {
    const o = webauthn.authenticationOptions({ rpId: RP_ID, challenge: 'abc' });
    assert.equal(o.userVerification, 'required');
    assert.deepEqual(o.allowCredentials, []);
  });
});

// ── passkey.service ──────────────────────────────────────────────────
describe('passkey.service', () => {
  function setup() {
    let clock = new Date('2026-10-27T09:00:00Z');
    const db = { challenges: [], passkeys: [] };
    let n = 0;
    const repo = {
      async insertChallenge(row) { const r = { ...row, challengeId: `ch-${++n}`, usedAt: null }; db.challenges.push(r); return r; },
      async consumeChallenge(challengeId, at) {
        const c = db.challenges.find((x) => x.challengeId === challengeId && !x.usedAt);
        if (!c) return null;
        c.usedAt = at; return c;
      },
      async listPasskeys(userId) { return db.passkeys.filter((p) => p.userId === userId); },
      async getPasskey(credentialId) { return db.passkeys.find((p) => p.credentialId === credentialId) || null; },
      async insertPasskey(row) { if (db.passkeys.some((p) => p.credentialId === row.credentialId)) return null; db.passkeys.push({ ...row }); return row; },
      async updateSignCount(credentialId, signCount, at) { Object.assign(db.passkeys.find((p) => p.credentialId === credentialId), { signCount, lastUsedAt: at }); },
      async deletePasskey(userId, credentialId) { const i = db.passkeys.findIndex((p) => p.userId === userId && p.credentialId === credentialId); if (i >= 0) db.passkeys.splice(i, 1); return i >= 0; },
    };
    const svc = createPasskeyService({ repo, rp: { id: RP_ID, name: 'Kehr by PaySick', origins: [ORIGIN] }, now: () => clock });
    return { svc, db, tick: (ms) => { clock = new Date(clock.getTime() + ms); } };
  }
  const user = { userId: 'u-1', name: 'thandi@example.com', displayName: 'Thandi' };

  async function register(svc, auth) {
    const { challengeId, options } = await svc.startRegistration(user);
    return svc.finishRegistration(user.userId, { challengeId, credential: auth.create({ challenge: options.challenge }) });
  }

  test('registers a passkey and signs in with it', async () => {
    const { svc } = setup();
    const auth = makeAuthenticator();
    const reg = await register(svc, auth);
    assert.equal(reg.registered, true);
    const { challengeId, options } = await svc.startLogin();
    const r = await svc.finishLogin({ challengeId, credential: auth.get({ challenge: options.challenge }) });
    assert.deepEqual(r, { userId: 'u-1' });
  });

  test('a challenge can be used once', async () => {
    const { svc } = setup();
    const auth = makeAuthenticator();
    await register(svc, auth);
    const { challengeId, options } = await svc.startLogin();
    await svc.finishLogin({ challengeId, credential: auth.get({ challenge: options.challenge }) });
    await assert.rejects(svc.finishLogin({ challengeId, credential: auth.get({ challenge: options.challenge }) }), /challenge/);
  });

  test('a challenge expires after 5 minutes', async () => {
    const { svc, tick } = setup();
    const auth = makeAuthenticator();
    await register(svc, auth);
    const { challengeId, options } = await svc.startLogin();
    tick(5 * 60 * 1000 + 1);
    await assert.rejects(svc.finishLogin({ challengeId, credential: auth.get({ challenge: options.challenge }) }), /challenge/);
  });

  test('a registration challenge cannot be used to sign in, or by another user', async () => {
    const { svc } = setup();
    const auth = makeAuthenticator();
    const { challengeId, options } = await svc.startRegistration(user);
    await assert.rejects(svc.finishRegistration('u-2', { challengeId, credential: auth.create({ challenge: options.challenge }) }), /challenge/);
    const again = await svc.startRegistration(user);
    await assert.rejects(svc.finishLogin({ challengeId: again.challengeId, credential: auth.get({ challenge: again.options.challenge }) }), /challenge/);
  });

  test('an unknown passkey cannot sign in', async () => {
    const { svc } = setup();
    const { challengeId, options } = await svc.startLogin();
    await assert.rejects(svc.finishLogin({ challengeId, credential: makeAuthenticator().get({ challenge: options.challenge }) }), /not recognised/);
  });

  test('stores the sign count and refuses a replayed lower count', async () => {
    const { svc, db } = setup();
    const auth = makeAuthenticator();
    await register(svc, auth);
    let s = await svc.startLogin();
    await svc.finishLogin({ challengeId: s.challengeId, credential: auth.get({ challenge: s.options.challenge, count: 9 }) });
    assert.equal(db.passkeys[0].signCount, 9);
    s = await svc.startLogin();
    await assert.rejects(svc.finishLogin({ challengeId: s.challengeId, credential: auth.get({ challenge: s.options.challenge, count: 4 }) }), /counter/);
  });

  test('the same passkey cannot be registered twice', async () => {
    const { svc } = setup();
    const auth = makeAuthenticator();
    await register(svc, auth);
    await assert.rejects(register(svc, auth), /already registered/);
  });

  test('a patient can list and remove their passkeys; the list holds no key material', async () => {
    const { svc } = setup();
    const auth = makeAuthenticator();
    await register(svc, auth);
    const list = await svc.listPasskeys('u-1');
    assert.equal(list.length, 1);
    assert.deepEqual(Object.keys(list[0]).sort(), ['createdAt', 'credentialId', 'lastUsedAt']);
    assert.equal(await svc.removePasskey('u-2', list[0].credentialId), false);
    assert.equal(await svc.removePasskey('u-1', list[0].credentialId), true);
  });
});
