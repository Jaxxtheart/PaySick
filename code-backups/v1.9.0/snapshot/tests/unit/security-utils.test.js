/**
 * Unit Tests — Frontend Security Utilities (js/security-utils.js)
 * Uses Node.js built-in test runner (node:test + node:assert).
 * No external dependencies required.
 *
 * Run: node --test tests/unit/security-utils.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const PaySickSecurity = require('../../js/security-utils');

// sanitize — XSS prevention
describe('PaySickSecurity.sanitize', () => {
  test('escapes angle brackets', () => {
    const result = PaySickSecurity.sanitize('<b>bold</b>');
    assert.ok(!result.includes('<b>'), `Should not contain '<b>' but got: ${result}`);
  });

  test('escapes double quotes', () => {
    assert.ok(PaySickSecurity.sanitize('"quoted"').includes('&quot;'));
  });

  test('escapes single quotes', () => {
    assert.ok(PaySickSecurity.sanitize("it's").includes('&#x27;'));
  });

  test('escapes ampersands', () => {
    assert.ok(PaySickSecurity.sanitize('a & b').includes('&amp;'));
  });

  test('returns empty string for null', () => {
    assert.equal(PaySickSecurity.sanitize(null), '');
  });

  test('returns empty string for undefined', () => {
    assert.equal(PaySickSecurity.sanitize(undefined), '');
  });

  test('coerces numbers to string', () => {
    assert.equal(PaySickSecurity.sanitize(42), '42');
  });

  test('passes through clean strings unchanged', () => {
    assert.equal(PaySickSecurity.sanitize('Hello World'), 'Hello World');
  });
});

// validateSAID
describe('PaySickSecurity.validateSAID', () => {
  test('accepts a valid 13-digit SA ID', () => {
    assert.equal(PaySickSecurity.validateSAID('9001015009087'), true);
  });

  test('rejects a 12-digit ID', () => {
    assert.equal(PaySickSecurity.validateSAID('900101500908'), false);
  });

  test('rejects a 14-digit ID', () => {
    assert.equal(PaySickSecurity.validateSAID('90010150090870'), false);
  });

  test('rejects an ID with letters', () => {
    assert.equal(PaySickSecurity.validateSAID('9001A15009087'), false);
  });

  test('rejects null', () => {
    assert.equal(PaySickSecurity.validateSAID(null), false);
  });

  test('rejects empty string', () => {
    assert.equal(PaySickSecurity.validateSAID(''), false);
  });
});

// validateEmail
describe('PaySickSecurity.validateEmail', () => {
  test('accepts a standard email', () => {
    assert.equal(PaySickSecurity.validateEmail('user@example.co.za'), true);
  });

  test('accepts email with subdomains', () => {
    assert.equal(PaySickSecurity.validateEmail('user@mail.paysick.co.za'), true);
  });

  test('rejects email without @', () => {
    assert.equal(PaySickSecurity.validateEmail('notanemail.com'), false);
  });

  test('rejects email without domain', () => {
    assert.equal(PaySickSecurity.validateEmail('user@'), false);
  });

  test('rejects empty string', () => {
    assert.equal(PaySickSecurity.validateEmail(''), false);
  });

  test('rejects null', () => {
    assert.equal(PaySickSecurity.validateEmail(null), false);
  });
});

// validatePhone
describe('PaySickSecurity.validatePhone', () => {
  test('accepts 10-digit SA mobile number', () => {
    assert.equal(PaySickSecurity.validatePhone('0821234567'), true);
  });

  test('accepts +27 format', () => {
    assert.equal(PaySickSecurity.validatePhone('+27821234567'), true);
  });

  test('accepts number with spaces', () => {
    assert.equal(PaySickSecurity.validatePhone('082 123 4567'), true);
  });

  test('rejects too short number', () => {
    assert.equal(PaySickSecurity.validatePhone('082123'), false);
  });

  test('rejects empty string', () => {
    assert.equal(PaySickSecurity.validatePhone(''), false);
  });

  test('rejects null', () => {
    assert.equal(PaySickSecurity.validatePhone(null), false);
  });
});

// mask
describe('PaySickSecurity.mask', () => {
  test('masks all but the last 4 characters', () => {
    assert.equal(PaySickSecurity.mask('1234567890', 4), '******7890');
  });

  test('defaults to showing last 4 characters', () => {
    assert.equal(PaySickSecurity.mask('1234567890').slice(-4), '7890');
  });

  test('masks a short string fully when shorter than visibleChars', () => {
    assert.equal(PaySickSecurity.mask('123', 4), '***');
  });

  test('returns empty string for null', () => {
    assert.equal(PaySickSecurity.mask(null), '');
  });

  test('returns empty string for empty input', () => {
    assert.equal(PaySickSecurity.mask(''), '');
  });
});

// formatCurrency
describe('PaySickSecurity.formatCurrency', () => {
  test('formats a number as ZAR currency', () => {
    const result = PaySickSecurity.formatCurrency(850);
    assert.ok(result.includes('850'), `Expected '850' in '${result}'`);
  });

  test('returns R0.00 for NaN input', () => {
    assert.equal(PaySickSecurity.formatCurrency('not-a-number'), 'R0.00');
  });

  test('handles zero', () => {
    assert.ok(PaySickSecurity.formatCurrency(0).includes('0'));
  });
});

// sanitizeURL
describe('PaySickSecurity.sanitizeURL', () => {
  test('allows https URLs', () => {
    const result = PaySickSecurity.sanitizeURL('https://paysick.co.za');
    assert.ok(result && result.startsWith('https://'));
  });

  test('allows relative paths starting with /', () => {
    assert.equal(PaySickSecurity.sanitizeURL('/dashboard.html'), '/dashboard.html');
  });

  test('blocks javascript: protocol', () => {
    assert.equal(PaySickSecurity.sanitizeURL('javascript:alert(1)'), null);
  });

  test('blocks data: protocol', () => {
    assert.equal(PaySickSecurity.sanitizeURL('data:text/html,<h1>test</h1>'), null);
  });

  test('returns null for null input', () => {
    assert.equal(PaySickSecurity.sanitizeURL(null), null);
  });

  test('returns null for empty string', () => {
    assert.equal(PaySickSecurity.sanitizeURL(''), null);
  });
});
