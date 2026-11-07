# Architecture — PaySick v1.14.0

**Version**: 1.14.0
**Date**: 2026-09-21

---

## Changes from v1.13.6

One file changed (`care-agent-nlp.service.js`). No new route, table,
migration, env var, or npm dependency.

```
BEFORE (exact-substring only):
  extractProcedureType(text)
    for each known phrase (longest first):
      if text.includes(phrase): return { guess, confidence: 'high' }
    return { guess: null, confidence: 'low' }
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                          Only ever 'high' or 'low' --
                                          a hardcoded boolean label, not
                                          a real confidence signal.

AFTER (exact-substring, then local embedding similarity):
  CATEGORY_EMBEDDINGS = precomputed once, at module load:
    for each PROCEDURE_CATEGORY:
      vector = buildTrigramVector(label + keywords)
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                          "precompute embeddings for the
                                          category labels" -- character-
                                          trigram count vectors, the
                                          pre-neural ancestor of
                                          word2vec/fastText.

  extractProcedureType(text)
    for each known phrase (longest first):
      if text.includes(phrase): return { guess, confidence: 'high', score: 1 }
                                          ^^ exact match still wins outright

    match = findBestCategoryMatch(text)
      candidatePhrases = slide a 2-4 word window across text
      for each candidate phrase:
        phraseVector = buildTrigramVector(phrase)
        for each CATEGORY_EMBEDDINGS entry:
          score = cosineSimilarity(phraseVector, entry.vector)
      best = highest-scoring (phrase, category) pair
      return best if best.score >= SIMILARITY_MATCH_THRESHOLD (0.2), else null

    if match:
      confidence = match.score >= SIMILARITY_HIGH_THRESHOLD (0.5) ? 'high' : 'low'
      return { guess: match.id, confidence, score: match.score }
    else:
      return { guess: null, confidence: 'low', score: 0 }

  extractCareRequest(text)
    ...
    result.procedureTypeSimilarity = procedure.similarityScore  [NEW FIELD]
```

`PROCEDURE_TYPE_KEYWORDS` / `PROCEDURE_CATEGORIES` / the exact-match path
itself are all unchanged -- a tapped procedure chip still round-trips
through extraction at a perfect score, exactly as before. Every other
Care Agent file (`care-agent.service.js`, `routes/care-agent.js`,
`care-agent.html`) is untouched: `procedureTypeSimilarity` flows through
`mergeCareSummary`'s existing generic blank-filling loop and into the
audit log (`CONVERSATION_TURN`'s `extracted` payload) without any new
code, since neither reads or depends on that specific key.

## Test topology

```
tests/unit/
   └── care-agent-embedding-similarity.test.js   [NEW] -- 14 assertions,
                                                   written and confirmed
                                                   failing before any
                                                   implementation code
                                                   (test-first, CLAUDE.md).
                                                   Covers: trigram vector
                                                   math in isolation,
                                                   precomputed category
                                                   embeddings, fuzzy
                                                   near-miss matching,
                                                   typo tolerance, exact-
                                                   match precedence, the
                                                   chip-label round-trip
                                                   guarantee, and refusal
                                                   to guess on truly
                                                   unrelated text.

   └── care-agent-nlp.test.js                    [unchanged, still green]
   └── care-agent.test.js                        [unchanged, still green]
   └── care-agent-*.test.js (all others)          [unchanged, still green]
```

Runner: `node --test tests/unit/*.test.js` -- 858 tests, 856 pass, 2 fail
(both pre-existing, unrelated -- see RELEASE_NOTES.md's Environmental
note). Edited file syntax-checked with `node --check`.

---

## Why not a live LLM / embeddings API call (design decision)

Considered and explicitly not taken this release:

- **A real embeddings API** (e.g. Voyage AI): would need a new API key
  this codebase doesn't have (`backend/.env.example` only declares
  `ANTHROPIC_API_KEY`, used by the unrelated outreach-drafting feature;
  Anthropic itself has no native embeddings endpoint). Adding one means
  asking the user for a new external credential, which wasn't requested.
- **A live LLM call** (reusing the existing
  `outreach/claude.service.js` `fetch()`-only pattern): technically
  possible using the existing `ANTHROPIC_API_KEY`, but this sandbox has
  no outbound internet access to actually exercise or verify such a call,
  and it would add per-message latency/cost to a UI path that previously
  had none, for a task (matching against ~10 known categories) that
  doesn't need a general-purpose language model to solve reasonably well.
- **A downloaded pretrained embedding model** (e.g. a small local
  word2vec/fastText binary): this sandbox cannot download files from the
  general internet, so no model file could be fetched or verified here.

The character-trigram approach taken instead needs none of the above,
runs and is fully testable in this sandbox today, and stays swappable:
`CATEGORY_EMBEDDINGS` / `findBestCategoryMatch` are the only two things
that would need to change if a real embeddings API is added later --
every caller (`extractProcedureType`, `extractCareRequest`, and
everything downstream in `care-agent.service.js` / `routes/care-agent.js`
/ `care-agent.html`) is unaffected either way.

---

## Platform architecture (unchanged from v1.12.0)

See [v1.12.0/ARCHITECTURE.md](../v1.12.0/ARCHITECTURE.md) for the Care
Agent's full six-stage request path, data model, and the platform
architecture it in turn inherits.
