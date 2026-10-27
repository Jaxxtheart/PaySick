/**
 * Kehr passkeys: browser side (v1.22.0).
 *
 * KehrPasskey.isSupported()  true when this browser can use passkeys
 * KehrPasskey.register()     adds a passkey to the signed-in account
 * KehrPasskey.signIn()       signs in with a passkey; resolves to the same
 *                            body as POST /api/users/login
 *
 * The server sends options with base64url fields; the WebAuthn API wants
 * ArrayBuffers, and its responses go back as base64url.
 */

(function () {
  'use strict';

  function apiBase() {
    return (typeof PaySickAPI !== 'undefined' && PaySickAPI.baseURL) ? PaySickAPI.baseURL : '/api';
  }

  function toBuffer(b64u) {
    const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  function toB64u(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function post(path, body, token) {
    const res = await fetch(apiBase() + path, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: JSON.stringify(body || {})
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* non-JSON error page */ }
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  function isSupported() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  }

  async function register() {
    const token = localStorage.getItem('paysick_auth_token');
    if (!token) throw new Error('Sign in first.');
    const { challengeId, options } = await post('/auth/passkeys/register/options', {}, token);
    const publicKey = Object.assign({}, options, {
      challenge: toBuffer(options.challenge),
      user: Object.assign({}, options.user, { id: toBuffer(options.user.id) }),
      excludeCredentials: (options.excludeCredentials || []).map((c) => ({ type: c.type, id: toBuffer(c.id) }))
    });
    const cred = await navigator.credentials.create({ publicKey });
    return post('/auth/passkeys/register/verify', {
      challengeId,
      credential: {
        id: cred.id,
        rawId: toB64u(cred.rawId),
        type: cred.type,
        response: {
          clientDataJSON: toB64u(cred.response.clientDataJSON),
          attestationObject: toB64u(cred.response.attestationObject)
        }
      }
    }, token);
  }

  async function signIn() {
    const { challengeId, options } = await post('/auth/passkeys/login/options', {});
    const publicKey = Object.assign({}, options, {
      challenge: toBuffer(options.challenge),
      allowCredentials: (options.allowCredentials || []).map((c) => ({ type: c.type, id: toBuffer(c.id) }))
    });
    const cred = await navigator.credentials.get({ publicKey });
    return post('/auth/passkeys/login/verify', {
      challengeId,
      credential: {
        id: cred.id,
        rawId: toB64u(cred.rawId),
        type: cred.type,
        response: {
          clientDataJSON: toB64u(cred.response.clientDataJSON),
          authenticatorData: toB64u(cred.response.authenticatorData),
          signature: toB64u(cred.response.signature),
          userHandle: cred.response.userHandle ? toB64u(cred.response.userHandle) : null
        }
      }
    });
  }

  window.KehrPasskey = { isSupported, register, signIn };
})();
