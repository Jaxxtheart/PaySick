/**
 * WEBAUTHN (v1.22.0): passkey registration and sign-in verification.
 *
 * Pure: no database, no network. Implements the relying-party checks of
 * WebAuthn Level 2 (sections 7.1 and 7.2) with Node's crypto, because no
 * WebAuthn package can be installed here:
 *
 *   registration    clientData type/challenge/origin, rpIdHash, user
 *                   present + user verified, attested credential data,
 *                   COSE key (ES256 or RS256) -> JWK, "none" attestation
 *   authentication  clientData type/challenge/origin, rpIdHash, UP + UV,
 *                   signature over authData || SHA-256(clientDataJSON),
 *                   signature counter must increase (clone detection)
 *
 * We request attestation "none": Kehr needs to know the same device signs
 * in again, not which make of device it is. Every byte field crossing the
 * API is base64url.
 */

'use strict';

const crypto = require('crypto');
const cbor = require('../utils/cbor');

const ALG_ES256 = -7;
const ALG_RS256 = -257;
const SUPPORTED_ALGS = [ALG_ES256, ALG_RS256];
const TIMEOUT_MS = 5 * 60 * 1000;

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_BE = 0x08;
const FLAG_AT = 0x40;

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s, field) => {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*={0,2}$/.test(s)) throw new Error(`${field} must be base64url`);
  return Buffer.from(s, 'base64url');
};
const sha256 = (d) => crypto.createHash('sha256').update(d).digest();

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function newChallenge() {
  return b64u(crypto.randomBytes(32));
}

function registrationOptions({ rpId, rpName, user, challenge, excludeCredentialIds = [] }) {
  return {
    challenge,
    rp: { id: rpId, name: rpName },
    user: { id: b64u(Buffer.from(String(user.userId))), name: user.name, displayName: user.displayName || user.name },
    pubKeyCredParams: SUPPORTED_ALGS.map((alg) => ({ type: 'public-key', alg })),
    timeout: TIMEOUT_MS,
    attestation: 'none',
    authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
    excludeCredentials: excludeCredentialIds.map((id) => ({ type: 'public-key', id })),
  };
}

function authenticationOptions({ rpId, challenge }) {
  return { challenge, rpId, timeout: TIMEOUT_MS, userVerification: 'required', allowCredentials: [] };
}

function checkClientData(clientDataB64, { type, expectedChallenge, expectedOrigins }) {
  const raw = fromB64u(clientDataB64, 'clientDataJSON');
  let data;
  try { data = JSON.parse(raw.toString('utf8')); } catch (_) { throw new Error('clientDataJSON is not JSON'); }
  if (data.type !== type) throw new Error(`clientData type must be ${type}`);
  if (!expectedChallenge || !safeEqual(data.challenge, expectedChallenge)) throw new Error('challenge does not match');
  if (!expectedOrigins.includes(data.origin)) throw new Error(`origin ${data.origin} is not allowed`);
  if (data.crossOrigin === true) throw new Error('cross-origin ceremonies are not allowed (origin)');
  return raw;
}

function parseAuthData(authData, rpId) {
  if (authData.length < 37) throw new Error('authenticatorData is too short');
  if (!sha256(rpId).equals(authData.subarray(0, 32))) throw new Error('authenticatorData is for another relying party');
  const flags = authData[32];
  if (!(flags & FLAG_UP)) throw new Error('user presence is required');
  if (!(flags & FLAG_UV)) throw new Error('user verification is required');
  return { flags, signCount: authData.readUInt32BE(33) };
}

