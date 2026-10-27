/**
 * PASSKEYS (v1.22.0): sign in to Kehr without a password.
 *
 * Wraps webauthn.service.js with state:
 *   - challenges are server-side, single use, tied to a purpose
 *     (register | login) and, for registration, to the signed-in user;
 *     they expire with the WebAuthn timeout (5 minutes)
 *   - credentials store the public key (JWK), algorithm and signature
 *     counter only; the private key never leaves the patient's device
 *
 * Takes a repository (passkey-repository.js in production, in-memory in
 * tests). The route issues the session after finishLogin, through the same
 * createSession the password login uses.
 */

'use strict';

const webauthn = require('./webauthn.service');

function createPasskeyService({ repo, rp, now = () => new Date() }) {
  if (!repo) throw new Error('createPasskeyService requires a repository');
  if (!rp || !rp.id || !Array.isArray(rp.origins) || !rp.origins.length) throw new Error('createPasskeyService requires rp.id and rp.origins');

  async function issueChallenge(purpose, userId) {
    const challenge = webauthn.newChallenge();
    const row = await repo.insertChallenge({
      challenge,
      purpose,
      userId: userId || null,
      expiresAt: new Date(now().getTime() + webauthn.TIMEOUT_MS).toISOString(),
    });
    return { challengeId: row.challengeId, challenge };
  }

  async function takeChallenge(challengeId, purpose, userId) {
    const at = now();
    const c = challengeId ? await repo.consumeChallenge(String(challengeId), at.toISOString()) : null;
    if (!c || c.purpose !== purpose || new Date(c.expiresAt).getTime() <= at.getTime()) {
      throw new Error('This challenge has expired. Please try again.');
    }
    if (purpose === 'register' && c.userId !== userId) throw new Error('This challenge belongs to another session.');
    return c;
  }

  async function startRegistration(user) {
    const existing = await repo.listPasskeys(user.userId);
    const { challengeId, challenge } = await issueChallenge('register', user.userId);
    return {
      challengeId,
      options: webauthn.registrationOptions({
        rpId: rp.id,
        rpName: rp.name || 'Kehr by PaySick',
        user,
        challenge,
        excludeCredentialIds: existing.map((p) => p.credentialId),
      }),
    };
  }

  async function finishRegistration(userId, { challengeId, credential } = {}) {
    const c = await takeChallenge(challengeId, 'register', userId);
    const verified = webauthn.verifyRegistration({ credential, expectedChallenge: c.challenge, expectedOrigins: rp.origins, rpId: rp.id });
    const saved = await repo.insertPasskey({
      credentialId: verified.credentialId,
      userId,
      publicKeyJwk: verified.publicKeyJwk,
      alg: verified.alg,
      signCount: verified.signCount,
      backupEligible: verified.backupEligible,
      createdAt: now().toISOString(),
      lastUsedAt: null,
    });
    if (!saved) throw new Error('This passkey is already registered.');
    return { registered: true };
  }

  async function startLogin() {
    const { challengeId, challenge } = await issueChallenge('login', null);
    return { challengeId, options: webauthn.authenticationOptions({ rpId: rp.id, challenge }) };
  }

  async function finishLogin({ challengeId, credential } = {}) {
    const c = await takeChallenge(challengeId, 'login', null);
    const id = credential && typeof credential.id === 'string' ? credential.id : '';
    const stored = id ? await repo.getPasskey(id) : null;
    if (!stored) throw new Error('This passkey is not recognised. Sign in with your password and add it again.');
    const { signCount } = webauthn.verifyAuthentication({
      credential,
      stored: { publicKeyJwk: stored.publicKeyJwk, alg: stored.alg, signCount: stored.signCount },
      expectedChallenge: c.challenge,
      expectedOrigins: rp.origins,
      rpId: rp.id,
    });
    await repo.updateSignCount(stored.credentialId, signCount, now().toISOString());
    return { userId: stored.userId };
  }

  async function listPasskeys(userId) {
    return (await repo.listPasskeys(userId)).map((p) => ({ credentialId: p.credentialId, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt || null }));
  }

  async function removePasskey(userId, credentialId) {
    return repo.deletePasskey(userId, String(credentialId || ''));
  }

  return { startRegistration, finishRegistration, startLogin, finishLogin, listPasskeys, removePasskey };
}

module.exports = { createPasskeyService };
