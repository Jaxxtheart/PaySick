'use strict';

/**
 * Unit Tests — README accuracy
 *
 * Written BEFORE the fix (test-first, per CLAUDE.md).
 *
 * Background:
 *   README.md's "For Patients" feature list claims "Instant Approval: Get
 *   approved for payment plans up to R850" and "Quick Application: Complete
 *   in under 60 seconds". Neither matches the live product:
 *     - backend/src/routes/marketplace.js (the endpoint marketplace-apply.html
 *       actually posts to) accepts loan amounts between R1,000 and R500,000 —
 *       nowhere near a R850 ceiling.
 *     - Every live application runs a real risk assessment (healthcare-risk /
 *       underwriting services) that can resolve to approve, decline, or
 *       manual review — not a guaranteed instant decision.
 *   This pins README.md to the real, reachable limits and removes the
 *   unconditional speed/instant-approval claims so the repo's own docs don't
 *   overpromise what the shipped code does.
 *
 * Run: node --test tests/unit/readme-accuracy.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');

function read(file) {
  return fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
}

describe('README.md does not overstate approval speed or amount limits', () => {
  test('does not claim a flat R850 approval ceiling', () => {
    const readme = read('README.md');
    assert.ok(
      !/R850/.test(readme),
      'README still claims a R850 approval ceiling, which does not match marketplace.js (R1,000-R500,000)'
    );
  });

  test('does not claim an unconditional 60-second completion time', () => {
    const readme = read('README.md');
    assert.ok(
      !/60 seconds/i.test(readme),
      'README still claims completion "in under 60 seconds", which does not match the real risk-assessment flow'
    );
  });

  test('does not claim unconditional "instant approval"', () => {
    const readme = read('README.md');
    assert.ok(
      !/instant approval/i.test(readme),
      'README still claims "Instant Approval" — live applications can resolve to approve, decline, or manual review'
    );
  });

  test('states the real reachable amount range (R1,000 - R500,000)', () => {
    const readme = read('README.md');
    assert.ok(
      readme.includes('R1,000') && readme.includes('R500,000'),
      'README should state the amount range that backend/src/routes/marketplace.js actually enforces'
    );
  });
});
