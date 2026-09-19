'use strict';

/**
 * GOOGLE PLACES SOURCING + ENRICHMENT (Stages 1-2)
 *
 * Draws business contact details only from public business listings and the
 * practice's own public website — never personal data (POPIA, §2.2). Uses the
 * platform's native `fetch` (Node >=18); no new npm dependency.
 *
 * Env: GOOGLE_PLACES_API_KEY
 */

const PLACES_TEXTSEARCH_URL =
  'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACES_DETAILS_URL =
  'https://maps.googleapis.com/maps/api/place/details/json';

function getKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not set');
  return key;
}

function resolveFetch(opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('global fetch is unavailable (Node >=18 required)');
  }
  return fetchImpl;
}

/**
 * Stage 1 — Text Search for practices of a vertical in a metro.
 * e.g. textSearch("aesthetic clinic", "Johannesburg")
 * @returns {Promise<Array>} normalised candidate leads (not yet deduped/inserted)
 */
async function textSearch(searchTerm, metro, opts = {}) {
  const fetchImpl = resolveFetch(opts);
  const query = `${searchTerm} ${metro}`;
  const url = `${PLACES_TEXTSEARCH_URL}?query=${encodeURIComponent(query)}&key=${getKey()}`;

  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Places textsearch HTTP ${res.status}`);
  const data = await res.json();

  if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places textsearch status ${data.status}: ${data.error_message || ''}`);
  }

  return (data.results || []).map((r) => ({
    place_id: r.place_id,
    practice_name: r.name,
    address: r.formatted_address,
    metro,
    rating: typeof r.rating === 'number' ? r.rating : null,
    ratings_count: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : null,
  }));
}

/**
 * Stage 2 — Place Details for website, phone, rating, ratings_count.
 * @returns {Promise<object>} enrichment fields
 */
async function placeDetails(placeId, opts = {}) {
  const fetchImpl = resolveFetch(opts);
  const fields = 'website,formatted_phone_number,international_phone_number,rating,user_ratings_total';
  const url = `${PLACES_DETAILS_URL}?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${getKey()}`;

  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Places details HTTP ${res.status}`);
  const data = await res.json();

  if (data.status && data.status !== 'OK') {
    throw new Error(`Places details status ${data.status}: ${data.error_message || ''}`);
  }

  const r = data.result || {};
  return {
    website: r.website || null,
    phone: r.formatted_phone_number || r.international_phone_number || null,
    rating: typeof r.rating === 'number' ? r.rating : null,
    ratings_count: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : null,
  };
}

/**
 * Derive a public business email from a practice's own website contact page.
 * Best-effort and public-only (§2.2). If none is publicly available, returns null
 * and the lead is routed to the linkedin/call channel instead.
 * @returns {Promise<string|null>}
 */
async function derivePublicEmail(website, opts = {}) {
  if (!website) return null;
  const fetchImpl = resolveFetch(opts);

  const candidates = [website];
  try {
    const base = new URL(website);
    candidates.push(new URL('/contact', base).href);
    candidates.push(new URL('/contact-us', base).href);
  } catch (_) {
    // website not a valid URL — skip contact-page derivation
  }

  const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
  for (const url of candidates) {
    try {
      const res = await fetchImpl(url, { redirect: 'follow' });
      if (!res.ok) continue;
      const html = await res.text();
      const match = html.match(EMAIL_RE);
      if (match) {
        const email = match[0].toLowerCase();
        // Skip obvious asset/placeholder addresses.
        if (!/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(email) && !email.startsWith('example@')) {
          return email;
        }
      }
    } catch (_) {
      // network/parse failure on a public page — try the next candidate
    }
  }
  return null;
}

module.exports = { textSearch, placeDetails, derivePublicEmail };
