'use strict';

/**
 * Unit Tests — No em dashes anywhere on the live site
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Scope: every page that makes up the deployed site (all root *.html
 * files) plus the site's own client-side JS (api-client.js,
 * js/demo-data.js, js/security-utils.js). Deliberately OUT of scope:
 * internal project documentation (README.md, CLAUDE.md, PROGRESS.md,
 * OUTREACH_AGENT_README.md), backend source comments, and the frozen
 * code-backups/vX.Y.Z snapshots (read-only archives per
 * code-backups/VERSIONING_GUIDE.md — never edited after being committed).
 *
 * Run: node --test tests/unit/no-em-dashes.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const EM_DASH = '—';

const SITE_HTML_FILES = fs
  .readdirSync(REPO_ROOT)
  .filter((f) => f.endsWith('.html'))
  .sort();

const SITE_JS_FILES = ['api-client.js', 'js/demo-data.js', 'js/security-utils.js'].filter((f) =>
  fs.existsSync(path.join(REPO_ROOT, f))
);

describe('No em dashes (—) in any live site HTML page', () => {
  assert.ok(SITE_HTML_FILES.length > 30, 'sanity check: expected the full set of root *.html pages');

  for (const file of SITE_HTML_FILES) {
    test(`${file} contains no em dash`, () => {
      const content = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
      const count = (content.match(new RegExp(EM_DASH, 'g')) || []).length;
      assert.equal(count, 0, `${file} contains ${count} em dash character(s)`);
    });
  }
});

describe('No em dashes (—) in the site\'s own client-side JS', () => {
  for (const file of SITE_JS_FILES) {
    test(`${file} contains no em dash`, () => {
      const content = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
      const count = (content.match(new RegExp(EM_DASH, 'g')) || []).length;
      assert.equal(count, 0, `${file} contains ${count} em dash character(s)`);
    });
  }
});