function coseToJwk(cose) {
  if (!(cose instanceof Map)) throw new Error('credential public key is not a COSE map');
  const kty = cose.get(1);
  const alg = cose.get(3);
  if (!SUPPORTED_ALGS.includes(alg)) throw new Error(`algorithm ${alg} is not supported`);
  if (alg === ALG_ES256) {
    if (kty !== 2 || cose.get(-1) !== 1) throw new Error('ES256 key must be EC2 on P-256');
    const x = cose.get(-2); const y = cose.get(-3);
    if (!Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) throw new Error('ES256 key coordinates are malformed');
    return { alg, jwk: { kty: 'EC', crv: 'P-256', x: b64u(x), y: b64u(y) } };
  }
  if (kty !== 3) throw new Error('RS256 key must be RSA');
  const n = cose.get(-1); const e = cose.get(-2);
  if (!Buffer.isBuffer(n) || !Buffer.isBuffer(e) || n.length < 256) throw new Error('RS256 key is malformed or under 2048 bits');
  return { alg, jwk: { kty: 'RSA', n: b64u(n), e: b64u(e) } };
}

function verifyRegistration({ credential, expectedChallenge, expectedOrigins, rpId }) {
  if (!credential || credential.type !== 'public-key' || !credential.response) throw new Error('credential must be a public-key credential');
  checkClientData(credential.response.clientDataJSON, { type: 'webauthn.create', expectedChallenge, expectedOrigins });

  const att = cbor.decode(fromB64u(credential.response.attestationObject, 'attestationObject'));
  if (!(att instanceof Map)) throw new Error('attestationObject is malformed');
  if (att.get('fmt') !== 'none') throw new Error(`attestation format ${att.get('fmt')} is not accepted`);
  const authData = att.get('authData');
  if (!Buffer.isBuffer(authData)) throw new Error('authData is missing');

  const { flags, signCount } = parseAuthData(authData, rpId);
  if (!(flags & FLAG_AT)) throw new Error('attested credential data is missing');
  if (authData.length < 55) throw new Error('attested credential data is truncated');
  const aaguid = authData.subarray(37, 53);
  const idLen = authData.readUInt16BE(53);
  if (idLen > 1023 || authData.length < 55 + idLen) throw new Error('credential id is malformed');
  const credentialIdBuf = authData.subarray(55, 55 + idLen);
  const { value: cose } = cbor.decodeFirst(authData.subarray(55 + idLen));
  const { alg, jwk } = coseToJwk(cose);

  const credentialId = b64u(credentialIdBuf);
  if (credential.rawId && b64u(fromB64u(credential.rawId, 'rawId')) !== credentialId) throw new Error('rawId does not match the attested credential');

  // Make sure Node accepts the key before it is stored.
  crypto.createPublicKey({ key: jwk, format: 'jwk' });

  return { credentialId, publicKeyJwk: jwk, alg, signCount, aaguid: b64u(aaguid), backupEligible: !!(flags & FLAG_BE) };
}

function verifyAuthentication({ credential, stored, expectedChallenge, expectedOrigins, rpId }) {
  if (!credential || credential.type !== 'public-key' || !credential.response) throw new Error('credential must be a public-key credential');
  const clientData = checkClientData(credential.response.clientDataJSON, { type: 'webauthn.get', expectedChallenge, expectedOrigins });
  const authData = fromB64u(credential.response.authenticatorData, 'authenticatorData');
  const { signCount } = parseAuthData(authData, rpId);

  const key = crypto.createPublicKey({ key: stored.publicKeyJwk, format: 'jwk' });
  const signed = Buffer.concat([authData, sha256(clientData)]);
  const signature = fromB64u(credential.response.signature, 'signature');
  // ES256 signatures are DER-encoded (Node's default); RS256 is PKCS#1 v1.5.
  const ok = stored.alg === ALG_RS256
    ? crypto.verify('sha256', signed, { key, padding: crypto.constants.RSA_PKCS1_PADDING }, signature)
    : crypto.verify('sha256', signed, key, signature);
  if (!ok) throw new Error('signature is not valid');

  const previous = Number(stored.signCount || 0);
  if ((signCount !== 0 || previous !== 0) && signCount <= previous) {
    throw new Error('signature counter did not increase; the passkey may be cloned');
  }
  return { signCount };
}

module.exports = {
  ALG_ES256,
  ALG_RS256,
  TIMEOUT_MS,
  newChallenge,
  registrationOptions,
  authenticationOptions,
  verifyRegistration,
  verifyAuthentication,
};
