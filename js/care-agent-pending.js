/**
 * PaySick: Care Agent pending question
 *
 * Holds a question a signed-out visitor typed into the homepage "Ask
 * PaySick" bar, so it survives logging in (or registering and verifying an
 * email) and is sent as the Care Agent's first message afterwards. Kept in
 * localStorage for at most 24 hours and cleared the moment it is used.
 *
 * Every storage access is wrapped in try/catch: private browsing or blocked
 * site data must never break login or the Care Agent.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.PaySickCareAgentPending = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'paysick_care_agent_pending_question';
  const TTL_MS = 24 * 60 * 60 * 1000;
  const MAX_LEN = 500;

  function clear(storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch (_) {
      // Storage unavailable: nothing to clear.
    }
  }

  function save(storage, question, now) {
    const q = typeof question === 'string' ? question.trim().slice(0, MAX_LEN) : '';
    if (!q) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({ question: q, savedAt: now == null ? Date.now() : now }));
    } catch (_) {
      // Storage unavailable: the question simply isn't held.
    }
  }

  function peek(storage, now) {
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
    if (!raw) return null;
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch (_) {
      clear(storage);
      return null;
    }
    const current = now == null ? Date.now() : now;
    if (!entry || typeof entry.question !== 'string' || !entry.question.trim() ||
        typeof entry.savedAt !== 'number' || current - entry.savedAt > TTL_MS) {
      clear(storage);
      return null;
    }
    return entry.question;
  }

  function take(storage, now) {
    const q = peek(storage, now);
    if (q !== null) clear(storage);
    return q;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    TTL_MS: TTL_MS,
    save: save,
    peek: peek,
    take: take,
    clear: clear,
  };
});
