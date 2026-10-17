/**
 * Shield Underwriting — procedure catalogue.
 *
 * Maps channel procedure types onto MRS clinical-risk categories and channel
 * urgency labels onto the engine's urgency scale. Unknown procedures are
 * UNCLASSIFIED (carries a higher PD prior); unknown urgency is SEMI_URGENT.
 */

'use strict';

const CATEGORY_PATTERNS = [
  ['DENTISTRY', /dental|dentist|orthodont|implant|veneer|crown|root_canal|whitening/],
  ['OPHTHALMOLOGY', /lasik|ophthalm|cataract|eye|retina|lens/],
  ['FERTILITY', /fertility|ivf|iui|egg_freez|embryo/],
  ['AESTHETICS', /cosmetic|aesthetic|plastic|rhinoplasty|botox|filler|liposuction|augmentation|blepharoplasty/]
];

function procedureCategoryFor(procedureType) {
  const t = String(procedureType || '').toLowerCase().trim();
  if (!t) return 'UNCLASSIFIED';
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(t)) return category;
  }
  return 'UNCLASSIFIED';
}

const URGENCY_MAP = {
  ELECTIVE: 'ELECTIVE',
  PLANNED: 'ELECTIVE',
  SEMI_URGENT: 'SEMI_URGENT',
  URGENT: 'URGENT',
  EMERGENCY: 'URGENT'
};

function normaliseUrgency(label) {
  return URGENCY_MAP[String(label || '').toUpperCase().trim()] || 'SEMI_URGENT';
}

module.exports = { procedureCategoryFor, normaliseUrgency };
