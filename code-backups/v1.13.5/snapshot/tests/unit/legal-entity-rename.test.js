'use strict';

/**
 * Unit Tests — Legal entity rename: PaySick (Pty) Ltd -> Tech and Artery (Pty) Ltd
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Scope: every live file that names the registered company, in either
 * form found in the codebase ("PaySick (Pty) Ltd" and "PaySick South
 * Africa (Pty) Ltd"). The brand/product name "PaySick" used on its own
 * (nav logo, "your PaySick account", paysick.co.za email addresses, the
 * trademark "PaySick" itself, etc.) is intentionally NOT touched — only
 * the registered-company-suffix string changes. Frozen
 * code-backups/vX.Y.Z snapshots are never edited.
 *
 * Run: node --test tests/unit/legal-entity-rename.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const read = (file) => fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');

const OLD_ENTITY_PATTERN = /PaySick(\s+South Africa)?\s*\(Pty\)\s*Ltd/;
const NEW_ENTITY = 'Tech and Artery (Pty) Ltd';

const FILES_WITH_ENTITY_REFERENCES = [
  'terms-of-service.html',
  'privacy-policy.html',
  'licenses.html',
  'provider-billing-agreement.html',
  'tariff-disclosure.html',
  'backend/src/services/underwriting.service.js',
  'backend/src/services/email.service.js',
];

describe('No live file still references the old legal entity name', () => {
  for (const file of FILES_WITH_ENTITY_REFERENCES) {
    test(`${file} no longer contains "PaySick (Pty) Ltd" or "PaySick South Africa (Pty) Ltd"`, () => {
      const content = read(file);
      assert.equal(
        OLD_ENTITY_PATTERN.test(content),
        false,
        `${file} still references the old legal entity name`
      );
    });
  }
});

describe('The new legal entity name is present wherever it used to be referenced', () => {
  for (const file of FILES_WITH_ENTITY_REFERENCES) {
    test(`${file} contains "${NEW_ENTITY}"`, () => {
      const content = read(file);
      assert.ok(content.includes(NEW_ENTITY), `${file} must reference ${NEW_ENTITY}`);
    });
  }
});

describe('The PaySick brand/product name itself is left untouched', () => {
  test('terms-of-service.html still refers to the PaySick platform/brand by name', () => {
    const content = read('terms-of-service.html');
    assert.ok(content.includes('PaySick platform'), 'the product name "PaySick" must not be scrubbed entirely');
    assert.ok(content.includes('legal@paysick.co.za'), 'paysick.co.za email addresses must be unaffected');
  });

  test('index.html hero is unaffected (no legal entity string there)', () => {
    const content = read('index.html');
    assert.equal(OLD_ENTITY_PATTERN.test(content), false);
    assert.ok(content.includes('PaySick'), 'the PaySick brand name must remain on the homepage');
  });
});
