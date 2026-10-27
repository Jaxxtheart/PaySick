'use strict';

/**
 * CARE AGENT — ACCOUNT SNAPSHOT
 *
 * One read of everything the Care Agent's decision rules
 * (care-agent-actions.service.js) need for one patient, in one shape:
 *
 *   plans         payment_plans            (the plan the patient repays PaySick)
 *   instalments   payments                 (unpaid only)
 *   collections   collections              (open cases)
 *   promises      promise_to_pay           (pending)
 *   applications  loan_applications + lender_offers (live offers only)
 *   funderPlans   marketplace_loans + next loan_repayments row (display only)
 *   openRequests  care_agent_manage_requests (with the team)
 *
 * Money becomes integer cents and dates become YYYY-MM-DD here, at the
 * boundary, so the rules never handle a DECIMAL string or a Date. Every
 * query is scoped to the patient's own user_id. Read-only.
 *
 * Each section is read on its own: a table that doesn't exist yet (the
 * marketplace tables are optional, see routes/marketplace.js) leaves that
 * section empty and is listed in `unavailable`, rather than failing the
 * whole snapshot.
 */

const { toCents } = require('../utils/money');

// Request types written before the action registry existed.
const LEGACY_REQUEST_TYPES = { PAYMENT_DATE_CHANGE: 'REQUEST_PAYMENT_DATE_CHANGE' };

function cents(value) {
  return value === null || value === undefined ? null : toCents(value);
}

/** A pg DATE arrives as a Date at local midnight; read its local calendar day. */
function toIsoDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${mm}-${dd}`;
  }
  return String(value).slice(0, 10);
}

function todayIso() {
  return toIsoDate(new Date());
}

const SECTIONS = {
  plans: {
    sql: `SELECT plan_id, status, total_amount, monthly_amount, number_of_payments, payments_made, outstanding_balance
          FROM payment_plans
          WHERE user_id = $1
          ORDER BY created_at DESC`,
    map: (rows) => rows.map((r) => ({
      planId: r.plan_id,
      status: r.status,
      totalAmountCents: cents(r.total_amount),
      monthlyAmountCents: cents(r.monthly_amount),
      numberOfPayments: Number(r.number_of_payments),
      paymentsMade: Number(r.payments_made) || 0,
      outstandingBalanceCents: cents(r.outstanding_balance) || 0,
    })),
  },

  instalments: {
    sql: `SELECT payment_id, plan_id, payment_number, amount, due_date, status
          FROM payments
          WHERE user_id = $1 AND status IN ('scheduled', 'overdue', 'failed', 'processing')
          ORDER BY due_date ASC`,
    map: (rows) => rows.map((r) => ({
      paymentId: r.payment_id,
      planId: r.plan_id,
      paymentNumber: Number(r.payment_number),
      amountCents: cents(r.amount),
      dueDate: toIsoDate(r.due_date),
      status: r.status,
    })),
  },

  collections: {
    sql: `SELECT collection_id, payment_id, amount_outstanding, days_overdue, status
          FROM collections
          WHERE user_id = $1 AND status IN ('open', 'in_progress')`,
    map: (rows) => rows.map((r) => ({
      collectionId: r.collection_id,
      paymentId: r.payment_id,
      amountOutstandingCents: cents(r.amount_outstanding),
      daysOverdue: Number(r.days_overdue) || 0,
      status: r.status,
    })),
  },

  promises: {
    sql: `SELECT pt.promise_id, pt.collection_id, pt.promised_amount_cents, pt.promised_date, pt.status
          FROM promise_to_pay pt
          JOIN collections c ON c.collection_id = pt.collection_id
          WHERE c.user_id = $1 AND pt.status = 'pending'`,
    map: (rows) => rows.map((r) => ({
      promiseId: r.promise_id,
      collectionId: r.collection_id,
      promisedAmountCents: Number(r.promised_amount_cents),
      promisedDate: toIsoDate(r.promised_date),
      status: r.status,
    })),
  },

  applications: {
    sql: `SELECT la.application_id, la.status, lo.offer_id, l.name AS lender_name,
                 lo.monthly_payment, lo.total_repayable, lo.term, lo.interest_rate
          FROM loan_applications la
          LEFT JOIN lender_offers lo
            ON lo.application_id = la.application_id AND lo.status = 'PENDING' AND lo.expires_at > NOW()
          LEFT JOIN lenders l ON l.lender_id = lo.lender_id
          WHERE la.user_id = $1 AND la.status IN ('SUBMITTED', 'UNDERWRITING', 'OFFERS_RECEIVED')
          ORDER BY la.created_at DESC`,
    map: (rows) => {
      const byId = new Map();
      for (const r of rows) {
        if (!byId.has(r.application_id)) {
          byId.set(r.application_id, { applicationId: r.application_id, status: r.status, pendingOffers: [] });
        }
        if (r.offer_id) {
          byId.get(r.application_id).pendingOffers.push({
            offerId: r.offer_id,
            lenderName: r.lender_name,
            monthlyPaymentCents: cents(r.monthly_payment),
            totalRepayableCents: cents(r.total_repayable),
            termMonths: Number(r.term),
            interestRate: Number(r.interest_rate),
          });
        }
      }
      return [...byId.values()];
    },
  },

  funderPlans: {
    sql: `SELECT ml.loan_id, l.name AS lender_name, ml.status,
                 nxt.scheduled_amount AS next_amount, nxt.scheduled_date AS next_date
          FROM marketplace_loans ml
          JOIN lenders l ON l.lender_id = ml.lender_id
          LEFT JOIN LATERAL (
            SELECT lr.scheduled_amount, lr.scheduled_date
            FROM loan_repayments lr
            WHERE lr.loan_id = ml.loan_id AND lr.status IN ('SCHEDULED', 'PENDING')
            ORDER BY lr.scheduled_date ASC
            LIMIT 1
          ) nxt ON true
          WHERE ml.user_id = $1 AND ml.status NOT IN ('PAID_OFF', 'WRITTEN_OFF')`,
    map: (rows) => rows.map((r) => ({
      loanId: r.loan_id,
      lenderName: r.lender_name,
      status: r.status,
      nextAmountCents: cents(r.next_amount),
      nextDate: toIsoDate(r.next_date),
    })),
  },

  openRequests: {
    sql: `SELECT r.request_id, r.request_type, r.status, r.created_at
          FROM care_agent_manage_requests r
          JOIN care_agent_sessions s ON s.session_id = r.session_id
          WHERE s.user_id = $1 AND r.status IN ('OPEN', 'IN_PROGRESS')
          ORDER BY r.created_at ASC`,
    map: (rows) => rows.map((r) => ({
      requestId: r.request_id,
      requestType: LEGACY_REQUEST_TYPES[r.request_type] || r.request_type,
      status: r.status,
      createdAt: r.created_at,
    })),
  },
};

/**
 * @param {{ query: function, userId: string, today?: string }} params
 * @returns {Promise<object>} the account snapshot
 */
async function loadAccountSnapshot({ query, userId, today }) {
  const snapshot = { today: today ? toIsoDate(today) : todayIso(), unavailable: [] };

  for (const [section, { sql, map }] of Object.entries(SECTIONS)) {
    try {
      const result = await query(sql, [userId]);
      snapshot[section] = map(result.rows || []);
    } catch (err) {
      snapshot[section] = [];
      snapshot.unavailable.push(section);
    }
  }

  return snapshot;
}

module.exports = {
  loadAccountSnapshot,
  toIsoDate,
};
