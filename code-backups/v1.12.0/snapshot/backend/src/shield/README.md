# Shield Underwriting Module

`backend/src/shield/` is PaySick's single underwriting decision engine. It
replaces three parallel engines (the v1 `shield-gates.service`, the legacy
`patient-gate.service` path in the marketplace, and the `healthcare-risk`
score) with one versioned credit policy, one deterministic engine and an
immutable decision log.

```
const shield = require('./shield');
const now = new Date();
const input   = await shield.buildUnderwritingInput(application, { query, now });
const outcome = shield.underwrite(input, { now, allowMockSources: shield.mockSourcesAllowed() });
const record  = shield.buildDecisionRecord(input, { now }, outcome);
await shield.recordDecision(query, { record, outcome, channel: 'V1_API' });
```

## Three outcomes, kept separate

| | **Patient Affordability** | **Provider Risk Management** | **Medical Risk Score (PD)** |
|---|---|---|---|
| Question | Can this patient afford this instalment? | How much exposure may we take to this provider, and how is it paid out? | How likely is this patient to reach 90+ days past due within 12 months? |
| Nature | Regulatory pass/fail gate | Limits and controls | Probability (proprietary model) |
| Overridable? | **Never** — not by the PD, not by a reviewer | Policy declines are final; watch flags refer | PD bands refer/decline; EL vs revenue |
| Module | `affordability.js` | `provider-risk.js` | `medical-risk-score/` |
| Output section | `outcome.patientAffordability` | `outcome.providerRisk` | `outcome.medicalRiskScore` |

### What feeds Patient Affordability
- Verified income: ≥3 months gross and net, ≤90 days old, from open banking / bank statements / payslips. Self-declared income is never verified (REFER). Volatile income (CV > 25%) is assessed on the lowest month.
- Obligations: the **highest** of bureau instalments, declared obligations and observed debit orders.
- Expenses: the **higher** of declared expenses and the NCA minimum expense norm (gross-income band table in `policy.js`).
- The all-in instalment from `terms.js` — includes every patient-facing fee.
- Checks: net income ≥ R4,000 · discretionary income ≥ instalment · RTI ≤ 20% of **net** (15% when urgent, manual income or portfolio tightened) · DTI ≤ 55% of **gross**, all segments · amber bands (RTI > 15%, DTI > 45%, cover < 1.5×) refer to a human.

### What feeds Provider Risk Management
- Verification: HPCSA, BHF practice number, bank account — re-checked every 12 months.
- Trust tier (probation → standard → trusted → premium): per-patient cap, monthly volume cap, holdback %.
- Concentration: absolute rand caps while the book is under R20m (R1m per provider, R4m per procedure type), then ≤5% per provider and ≤20% per procedure type.
- Performance breakers, only once samples are credible (≥20 arrangements / ≥10 first instalments): missed-payment rate (watch 5%, suspend 8%), first-instalment failure (collusion signal: watch 3%, suspend 5%), disputes, complaints.
- Tariff control (gap segment): billing agreement required; invoice > 1.3× benchmark refers, > 1.5× declines.
- Payout plan: 80% on two-sided (patient **and** provider) procedure confirmation, balance on first collection (self-pay) or EOB reconciliation (gap), tier holdback released after 90 days current, provider recourse on dispute.

### What feeds the PD (Medical Risk Score)
Exactly the DECISIONING features in `medical-risk-score/feature-registry.js`; `outcome.outcomeMap.probabilityOfNonRepayment.inputs` lists them per decision.

| Pillar | Features | Source |
|---|---|---|
| Credit foundation | bureau score, thin file, enquiries 90d, worst arrears 12m, revolving utilisation | credit bureau |
| Affordability capacity | discretionary cover, RTI, income CV, income verification method | **from Patient Affordability** |
| Clinical risk (Pillar 1) | procedure category, urgency, booking lead days | application |
| Insurance coordination (Pillar 2) | segment, scheme membership verified, tariff ratio | scheme verification, benchmarks |
| Healthcare payment behaviour (Pillar 3) | completed arrangements, on-time ratio | PaySick ledger |
| Provider quality | provider grade, credibility-weighted missed rate, dispute rate | **from Provider Risk Management** |
| Arrangement structure | term | application |

The PD drives the risk grade (A–F), refer (> 6%) and decline (> 12%)
thresholds, and expected loss = lifetime PD × LGD 70% × EAD 75% × amount,
which must stay below 80% of arrangement revenue (refer) and 100% (decline).

**SHADOW** features (DTI, application hour, device, completion time) are
captured on every decision for research but never used. **PROHIBITED**
features (chronic medication, claims history, diagnoses, scheme brand,
protected attributes) are stripped from any input before evaluation and are
recorded in `outcome.governance.prohibitedInputsRemoved`.

## Decision precedence

Every stage runs on every application (declines still produce a full feature
vector for reject inference). The decision is the most severe result:

`DECLINED` > `REFER` > `APPROVED` / `APPROVED_COOLING_OFF`

Stage order (for `decisiveStage`): APPLICATION → PORTFOLIO → KNOCKOUT →
SEGMENT → PROVIDER → AFFORDABILITY → MEDICAL_RISK_SCORE.

- Knock-outs (debt review, sequestration, judgments, adverse listings, 3+ arrears cycles, SAFPS match, identity) are hard declines.
- Missing, stale or mock data is REFER, never a pass and never a decline on its own.
- Only APPROVED / APPROVED_COOLING_OFF is `marketplaceEligible`.
- Gap financing (Segment 1) is disabled in policy until Phase 2.

## The Medical Risk Score as IP — lifecycle

| Stage | Trigger | What happens |
|---|---|---|
| `EXPERT_PRIOR` (launch) | — | Transparent expert scorecard `MRS-EXPERT-0.1.0`, explicitly uncalibrated. Every decision + feature vector logged to `shield_decisions`. |
| `INTERCEPT_RECALIBRATION` | ≥100 bads, ≥1,000 matured | `recalibrateIntercept()` aligns the base rate to observed outcomes. |
| `CHALLENGER_TRAINABLE` | ≥300 bads, ≥3,000 matured | Train challengers on logged vectors; score them in shadow via `challengerModels`. |
| Champion promotion | `canPromote()` | Independent validation, Gini ≥ 0.35, PSI ≤ 0.10, fairness review, ≥300 development bads. |

Outcome label (fixed from day one): *90+ days past due within 12 months of
first instalment* — recorded in `shield_performance_events`.

## Data provenance

Shipped adapters for the bureau, Home Affairs, SAFPS, AVS and scheme benefit
are **mocks** and mark `source.isMock = true`. The engine refuses mock data
(REFER) unless `NODE_ENV !== 'production'` **and**
`SHIELD_ALLOW_MOCK_SOURCES=true`. Until live integrations are contracted,
production applications will route to human review.

## Audit and replay

`buildDecisionRecord()` stores input, evaluation time, policy and model
versions, feature vector and SHA-256 hashes. `replayDecision()` re-runs the
engine and proves the stored outcome is reproduced exactly. `shield_decisions`
rows are append-only (database trigger).
