# Release Notes — v1.14.0

**Release Date**: 2026-09-21
**Version Type**: MINOR — new capability (Care Agent procedure matching)

## Summary

Replaces the Care Agent's procedure-recognition fallback with a genuine,
local, lightweight embedding-similarity matcher, per explicit user
direction after being shown that the previous engine was pure
exact-substring dictionary lookup with a hardcoded `'high'`/`'low'` label
— not anything probabilistic, and considerably less capable than even a
2013-era word2vec model.

This does **not** wire in a live LLM or embeddings API call. Two hard
constraints ruled that out for this change: Anthropic (the only API key
already present in this codebase, `ANTHROPIC_API_KEY`) has no native
embeddings endpoint of its own, and no dedicated embeddings API key (e.g.
Voyage AI, Anthropic's recommended embeddings partner) exists in
`backend/.env.example` today — adding one would mean asking the user to
supply a brand-new external credential for this alone. Separately, this
development sandbox cannot install a new npm package or download a
pretrained embedding model file to compute real learned embeddings
locally either. Given that, the path taken here is honest rather than
maximal: a fully local, dependency-free, testable technique that is a
genuine step up from substring matching, not a simulation of one.

**What was built**: every procedure category's label and keywords are
turned into a character-trigram count vector once at module load
(`CATEGORY_EMBEDDINGS` — the "precompute embeddings for the category
labels" step). An incoming patient message is scored by sliding a
2-to-4-word window across it, turning each window into the same kind of
vector, and comparing by cosine similarity (`findBestCategoryMatch`)
rather than substring containment. This is a real vector-space technique
— bag-of-character-n-grams, the pre-neural ancestor of word2vec/fastText
— so it generalizes to phrasing the old dictionary could never recognize
("nose procedure" → Cosmetic / Aesthetic Procedure, "eye laser surgery" →
LASIK, "rhinoplastey" [typo] → Cosmetic), and it produces an actual
numeric similarity score (0–1) instead of a hardcoded boolean label.
Exact substring matching is tried first and, when it hits, is still
authoritative (score exactly 1) — this is what lets a tapped procedure
chip always round-trip perfectly, unchanged from before.

This is honestly a weaker, purely lexical form of "embedding similarity"
than a trained model would give: it has no notion of word *meaning*, only
shared character sequences, so it cannot generalize a true synonym with
no overlapping substring (e.g. "nose reshaping" scores far too low to
match Cosmetic, since it shares almost no trigrams with "rhinoplasty" or
"nose job"). It is disclosed as such in the module's own header comment
rather than oversold. It is fully swappable: if a real embeddings API key
is ever added to this codebase, only `CATEGORY_EMBEDDINGS` /
`findBestCategoryMatch` need to change — no caller does.

## New Features

- `backend/src/services/care-agent-nlp.service.js` exports
  `buildTrigramVector`, `cosineSimilarity`, `findBestCategoryMatch`, and
  `CATEGORY_EMBEDDINGS` — the new embedding-similarity matching engine.
- `extractCareRequest(text)`'s result now includes
  `procedureTypeSimilarity` (a number in `[0, 1]`): `1` for an exact
  keyword match, `0` for no match at all, and a genuine cosine-similarity
  score in between for a fuzzy match. Previously `confidence` was the only
  signal, and it was a hardcoded string.
- `extractProcedureType`'s fallback (used when no exact phrase is present)
  now tries a fuzzy, similarity-based category match before giving up —
  scoring at or above 0.5 is surfaced as `'high'` confidence (same band as
  an exact match), between 0.2 and 0.5 is surfaced as a genuine guess at
  `'low'` confidence (still offered, never hidden, per the "never hide
  uncertainty" principle — the patient still confirms it on the summary
  card), and below 0.2 yields no guess at all (this module still never
  invents a procedure the text gave no real signal for).

## Bug Fixes

None — this is new matching capability, not a fix to prior behaviour. All
prior exact-match behaviour (including a tapped procedure chip always
round-tripping through extraction) is unchanged and still passes its
original tests.

## Removed / Deprecated

None.

## Breaking Changes

None. `extractCareRequest`'s return shape only gained a field
(`procedureTypeSimilarity`); no existing field changed type or meaning.
`confidence.procedureTypeGuess` remains `'high'`/`'low'`, exactly as
before — callers that only branched on that string see no behaviour
change on any text they previously recognized.

## Migration Notes

None. No schema, route, or API contract change.

## Calibration note (why the specific thresholds)

`SIMILARITY_MATCH_THRESHOLD` (0.2) and `SIMILARITY_HIGH_THRESHOLD` (0.5)
were chosen by scoring a spread of real near-miss/typo phrases against a
spread of clearly unrelated free text (a superset of which is captured in
`tests/unit/care-agent-embedding-similarity.test.js`). Unrelated text
("a growth removed from my arm", "help me pay", a stray bill mention)
scored at most ~0.15 in testing; every genuine near-miss or typo variant
tried scored at least ~0.22 — a comfortable margin either side of 0.2.
Matching is done over sliding 2-to-4-word windows of the message (rather
than embedding the whole message at once) specifically because whole-
message embedding was found, during calibration, to dilute genuine
matches in a longer message (extra unrelated words add trigrams that
inflate the vector's norm without adding to the match) — windowing keeps
the comparison apples-to-apples, short phrase vs. short phrase, the same
shape of comparison the old exact-substring path already used. A lone
single word is only used as a whole-message window when the entire
message is one word (e.g. a bare "Aesthetic" reply); inside a longer
message a single generic word like "surgery" or "procedure" (both appear
in more than one category's own label) was found to produce false-
positive matches on its own, so at least two words of context are
required there.

## Environmental note (test execution)

Same sandbox constraint as every release since v1.9.0: no npm registry
access, no `node_modules`. `node --test tests/unit/*.test.js`: 858 tests,
856 pass, 2 fail — the same two pre-existing, unrelated failures
(`email-service.test.js` needs `nodemailer`; `marketplace-lender-gate.test.js`
needs `pg`). The edited file (`care-agent-nlp.service.js`) was syntax-
checked with `node --check`. New test file:
`tests/unit/care-agent-embedding-similarity.test.js` (14 assertions),
written before the implementation and confirmed to fail (module exports
did not yet exist) before any implementation code was written, per
CLAUDE.md's test-first workflow.
