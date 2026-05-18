/**
 * Monetary arithmetic — cents-only integer math.
 *
 * All money stored and calculated in cents to avoid floating-point error.
 * Floats only appear at I/O boundaries: parsing rand input, formatting display.
 */

'use strict';

function toCents(rands) {
  return Math.round(Number(rands) * 100);
}

function toRands(cents) {
  return Number(cents) / 100;
}

function formatRands(cents) {
  return `R${(Number(cents) / 100).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function calculateMdr(facilitationAmountCents, mdrPercent = 5) {
  return Math.round(Number(facilitationAmountCents) * (Number(mdrPercent) / 100));
}

function affordabilityRatio(instalmentCents, incomeCents) {
  if (!incomeCents || incomeCents <= 0) return Infinity;
  return Number(instalmentCents) / Number(incomeCents);
}

module.exports = {
  toCents,
  toRands,
  formatRands,
  calculateMdr,
  affordabilityRatio
};
