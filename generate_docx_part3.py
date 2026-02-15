#!/usr/bin/env python3
"""Part 3: Sections 6-9 using redesigned helpers."""
from generate_docx_part1 import *

def build_part3():
    p = []

    # ─── SECTION 6: ADVERSE SELECTION ────────────────────────
    p.append(slabel("Section 06"))
    p.append(h1("Adverse Selection: Mapping Every Relationship"))
    p.append(h1_bar())
    p.append(body("Adverse selection is the phenomenon where one party in a transaction holds more information than the other, leading the less-informed party to systematically attract higher-risk counterparts. In PaySick\u2019s four-party ecosystem (Patient, Provider, PaySick, Lender), adverse selection can emerge at every relationship node."))

    p.append(h2("6.1 Provider to PaySick: The Most Dangerous Relationship"))
    p.append(h3("The Core Problem"))
    p.append(body("Providers receive payment within 24 hours regardless of whether the patient ever repays. This creates zero financial incentive for the provider to care about patient creditworthiness. In fact, the incentive is inverted: providers benefit from pushing every patient toward financing because it converts uncertain collection into guaranteed revenue."))
    p.append(h3("The Adverse Selection Mechanism"))
    p.append(body("A financially struggling practice may actively funnel its worst-paying patients into PaySick to convert bad debt into guaranteed cash. Treatment plans may inflate from R8,000 to R30,000 when the provider knows PaySick pays upfront. The provider holds private information about the patient\u2019s true clinical needs and payment history that PaySick cannot observe at the point of underwriting."))
    p.append(body("Research from the Federal Reserve confirms that in consumer lending markets, borrowers self-select into contracts based on private information about their risk exposure, and counterparties with misaligned incentives exacerbate this selection. In healthcare, the provider functions as a referral agent with no skin in the downside, making this the highest-risk relationship in the ecosystem."))
    p.append(h3("Quantified Impact"))
    p.append(body("If 10% of providers engage in adverse referral behaviour, and those providers generate loans with a PD of 12% (versus 3.2% baseline), the blended portfolio impact is:"))
    p.append(callout("Provider Adverse Selection Impact\nBlended PD = (90% \u00d7 3.2%) + (10% \u00d7 12.0%) = 2.88% + 1.20% = 4.08%\nNet Loss Rate increase: from 1.44% to 1.84% (a 28% increase in losses)\nAt R100M annual loan volume: additional R400,000 in losses annually\nAt R500M volume: R2 million in additional annual losses"))
    p.append(h3("Mitigation Controls"))
    p.append(num(1, " Track repayment performance of each provider\u2019s referred patients. Providers whose patients default at 6%+ receive automatic throttling: lower loan ceilings, slower payouts, and eventual suspension.", prefix="Provider Risk Scoring with Enforcement:"))
    p.append(num(2, " Build a database of typical procedure costs by type and region. Flag any provider consistently quoting 30%+ above benchmark for mandatory review before loan approval.", prefix="Treatment Cost Benchmarking:"))
    p.append(num(3, " New providers start with R10,000 per-patient cap and 5-day payout (not 24 hours). They earn faster payouts and higher limits only after 6 months of clean repayment data from their referred patients.", prefix="Graduated Trust System:"))
    p.append(num(4, " 5\u201310% holdback on the first 20 loans from a new provider, released after 90 days of on-track repayment. This structurally eliminates the moral hazard for unproven providers.", prefix="Provider Co-Payment Holdback:"))

    p.append(h2("6.2 Patient to PaySick: The Classic Selection Problem"))
    p.append(h3("The Core Problem"))
    p.append(body("Patients who actively seek financing are statistically more likely to be financially stressed than patients who could pay cash. This is textbook adverse selection: the people most attracted to the product are the riskiest borrowers. In healthcare, clinical urgency compounds this, as patients needing emergency procedures will accept any terms."))
    p.append(h3("The Adverse Selection Mechanism"))
    p.append(body("BNPL data confirms this pattern at scale. In the U.S., 55% of BNPL users choose the service because it allows them to afford things they otherwise could not. Among BNPL users, 77.7% rely on at least one financial coping strategy. The Federal Reserve Bank of New York has warned that BNPL users are disproportionately financially fragile, as measured by their average likelihood of covering a $2,000 emergency expense."))
    p.append(body("In healthcare, the risk is amplified. A patient needing urgent dental work or an emergency procedure has no time to shop around or improve their financial position. They will accept any terms. High urgency combined with financial stress produces the exact borrower profile that defaults."))
    p.append(h3("Quantified Impact"))
    p.append(callout("Patient Adverse Selection Drift\nYear 1 mix: 70% convenience borrowers (PD 2%) + 30% necessity borrowers (PD 6%) = Blended PD 3.2%\nYear 2 drift: 50% convenience + 50% necessity = Blended PD 4.0%\nYear 3 adverse drift: 30% convenience + 70% necessity = Blended PD 4.8%\nNet loss rate progression: 1.44% \u2192 1.80% \u2192 2.16% (50% increase over three years)\nThis silent drift is the most dangerous form of adverse selection because it appears gradually in the data."))
    p.append(h3("Mitigation Controls"))
    p.append(num(1, " Elective procedures (cosmetic, dental veneers, laser eye) have different approval criteria than urgent or essential procedures. Elective patients who choose financing are lower risk because they had time to plan.", prefix="Urgency Segmentation:"))
    p.append(num(2, " Skip bureau checks as positioning, but replace with bank statement analysis (30 days of transaction data showing income and spending patterns). \u2018No bureau\u2019 must not mean \u2018no verification\u2019.", prefix="Affordability Verification Over Credit History:"))
    p.append(num(3, " Cap monthly repayment at 15\u201320% of verified monthly income. Non-negotiable. This single rule physically limits exposure to patients who cannot afford the loan.", prefix="Hard Repayment-to-Income Ceiling:"))
    p.append(num(4, " 48-hour waiting period for elective procedures above R15,000 to filter out impulsive borrowing. Urgent or essential procedures bypass this with tighter affordability requirements.", prefix="Cooling-Off Period:"))

    p.append(h3("Structural Solution: The PaySick Health Line (Revolving Credit Facility)"))
    p.append(body("The most powerful structural answer to patient adverse selection is to change the product construct for proven borrowers. A revolving healthcare credit facility, the PaySick Health Line, fundamentally inverts the adverse selection dynamic. Instead of the riskiest patients being the most attracted to the product, the best patients are rewarded with pre-approved credit."))
    p.append(body_b("Actuarial logic: ", "The one-shot lending model creates adverse selection at every new loan because the borrower is unknown at the point of need. A revolving facility converts this into a portfolio management problem with known borrowers and behavioural data. Patients who successfully complete their first loan (minimum 6 months of on-time repayment) are automatically pre-approved for a revolving healthcare credit line. Limits increase with continued performance. This creates a retained-customer pool with dramatically lower PD, estimated at 1.5\u20132.0% versus 3.2% for new originations, because the population has been screened by actual behaviour, not predicted risk factors."))
    p.append(body_b("Product structure: ", "Minimum 6 months on-time repayment on initial loan triggers automatic pre-approval. Initial revolving limit set at 50% of first loan amount. Graduated limit increases based on continued performance, up to R75,000 for patients with 24+ months of clean history. The facility can be drawn for any procedure at any provider in the PaySick network, with 60-second approval since underwriting is pre-completed. Interest rates for Health Line patients are prime + 3\u20135%, reflecting the lower risk profile, versus prime + 5\u20138% for new borrowers."))
    p.append(body_b("Impact on portfolio composition: ", "Over time, the Health Line creates a growing proportion of low-risk repeat borrowers in the book. By Year 3, if 30% of the portfolio is revolving-facility patients with 1.5% PD and 70% is new originations at 3.2% PD, the blended portfolio PD drops to 2.69%, a structural improvement that compounds annually as the Health Line population grows."))

    p.append(h2("6.3 Lender to PaySick: Reverse Selection and Cherry-Picking"))
    p.append(body("This adverse selection runs in reverse. With multiple lenders on the marketplace, the best lenders (lowest rates, best terms) cherry-pick the safest loans: young professionals, small amounts, known procedures. The riskier loans are picked up only by aggressive lenders charging the highest rates."))
    p.append(body("Over time, this creates a two-tier system. The best patients get matched with good lenders and have excellent experiences. The most vulnerable patients get matched with the most expensive lenders and have poor experiences. This damages the PaySick brand and eventually drives providers away."))
    p.append(h3("The Nightmare Scenario"))
    p.append(body("A predatory lender joins the marketplace specifically to target high-urgency, low-alternative patients with interest rates exceeding 35%. They are willing to take the risk because margins are enormous. PaySick earns origination fees, creating a perverse incentive to allow it. When patients complain or default, the reputational damage hits PaySick, not the lender."))
    p.append(h3("Mitigation Controls"))
    p.append(bul("Maximum allowable interest rate of prime + 12%. Any lender exceeding this is excluded from the marketplace.", prefix="Rate Caps: "))
    p.append(bul("Score lenders on approval rates, complaint rates, patient satisfaction, and collections practices. Low-scoring lenders lose visibility or are removed.", prefix="Lender Quality Scoring: "))
    p.append(bul("Each lender must bid on a minimum percentage of all loan requests, not just cherry-picked safe ones. Lenders can price for risk but cannot serve only easy loans.", prefix="Minimum Coverage Requirements: "))
    p.append(bul("Instead of showing all offers, show the top 2\u20133 ranked by a blended score of rate, lender quality, and terms. Editorial control protects the patient experience.", prefix="PaySick as Rate Curator: "))

    p.append(h2("6.4 Patient to Provider: The Hidden Outcome Risk"))
    p.append(body("This relationship does not flow through PaySick directly but critically affects the book. If a patient has a bad clinical outcome (botched procedure, complications, chronic pain), they psychologically disengage from repayment. Medical debt tied to negative health outcomes has measurably higher default rates than debt tied to successful treatment."))
    p.append(body("A high-volume provider with mediocre clinical outcomes generates loan volume that initially appears healthy. Three to six months later, complication rates are high, satisfaction is low, and defaults spike. By the time repayment data reveals the pattern, six months of loans have already been funded through that provider."))
    p.append(h3("Mitigation Controls"))
    p.append(bul("Post-treatment survey at 30 and 90 days. Specifically: \u2018Did the treatment achieve the expected outcome?\u2019 Tie this back to provider scoring.", prefix="Patient Satisfaction Feedback Loop: "))
    p.append(bul("Providers whose patients report poor outcomes AND have higher default rates get flagged automatically. The correlation between clinical quality and repayment is a powerful risk signal.", prefix="Outcome-Adjusted Provider Scoring: "))
    p.append(bul("Track default rates by procedure type per provider. A provider may have excellent results for one procedure but poor results for another. Granular scoring allows restriction of specific procedures rather than full provider suspension.", prefix="Procedure-Level Monitoring: "))

    # ─── SECTION 7: SHIELD FRAMEWORK ────────────────────────
    p.append(slabel("Section 07"))
    p.append(h1("The PaySick Shield Framework: Target Underwriting Model"))
    p.append(h1_bar())
    p.append(body("The PaySick Shield Framework is the integrated set of structural controls designed to maintain net loss rates below 2% across economic cycles. It operates across five layers, each breaking the adverse selection cascade at a different point. This framework is the target operating model and represents the ideal scenario that PaySick aims to achieve and sustain."))

    p.append(h2("7.1 Layer 1: Provider Gate (Breaks the Chain at Origination)"))
    p.append(TBL(
        ["Control", "Specification", "Replicability in New Markets"],
        [["Graduated trust onboarding", "New providers: R10K cap, 5-day payout. Graduated over 6 months based on referred patient repayment", "Universal: adjust currency thresholds and payout timelines per market"],
         ["Provider risk scorecard", "Monthly scoring on: patient PD, treatment cost variance, outcome satisfaction, volume trends", "Universal: scoring inputs available in any market with provider integration"],
         ["Treatment cost benchmarking", "Flag providers quoting 30%+ above regional procedure average. Manual review before approval", "Requires local procedure cost database. Build during first 6 months per market"],
         ["Co-payment holdback", "5\u201310% holdback on first 20 loans per new provider. Released at 90 days if repayment on track", "Universal: adjust percentage based on local provider economics"],
         ["Concentration limits", "No single provider exceeds 5% of total loan book. No single procedure type exceeds 20%", "Universal: percentages may adjust based on market provider density"]],
        [2200, 3800, 3026]
    ))

    p.append(h2("7.2 Layer 2: Patient Gate (Breaks the Chain at Underwriting)"))
    p.append(h3("Identifying and Optimising for Convenience Borrowers"))
    p.append(body("The distinction between convenience borrowers (patients who could pay but prefer instalments) and necessity borrowers (patients who cannot pay without financing) is the single most important segmentation for portfolio quality. Convenience borrowers are identified through four observable signals:"))
    p.append(bul("Elective procedures such as cosmetic surgery, dental veneers, laser eye correction, and fertility treatment are overwhelmingly convenience-driven. These patients had time to research, compare, and plan.", prefix="Procedure type: "))
    p.append(bul("Patients who schedule weeks in advance versus same-day urgency. The booking lead time is a strong proxy for financial planning capacity.", prefix="Timing signal: "))
    p.append(bul("Patients whose verified income easily covers repayment, with debt-to-income below 10% post-loan, are almost certainly convenience borrowers.", prefix="Income-to-loan ratio: "))
    p.append(bul("Gap financing patients, those with medical aid who need financing only for the portion not covered, are overwhelmingly convenience borrowers with stable employment and demonstrated financial responsibility.", prefix="Medical aid status: "))
    p.append(body("Platform optimisation for convenience borrowers includes: priority provider partnerships with elective-heavy practices (dental, cosmetic, ophthalmology), marketing to medical aid holders for gap financing, pre-approval campaigns through employer wellness programmes, and premium rate tiers that reward the convenience profile with lower pricing."))

    p.append(h3("Rehabilitation Path for Urgent-Need Patients"))
    p.append(body("Not all urgent-need patients are high-risk. The framework must provide a path for patients who present with urgent clinical need but demonstrate underlying financial capacity. The rehabilitation protocol is: initial urgent loan with tighter criteria including lower ceiling, shorter term, and mandatory credit life insurance. If repayment is on track at 3 months, the patient is reclassified from urgent-necessity to standard risk tier. At 6 months of clean payment, they become eligible for the PaySick Health Line revolving facility. This creates an earned-trust pathway that does not exclude patients in genuine need while protecting the portfolio from unmanaged urgency-driven adverse selection."))

    p.append(h3("Income Verification Architecture"))
    p.append(body("Bank statement verification is a non-negotiable component of the underwriting pipeline. The architecture operates in three tiers, deployed based on market infrastructure maturity:"))
    p.append(body_b("Tier 1 (Available Immediately in South Africa): ", "Secure PDF bank statement upload with automated parsing. The patient uploads 30\u201390 days of bank statements via the PaySick app. Automated parsing extracts: regular salary deposits, existing debit orders and recurring obligations, spending patterns and discretionary income, and account balance trends. Technology partners such as Finch Technologies (Gathr), Stitch, and Yodlee provide PDF parsing across all major South African banks including FNB, Standard Bank, Absa, Nedbank, and Capitec. Integration time: 2\u20134 weeks. Statement authenticity is verified against each bank\u2019s unique statement format and security features."))
    p.append(body_b("Tier 2 (6\u201312 Months, API Integration): ", "Direct open banking API connections for real-time, read-only access to transaction data with customer consent. Investec already offers programmable banking APIs through the Offerzen community. Nedbank has MyFinancialLife. Stitch provides aggregated access. The FSCA is consulting on formal open banking regulation for South Africa. API-verified income data is scored higher in the underwriting model because it cannot be manipulated, unlike PDF statements which carry a small fraud risk."))
    p.append(body_b("Tier 3 (Market-Specific Expansion): ", "In Kenya, M-Pesa transaction data via Safaricom APIs provides real-time income verification for the informal economy. In Nigeria, BVN-linked bank data through platforms such as Mono or Okra. In India, Account Aggregator framework provides consent-based financial data sharing. The underwriting system is designed to accept all three tiers simultaneously, with risk-adjusted pricing: API-verified income receives the best rates, PDF-parsed receives standard rates, and manually verified receives conservative rates with lower loan ceilings."))

    p.append(TBL(
        ["Control", "Specification", "Replicability"],
        [["Hard affordability ceiling", "Monthly repayment capped at 15\u201320% of verified income. Non-negotiable.", "Universal: adjust percentage per local consumer debt-service norms"],
         ["Urgency segmentation", "Elective vs urgent procedures have separate underwriting criteria and approval thresholds", "Universal: procedure classification adaptable per market"],
         ["Bank statement verification", "30-day transaction analysis for income patterns, spending behaviour, existing obligations", "Requires open banking or statement upload. Available in SA, Kenya, Nigeria"],
         ["Cooling-off period", "48-hour wait for elective procedures above R15K. Urgent procedures bypass with tighter affordability", "Universal: adjust threshold currency and exemption criteria per market"],
         ["Medical aid gap calculation", "Real-time benefits verification. Only finance the residual gap, not the full procedure cost", "Market-specific: requires integration with local insurance or medical aid systems"]],
        [2200, 3800, 3026]
    ))

    p.append(h2("7.3 Layer 3: Lender Gate (Breaks the Chain at Funding)"))
    p.append(bul("All marketplace loans capped at prime + 12%. Protects vulnerable patients and PaySick brand.", prefix="Rate cap enforcement: "))
    p.append(bul("Ongoing assessment of approval rates, complaint rates, patient satisfaction, collections practices. Low scorers lose visibility.", prefix="Lender quality scoring: "))
    p.append(bul("Lenders must bid on a minimum percentage of all requests, preventing pure cherry-picking of safe loans.", prefix="Minimum coverage requirements: "))
    p.append(bul("No single lender exceeds 25% of marketplace volume. Prevents dependency on any single funding source.", prefix="Lender diversification minimum: "))

    p.append(h2("7.4 Layer 4: Outcome Gate (Breaks the Chain at Collections)"))
    p.append(bul("Tied directly to provider scoring. Poor outcomes correlate with higher defaults.", prefix="30/90-day patient satisfaction surveys: "))
    p.append(bul("Granular monitoring per provider per procedure type. Enables surgical precision in risk management.", prefix="Procedure-level default tracking: "))
    p.append(bul("Providers with both poor outcomes and elevated defaults receive automatic restriction.", prefix="Outcome-adjusted provider scoring: "))
    p.append(bul("Proactive repayment restructuring for patients experiencing complications, preserving the patient relationship and reducing walk-away risk.", prefix="Flexible restructuring: "))

    p.append(h2("7.5 Layer 5: Portfolio Circuit Breakers (Breaks the Chain at System Level)"))
    p.append(TBL(
        ["Trigger", "Automatic Response", "Rationale"],
        [["90-day arrears exceed 6%", "Automatic tightening of approval criteria: lower loan ceilings, tighter affordability ratios", "Early intervention before losses crystallise"],
         ["Balance sheet exceeds 40% of total book", "Pause new balance sheet origination until marketplace share recovers", "Prevents over-concentration of direct credit risk"],
         ["Single provider PD exceeds 8%", "Immediate suspension of new loans through that provider pending review", "Isolates provider-specific adverse selection"],
         ["Reserve fund falls below 15% of marketplace fee income", "Redirect 20% of origination fees to rebuild reserve", "Maintains first-loss buffer for lender confidence"],
         ["Net loss rate exceeds 3% for two consecutive months", "Comprehensive portfolio review; potential moratorium on new provider onboarding", "Systemic stress requires systemic response"]],
        [2500, 3500, 3026]
    ))

    # ─── SECTION 8: IDEAL OPERATING STATE ────────────────────
    p.append(slabel("Section 08"))
    p.append(h1("The Ideal Operating State: Shielded Underwriting Model"))
    p.append(h1_bar())
    p.append(body("When the PaySick Shield Framework is operating at target, the platform achieves a state we call Shielded Equilibrium, where every participant\u2019s incentives are structurally aligned with portfolio quality."))

    p.append(h2("8.1 Target Operating Metrics"))
    p.append(TBL(
        ["Metric", "Target", "Benchmark Comparison"],
        [["Probability of Default (PD)", "2.5 \u2013 3.2%", "vs 8\u201312% retail BNPL"],
         ["Loss Given Default (LGD)", "40 \u2013 45%", "vs 60%+ unsecured retail"],
         ["Net Loss Rate", "1.0 \u2013 1.44%", "vs 5\u20137% retail BNPL"],
         ["Balance sheet as % of total book", "< 35%", "Declining as marketplace scales"],
         ["Provider adverse selection rate", "< 3% of providers flagged", "Graduated trust filters bad actors early"],
         ["Patient convenience-to-necessity ratio", "> 60:40", "Maintained through affordability ceilings"],
         ["Lender retention rate", "> 90% annual", "Quality approvals keep lenders on platform"]],
        [3500, 2750, 2776]
    ))

    p.append(h2("8.2 Data Flywheel: How Loss Rates Improve Over Time"))
    p.append(TBL(
        ["Phase", "Volume", "Expected PD", "Data Advantage"],
        [["Months 1\u20136 (Cold Start)", "< 500 loans", "~5.0% (conservative)", "Known-provider-only, smaller loans, tight criteria"],
         ["Months 6\u201312", "2,000 loans", "~3.5%", "Procedure-level default data emerges"],
         ["Year 2", "10,000+ loans", "~2.5\u20133.2%", "Provider scoring calibrated, repeat patient data available"],
         ["Year 3+ (Multi-lender data)", "50,000+ loans", "< 2.5%", "Cross-lender default patterns create industry-level insight"]],
        [2250, 2250, 2250, 2276]
    ))
    p.append(body("Every transaction generates a proprietary data point mapping Procedure \u2192 Provider \u2192 Patient Profile \u2192 Repayment Outcome. After 10,000 transactions, this dataset is unreplicable without years of healthcare-specific operation. This is the true moat: not the technology, but the data the technology generates."))

    p.append(h2("8.3 The Virtuous Cycle"))
    p.append(body("In Shielded Equilibrium, the platform operates a self-reinforcing virtuous cycle:"))
    p.append(bul("Better underwriting data leads to lower loss rates"))
    p.append(bul("Lower loss rates attract higher-quality lenders at better rates"))
    p.append(bul("Better rates attract higher-quality patients (convenience borrowers over necessity borrowers)"))
    p.append(bul("Higher-quality patients improve repayment data further"))
    p.append(bul("Better repayment data attracts premium providers who want their patients to access the best terms"))
    p.append(bul("Premium providers have better clinical outcomes, reducing outcome-driven defaults"))
    p.append(body("This cycle compounds over time, creating a structural advantage that generic BNPL or unsecured lending platforms cannot replicate because they lack the healthcare-specific data inputs to initiate the cycle."))

    # ─── SECTION 9: GLOBAL REPLICABILITY ─────────────────────
    p.append(slabel("Section 09"))
    p.append(h1("Global Replicability: Scaling the Framework"))
    p.append(h1_bar())
    p.append(body("The PaySick Shield Framework is designed for global deployment. While South Africa serves as the proving ground, every control mechanism requires only local calibration, not fundamental redesign."))

    p.append(h2("9.1 Market Entry Calibration Matrix"))
    p.append(TBL(
        ["Framework Element", "South Africa", "Kenya", "Nigeria", "Calibration Required"],
        [["Regulatory framework", "NCA, POPIA, HPCSA", "CBK, Data Protection Act", "CBN, NDPR, FCCPC", "Local compliance mapping"],
         ["Affordability ceiling", "15\u201320% of income", "20\u201325% (adjust for informal income)", "20\u201325%", "Adjust % per local DTI norms"],
         ["Provider onboarding", "HPCSA verification", "KMPDC verification", "MDCN verification", "Local medical council integration"],
         ["Insurance integration", "Medical aid schemes", "NHIF / private insurers", "NHIS / HMOs", "Local insurance API development"],
         ["Income verification", "Bank statements / open banking", "M-Pesa data / bank statements", "BVN-linked bank data", "Local fintech data source integration"],
         ["Circuit breaker thresholds", "6% arrears / 40% BS cap", "8% arrears / 50% BS cap", "8% arrears / 50% BS cap", "Adjust per market maturity"]],
        [1800, 1800, 1800, 1800, 1826]
    ))
    p.append(body("The core architecture is identical across all markets: provider gate, patient gate, lender gate, outcome gate, and portfolio circuit breakers. Only the calibration values change based on local regulatory requirements, income verification infrastructure, and insurance system maturity."))

    p.append(h2("9.2 Expansion Market Assessment: Five Priority Markets"))
    p.append(body("PaySick\u2019s expansion strategy targets five markets selected against six criteria: structural healthcare financing gap, private sector maturity, fintech infrastructure readiness, cost of capital favourability, regulatory alignment with existing compliance architecture, and absence of dominant incumbent. The sequencing prioritises credibility-building in regulated first-world markets alongside volume growth in high-need emerging economies."))

    p.append(h3("Market 1: India \u2014 The Scale Engine"))
    p.append(body("India presents PaySick\u2019s largest volume opportunity globally. Approximately 400 million Indians remain uninsured and financially vulnerable to medical emergencies, and approximately 30% of the country\u2019s population is not eligible for government or many forms of private insurance (NITI Aayog, 2021). Out-of-pocket expenditure accounted for 39.4% of total health expenditure in 2021\u201322, declining from 62.6% in 2014\u201315 but still among the highest of any major economy (National Health Accounts, 2022). Healthcare spending for approximately 90 million Indians has surpassed the catastrophic threshold of 10% of household consumption. Private hospitals account for 27% of current health expenditure."))
    p.append(body("India\u2019s infrastructure advantages are substantial. The Unified Payments Interface processed over 12 billion monthly transactions by 2024, providing world-class payment rails. The Account Aggregator framework enables consent-based financial data sharing, solving PaySick\u2019s income verification requirement natively. The Reserve Bank of India\u2019s policy rate of 6.5% creates comparable NIM opportunity to South Africa. India\u2019s \u2018missing middle,\u2019 the population too wealthy for Ayushman Bharat but unable to afford private insurance, represents approximately 400 million people, directly analogous to PaySick\u2019s Segment 2 at 20 times the scale of South Africa."))
    p.append(body_b("Key risks: ", "Regulatory complexity across 28 states, currency depreciation exposure, extreme price sensitivity requiring product re-engineering for micro-loan ticket sizes, and competitive pressure from domestic fintech players."))

    p.append(h3("Market 2: United Kingdom \u2014 The Waiting-List Arbitrage"))
    p.append(body("The United Kingdom represents the most compelling first-world expansion market for PaySick, driven by a structural crisis in the NHS that is actively creating a self-pay patient financing market. The NHS elective care waiting list exceeded 7.36 million cases as of May 2025, with tens of thousands of patients waiting over 18 months for treatment. This backlog has triggered a historic surge in self-funded private healthcare. A 2025 PHIN report found that over 5.2 million UK residents, approximately one in ten adults, now pay for private medical treatment out-of-pocket each year, with the self-pay market growing by 39% since 2022."))
    p.append(body("The average cost of a private hip replacement in the UK is approximately \u00a313,985, placing it well within PaySick\u2019s optimal loan-size range. In 2024, 939,000 people in the UK chose private hospital treatment, a 3% increase on the prior year. Critically, many private hospitals already offer financing partnerships with consumer credit companies, validating the market demand. However, no specialised healthcare-only financing platform has established dominance."))
    p.append(body("The UK offers structural advantages that no emerging market can replicate. The Bank of England base rate sits at 4.5%, providing the lowest cost of capital among all target markets. The Financial Conduct Authority regulatory framework aligns closely with PaySick\u2019s existing NCA compliance architecture. The population is fully banked with mature open banking infrastructure under the Open Banking Implementation Entity. English-speaking eliminates localisation cost entirely. Average loan sizes of \u00a32,000 to \u00a315,000 dramatically improve unit economics compared to emerging market operations. And the reputational signal of operating under FCA regulation transforms every subsequent investor and partnership conversation."))
    p.append(body("The addressable population is substantial: 67 million people have theoretical access to free NHS care, but 7.36 million are actively waiting for treatment. Within this cohort, those with sufficient income to consider self-pay private treatment represent an estimated 15 to 20 million adults."))
    p.append(body_b("Key risks: ", "Competition from established consumer credit players such as Klarna and Zip, the political sensitivity of healthcare financing in a system built on the principle of free access, and FCA authorisation timelines."))

    p.append(h3("Market 3: Australia \u2014 The Premium Gap Financing Market"))
    p.append(body("Australia mirrors South Africa\u2019s public-private healthcare duality at a significantly higher value per transaction. As of March 2024, 44.8% of the population (12.2 million people) held private hospital treatment cover (APRA, 2024). However, private health insurance in Australia is legally prohibited from covering gap payments for outpatient services covered by Medicare, creating a structural, regulatory gap that insurance by law cannot fill. This is precisely PaySick\u2019s product: financing the gap that insurance does not cover."))
    p.append(body("Gap payments are accelerating. The average gap for known costs rose from $99 to $135 AUD in five years, while unknown costs (not disclosed in advance) jumped from $418 to $685 AUD. Gap payments are rising three times faster than hospital costs. Only 44% of private hospital admissions had zero out-of-pocket fees, meaning the majority of privately treated patients face some gap exposure. Out-of-pocket fees account for 15% of all health expenditure in Australia, almost double the amount contributed by private health insurers."))
    p.append(body_b("Key risks: ", "Competitive pressure from Afterpay, Zip, and established consumer finance players; regulatory approval timelines; and the need to build provider networks in a market with no existing relationships."))

    p.append(h3("Market 4: Kenya \u2014 The African Expansion Proof Point"))
    p.append(body("Kenya has the most advanced mobile money infrastructure in the world through M-Pesa, solving PaySick\u2019s income verification and payment collection challenges simultaneously. The CarePay platform (M-TIBA) has already connected 5 million people and 4,000 healthcare providers, proving that the healthcare-fintech model works in this market. Kenya\u2019s NHIF covers only a fraction of the population effectively, leaving significant out-of-pocket exposure. The CBK policy rate at 10% creates attractive NIM potential."))
    p.append(body("Kenya functions as the ideal proof-of-scalability market after South Africa: smaller, more controlled, with world-class fintech rails, a functioning credit reference bureau system, and a fintech-friendly regulatory environment. It is also the strategic gateway to East Africa, including Tanzania, Uganda, and Rwanda. The population of 55 million, combined with the East African Community\u2019s 300 million people, provides long-term regional scale."))
    p.append(body_b("Key risks: ", "Smaller absolute market size limits near-term revenue contribution, political instability cycles, and healthcare provider fragmentation outside Nairobi and Mombasa."))

    p.append(h3("Market 5: Philippines \u2014 The APAC Gateway"))
    p.append(body("The Philippines has 110 million people, a large private hospital sector, and significant out-of-pocket healthcare spending despite PhilHealth\u2019s theoretical universal coverage. In practice, PhilHealth covers only a fraction of actual costs, creating gap-financing demand identical to PaySick\u2019s Segment 1 in South Africa. The country has a strong BPO-driven middle class earning $400 to $1,200 per month, precisely the income bracket where healthcare financing is most needed and most viable. GCash and Maya provide mobile payment infrastructure comparable to M-Pesa. English is widely spoken, reducing localisation costs to near zero. The BSP has created a fintech-friendly regulatory sandbox that accelerates market entry."))
    p.append(body("The Philippines also serves as the strategic gateway to Indonesia (270 million people, similar private-public healthcare dynamics) and Vietnam (100 million people, rapidly growing private sector)."))
    p.append(body_b("Key risks: ", "Typhoon-driven economic disruption, complex island geography complicating provider network development, and competition from GCash\u2019s own lending products entering adjacent verticals."))

    p.append(h3("Expansion Market Comparison Matrix"))
    p.append(TBL(
        ["Factor", "India", "UK", "Australia", "Kenya", "Philippines"],
        [["Population", "1.4 billion", "67 million", "26 million", "55 million", "110 million"],
         ["Uninsured (%)", "~60%", "100% NHS, but 7.4M waiting", "55% no PHI", "~80%", "~65%"],
         ["Policy rate", "6.5%", "4.5%", "4.35%", "10%", "6.5%"],
         ["Avg. loan size", "$150\u2013$2K", "$2K\u2013$18K", "$800\u2013$4K", "$50\u2013$500", "$100\u2013$1.5K"],
         ["Fintech infra.", "Very high (UPI)", "Very high (Open Banking)", "Very high (NPP)", "Very high (M-Pesa)", "High (GCash)"],
         ["Incumbent risk", "Low", "Medium", "Medium", "Low", "Very low"],
         ["Strategic role", "Scale engine", "Credibility anchor", "Premium value", "African proof", "APAC gateway"]],
        [1500, 1500, 1500, 1500, 1500, 1526]
    ))
    p.append(body_b("Recommended sequencing: ", "South Africa (live) \u2192 Kenya (Year 2, African expansion proof) \u2192 United Kingdom (Year 2\u20133, credibility anchor under FCA regulation) \u2192 India (Year 3\u20134, global scale play) \u2192 Philippines (Year 4\u20135, APAC gateway). The UK at Phase 2\u20133 is deliberate: operating under FCA regulation fundamentally transforms investor conversations and validates the model in a high-income, high-trust environment."))

    p.append(h2("9.3 Procedure Profitability Analysis: South Africa Launch Verticals"))
    p.append(body("Not all medical procedures present equal opportunity for PaySick. Profitability is a function of five variables: procedure cost (which determines loan size and absolute margin), predictability of pricing (which enables accurate underwriting), elective versus urgent nature (which determines borrower risk profile), provider concentration (which enables efficient network development), and frequency (which drives volume)."))

    p.append(h3("Tier 1: High-Volume Elective Procedures (Highest Profitability)"))
    p.append(body("Dental procedures represent PaySick\u2019s single most profitable launch vertical. South Africa has only 6,866 registered dentists serving 63.2 million people, creating acute scarcity in the public sector and driving demand to private practitioners. Procedure costs range from R3,000 for routine restorative work to R80,000 or more for dental implants and full-mouth rehabilitation. Critically, dental procedures are overwhelmingly elective and planned, meaning patients book weeks or months in advance, the strongest signal of convenience borrowing."))
    p.append(body("Ophthalmology is the second-highest priority. Laser eye surgery (LASIK) ranges from R12,000 to R30,000 per eye, cataract surgery from R15,000 to R45,000. These are almost exclusively elective, planned well in advance, performed by specialist practices with standardised pricing, and carry negligible clinical complication risk."))
    p.append(body("Cosmetic and aesthetic surgery rounds out Tier 1. South Africa is a recognised global destination for cosmetic procedures, with rhinoplasty (R30,000 to R80,000), breast augmentation (R45,000 to R90,000), liposuction (R25,000 to R60,000), and abdominoplasty (R40,000 to R100,000) representing the core volume drivers. These are 100% elective, 100% planned, and 100% self-pay."))

    p.append(h3("Tier 2: Medium-Ticket Gap Financing (Strong Profitability)"))
    p.append(body("Orthopaedic procedures represent the largest gap financing opportunity by value. Hip replacements (R80,000 to R160,000), knee replacements (R70,000 to R140,000), ACL reconstruction (R40,000 to R90,000), and spinal procedures (R60,000 to R250,000) are partially covered by medical aid but almost always generate significant out-of-pocket gaps of R15,000 to R50,000."))
    p.append(body("Fertility treatment occupies a unique profitability position. IVF cycles cost R30,000 to R60,000 per cycle, with many patients requiring two to four cycles. Most medical aid schemes exclude or severely limit fertility benefits. The patient demographic is typically dual-income couples aged 30 to 42 with stable employment and strong financial profiles. PaySick\u2019s revolving Health Line product is particularly well-suited."))

    p.append(h3("Tier 3: High-Volume Access Financing (Volume Play)"))
    p.append(body("General surgery and gastroenterology encompasses procedures such as hernia repair (R25,000 to R55,000), gallbladder removal (R30,000 to R60,000), appendectomy (R25,000 to R50,000), and endoscopy or colonoscopy (R8,000 to R20,000). These are semi-urgent and function as a volume driver for Segment 2 lending."))
    p.append(body("Maternity and obstetric care represents the highest-frequency procedure category. Private maternity packages range from R25,000 for a natural delivery to R45,000 or more for caesarean section. With South Africa\u2019s caesarean rate in private hospitals exceeding 70%, the average maternity loan is approximately R35,000. This category functions as a patient acquisition channel: a positive maternity financing experience creates lifetime PaySick loyalty."))

    p.append(h3("Procedure Priority Matrix"))
    p.append(TBL(
        ["Procedure Category", "Avg. Loan Size", "Elective %", "Expected PD", "Profitability"],
        [["Dental", "R8K \u2013 R35K", "90%+", "1.0 \u2013 2.0%", "Very High"],
         ["Ophthalmology", "R12K \u2013 R45K", "95%+", "1.0 \u2013 1.5%", "Very High"],
         ["Cosmetic surgery", "R25K \u2013 R100K", "100%", "0.8 \u2013 1.5%", "Very High"],
         ["Orthopaedics (gap)", "R15K \u2013 R50K gap", "70%", "1.5 \u2013 2.5%", "High"],
         ["Fertility / IVF", "R30K \u2013 R60K/cycle", "100%", "1.5 \u2013 2.0%", "High"],
         ["General surgery", "R25K \u2013 R60K", "40%", "2.5 \u2013 4.0%", "Moderate-High"],
         ["Maternity", "R25K \u2013 R45K", "Planned", "2.0 \u2013 3.5%", "Moderate-High"]],
        [2000, 1800, 1500, 1800, 1926]
    ))
    p.append(body_b("Recommended launch sequence: ", "PaySick should prioritise provider onboarding in the following order: (1) dental practices and ophthalmology clinics for the highest-quality initial portfolio and lowest default rates, (2) cosmetic surgery practices and fertility clinics for premium ticket sizes, (3) orthopaedic specialists and maternity hospitals for medical aid gap financing volume, and (4) general surgery and gastroenterology for Segment 2 expansion."))

    return p

if __name__ == "__main__":
    print("Part 3 loaded.")
