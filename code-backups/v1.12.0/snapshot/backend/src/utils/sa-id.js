'use strict';

/**
 * SOUTH AFRICAN ID NUMBER VALIDATION
 *
 * A South African ID number is 13 digits laid out as:
 *
 *   YYMMDD  SSSS  C  A  Z
 *   ------  ----  -  -  -
 *   0-5     6-9  10 11 12
 *
 *   YYMMDD  date of birth
 *   SSSS    sequence within that birth date (0000-4999 female, 5000-9999 male)
 *   C       citizenship — 0 = SA citizen, 1 = permanent resident
 *   A       historically a race digit, unused since 1994 — not validated
 *   Z       Luhn check digit over the preceding 12
 *
 * register.html has checked all of this in the browser for some time, but the
 * server only asserted /^\d{13}$/, so a caller posting straight at the API could
 * register with a structurally impossible ID. This module is the server-side
 * enforcement point; it takes no dependencies so it stays unit-testable without
 * a DB or an HTTP server.
 */

const CITIZENSHIP_SA_CITIZEN = '0';
const CITIZENSHIP_PERMANENT_RESIDENT = '1';

/**
 * Luhn check over the first 12 digits, returning the expected 13th.
 *
 * @param {string} first12
 * @returns {number}
 */
function luhnCheckDigit(first12) {
  const digits = first12.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    if (i % 2 === 0) {
      sum += digits[i];
    } else {
      let doubled = digits[i] * 2;
      if (doubled > 9) doubled -= 9;
      sum += doubled;
    }
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Strips whitespace and confirms the value is 13 digits.
 * Returns the normalised digits, or null if the shape is wrong.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function normalise(value) {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\s/g, '');
  return /^\d{13}$/.test(digits) ? digits : null;
}

/**
 * Resolves a two-digit year to a full year.
 *
 * The pivot is derived from the current year rather than hardcoded: a fixed
 * pivot silently rots, and the one this was ported with (22) would already
 * misread a 2024-born applicant as born in 1924. A two-digit year is read as
 * this century unless that would place the birth in a year that has not
 * happened yet, in which case it belongs to the previous century.
 *
 * @param {number} yy
 * @param {Date} [now]
 * @returns {number}
 */
function resolveBirthYear(yy, now = new Date()) {
  const thisCentury = Math.floor(now.getFullYear() / 100) * 100 + yy;
  return thisCentury > now.getFullYear() ? thisCentury - 100 : thisCentury;
}

/**
 * Decodes the YYMMDD prefix into a real calendar date.
 * Returns null when the prefix is not a real date (month 13, 31 February, ...).
 *
 * @param {string} idNumber normalised 13-digit ID
 * @returns {Date|null}
 */
function decodeDateOfBirth(idNumber) {
  const yy = Number(idNumber.slice(0, 2));
  const mm = Number(idNumber.slice(2, 4));
  const dd = Number(idNumber.slice(4, 6));

  const year = resolveBirthYear(yy);
  const date = new Date(year, mm - 1, dd);

  // new Date(1990, 12, 31) silently rolls into the next year, so round-trip the
  // components to reject anything that did not survive intact.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== mm - 1 ||
    date.getDate() !== dd
  ) {
    return null;
  }
  return date;
}

/**
 * Returns the date of birth encoded in an ID number, or null if the ID is not
 * structurally valid.
 *
 * @param {unknown} value
 * @returns {Date|null}
 */
function extractDateOfBirth(value) {
  const idNumber = normalise(value);
  if (!idNumber) return null;
  return decodeDateOfBirth(idNumber);
}

/**
 * Validates a South African ID number.
 *
 * @param {unknown} value
 * @param {{dateOfBirth?: string|Date}} [options]
 *   dateOfBirth — a separately declared date of birth to cross-check against the
 *   one embedded in the ID. Absent or unparseable values are ignored, so callers
 *   can pass a raw form field without pre-checking it.
 * @returns {{valid: boolean, error: string|null, dateOfBirth?: Date}}
 */
function validateSAID(value, options = {}) {
  const idNumber = normalise(value);
  if (!idNumber) {
    return { valid: false, error: 'SA ID number must be exactly 13 digits.' };
  }

  const dob = decodeDateOfBirth(idNumber);
  if (!dob) {
    return { valid: false, error: 'SA ID number contains an invalid date of birth.' };
  }

  if (dob.getTime() > Date.now()) {
    return { valid: false, error: 'SA ID number contains a date of birth in the future.' };
  }

  const citizenship = idNumber[10];
  if (
    citizenship !== CITIZENSHIP_SA_CITIZEN &&
    citizenship !== CITIZENSHIP_PERMANENT_RESIDENT
  ) {
    return {
      valid: false,
      error: 'SA ID number has an invalid citizenship digit (must be 0 or 1).',
    };
  }

  if (luhnCheckDigit(idNumber.slice(0, 12)) !== Number(idNumber[12])) {
    return { valid: false, error: 'SA ID number failed checksum verification.' };
  }

  const declared = options.dateOfBirth;
  if (declared) {
    const declaredDate = declared instanceof Date ? declared : new Date(declared);
    if (!Number.isNaN(declaredDate.getTime())) {
      const sameDay =
        declaredDate.getUTCFullYear() === dob.getFullYear() &&
        declaredDate.getUTCMonth() === dob.getMonth() &&
        declaredDate.getUTCDate() === dob.getDate();
      if (!sameDay) {
        return {
          valid: false,
          error: 'Date of birth does not match the date encoded in the SA ID number.',
        };
      }
    }
  }

  return { valid: true, error: null, dateOfBirth: dob };
}

module.exports = { validateSAID, extractDateOfBirth, luhnCheckDigit, resolveBirthYear };
