'use strict';

/**
 * Unit Tests — Tech and Artery (Pty) Ltd's real registration number
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Follow-up to v1.13.2 (legal entity rename), which left the disclosure
 * text's placeholder registration number ("2023/123456/07" — a stale
 * value inherited from before the rename, never real) untouched because
 * no real number was known yet. It has now been supplied: K2015/346764/07.
 *
 * Run: node --test tests/unit/entity-registration-number.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const read = (file) => fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');

const OLD_NUMBER = '2023/123456/07';
const NEW_NUMBER = 'K2015/346764/07';

describe('underwriting.service.js disclosure text uses the real registration number', () => {
  const content = read('backend/src/services/underwriting.service.js');

  test('no longer contains the placeholder registration number', () => {
    assert.ok(!content.includes(OLD_NUMBER), 'the stale placeholder registration number must be gone');
  });

  test('contains Tech and Artery (Pty) Ltd\'s real registration number', () => {
    assert.ok(content.includes(NEW_NUMBER), 'the disclosure text must state the real registration number');
  });

  test('the registration number is still paired with the entity name on the same line', () => {
    assert.ok(
      content.includes(`Tech and Artery (Pty) Ltd | Registration No. ${NEW_NUMBER}`),
      'entity name and registration number must appear together, as before'
    );
  });
});
