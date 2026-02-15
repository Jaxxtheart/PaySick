#!/usr/bin/env python3
"""Part 2: Sections 1-5 using redesigned helpers."""
from generate_docx_part1 import *

def build_part2():
    p = []

    # ─── SECTION 1: EXECUTIVE SUMMARY ────────────────────────
    p.append(slabel("Section 01"))
    p.append(h1("Executive Summary"))
    p.append(h1_bar())
    p.append(body("This white paper presents PaySick\u2019s comprehensive framework for managing underwriting risk and adverse selection in healthcare lending. It addresses three critical questions that investors, lenders, and regulators ask of any healthcare financing platform: what causes losses, how bad can they get, and what structural controls prevent catastrophic outcomes."))
    p.append(body("Healthcare lending operates in a fundamentally different risk environment from retail Buy Now, Pay Later (BNPL). The global BNPL sector reached $560 billion in gross merchandise volume in 2025, yet late payment rates among users have climbed to 42%, with 78% of subprime applicants being approved. This is not a model to replicate. PaySick\u2019s thesis is that healthcare-specific underwriting, embedded at the point of care through direct provider integration, produces structurally superior loss rates because it eliminates the information asymmetries that drive adverse selection in generic consumer lending."))
    p.append(body("This paper maps every relationship in the PaySick ecosystem where adverse selection can emerge, including the provider-to-platform, patient-to-platform, lender-to-platform, and patient-to-provider relationships. For each, it identifies the mechanism of adverse selection, models the financial impact through scenario analysis, and prescribes specific structural controls. The result is a target underwriting model, the PaySick Shield Framework, that is designed to maintain net loss rates below 2% across economic cycles and is replicable across any market where healthcare is financed privately."))
    p.append(body("The framework is anchored in South Africa, where 84% of the population lacks medical aid coverage and the private healthcare sector serves roughly 16% of citizens at ten times the per-capita expenditure of the public sector. However, every control mechanism is designed to be market-agnostic, requiring only localised calibration of regulatory thresholds, affordability ceilings, and provider onboarding criteria."))

    # ─── SECTION 2: MARKET CONTEXT ───────────────────────────
    p.append(slabel("Section 02"))
    p.append(h1("Market Context: The Case for Healthcare-Specific Underwriting"))
    p.append(h1_bar())

    p.append(h2("2.1 The Global BNPL Risk Landscape"))
    p.append(body("The BNPL industry has grown rapidly but is exhibiting systemic risk signals that healthcare lending must avoid. Key data points from 2024\u20132025 research inform our risk positioning:"))
    p.append(TBL(
        ["Metric", "Data Point"],
        [["Global BNPL GMV (2025)", "$560.1 billion, 13.7% YoY growth"],
         ["BNPL users making late payments (2025)", "42%, up from 34% in 2023"],
         ["Subprime/deep subprime approval rate", "78% approved in BNPL vs standard credit"],
         ["Klarna Q1 2025 credit losses", "17% increase YoY to $137 million"],
         ["BNPL users who are financially fragile", "77.7% rely on financial coping strategies"],
         ["Healthcare loan cumulative default (2000\u20132025)", "1.6% across 25 years of data"],
         ["U.S. patient financing market (2024)", "$16 billion with 3.2% CAGR"]],
        [4500, 4526]
    ))
    p.append(source_line("Richmond Federal Reserve (2025); Morgan Stanley (2025); Prospect Capital Management (2025); CommerceHealthcare (2025); LendingTree (2025)."))
    p.append(body("The contrast is stark: retail BNPL is experiencing accelerating late payments among an increasingly financially vulnerable user base, while healthcare lending has maintained a cumulative default rate of just 1.6% over 25 years. This divergence is not accidental. It reflects the fundamental difference between discretionary consumer spending and non-discretionary medical need."))

    p.append(h2("2.2 South Africa: The Launch Market"))
    p.append(body("South Africa presents a uniquely compelling launch market for healthcare financing. The structural dynamics are as follows:"))
    p.append(bul("84% of the population lacks medical aid coverage, creating massive unmet demand for healthcare financing mechanisms.", prefix="84% uninsured population: "))
    p.append(body("The root causes of this coverage gap are structural, not clinical. South Africa\u2019s uninsured are not rejected by medical schemes; they are priced out. The Medical Schemes Act of 1998 mandates community rating, meaning schemes cannot refuse membership based on health status. The barriers are primarily economic: official unemployment stands at approximately 32% (expanded definition approximately 42%), average medical scheme contributions exceed R6,296 per family annually, and the informal employment sector, comprising roughly 30% of employed persons, has no access to employer-subsidised schemes. Medical inflation has consistently outpaced consumer price inflation, widening the affordability gap each year. This distinction is critical for PaySick\u2019s actuarial positioning: the uninsured population is not inherently higher-risk from a health perspective. They are income-constrained. This means that with appropriate affordability controls, lending to this segment does not carry the elevated clinical risk that a CRO might instinctively associate with an uninsured population."))
    p.append(bul("Only 8 million out of 63 million citizens have private medical scheme membership, a ratio that has remained essentially flat since 2002.", prefix="15.7% medical aid coverage: "))
    p.append(body("This stagnation followed a period of active decline. Prior to 2002, coverage was deteriorating. In 1989, deregulation under the Browne Commission allowed medical schemes to risk-rate premiums and exclude individuals deemed \u2018medically uninsurable,\u2019 triggering a rapid exodus of older and sicker members. Between 1993 and 1994 alone, 200,000 South Africans lost medical scheme coverage. From 1980 to 1990, private-sector doctors increased from 40% to 60% of the total medical workforce, but membership did not track this growth because premiums escalated faster than incomes. The Medical Schemes Act of 1998 re-introduced community rating and open enrolment, stabilising the decline, but by then premiums had structurally exceeded the affordability threshold for the majority of households. The contributing factors are worsening, not improving: medical inflation consistently outpaces CPI, unemployment remains above 30%, the informal economy is expanding, and National Health Insurance legislation, while signed in 2024, faces implementation uncertainty spanning a decade or more. For PaySick, this trend is significant: the healthcare financing gap is widening structurally, ensuring sustained and growing demand for the foreseeable future."))
    p.append(bul("Per-capita health expenditure is approximately $1,400 in the private sector versus $140 in the public sector, creating a two-tier system where affordability is the primary barrier to quality care.", prefix="10:1 expenditure gap: "))
    p.append(bul("The majority of medical practitioners serve the 16% who can pay, leaving the public system chronically under-resourced.", prefix="73% of GPs in private sector: "))
    p.append(body("PaySick\u2019s exclusive focus on the private healthcare sector is a deliberate and advantageous strategic choice. Public healthcare in South Africa is free at the point of service, meaning there is nothing to finance. The private sector, however, is where patients have both the clinical need and some payment capacity, providers are commercially motivated and therefore incentivised to adopt financing tools that increase patient conversion, and procedure pricing is transparent and standardised. Critically, the addressable population extends well beyond the 16% with medical aid. An estimated 25% of uninsured South Africans already pay out-of-pocket for private care, choosing to sacrifice other spending for what they perceive as faster and higher-quality treatment. This creates a dual addressable market: medical aid holders who need gap financing for the difference between scheme coverage and actual procedure cost, and cash-paying uninsured patients who need structured repayment terms. Both segments present lower risk profiles than the broader uninsured population because they have demonstrated willingness and some capacity to pay for private healthcare."))
    p.append(bul("No specialised healthcare financing platform has established market leadership, despite R240 billion in total addressable market.", prefix="Zero dominant healthcare BNPL player: "))

    p.append(h2("2.3 Scalability: Why the Framework is Market-Agnostic"))
    p.append(body("While calibrated for South Africa, the PaySick underwriting framework is designed around universal healthcare financing principles. Every market where private healthcare exists shares three characteristics: information asymmetry between patients and lenders, provider moral hazard when financing eliminates collection risk, and adverse selection among patients who actively seek credit. The framework addresses each through structural controls that require only local calibration, not redesign, when entering new markets."))
    p.append(body("Africa\u2019s broader healthcare financing landscape reinforces the opportunity. The continent bears 22% of the global disease burden but accounts for only 1% of global health expenditure, with average per-capita health spending of just $85 across the region. Out-of-pocket payments constitute 35% of total health expenditure in Africa, pushing an estimated 15 million people into poverty annually."))
    p.append(body("The mechanism of healthcare-induced poverty is specific and well-documented. A single hospital admission or surgical procedure can consume six to twelve months of household income, demanded as a lump-sum payment. The cascade is: medical emergency occurs, family liquidates savings and productive assets such as livestock or equipment, borrows from informal lenders at rates frequently exceeding 30% per annum, defaults on existing obligations, and enters a debt spiral that may take years to escape. In South Africa, where seven in ten households use public facilities as their first option specifically because of affordability, those who do access private care often do so in crisis, compounding the financial shock."))
    p.append(body("A legitimate actuarial question is whether PaySick\u2019s model adds to this debt burden rather than alleviating it. The answer depends entirely on underwriting discipline. PaySick reduces poverty risk versus the status quo through four structural mechanisms. First, structured repayments replace catastrophic lump-sum payments, converting an unmanageable shock into a budgetable monthly obligation. Second, the hard affordability ceiling of 15\u201320% of verified monthly income prevents over-extension by design, a control that informal lenders and credit cards do not impose. Third, transparent and regulated pricing under the NCA replaces predatory informal lending rates. Fourth, and critically, patients who would otherwise defer care due to cost end up requiring more expensive emergency treatment later; early intervention at lower cost is both clinically and financially superior. PaySick is not introducing debt to a debt-free population. It is replacing worse forms of debt, including informal lending, credit card cash advances, family borrowing with relationship costs, and complete care deferral, with structured, affordable, transparent healthcare financing."))

    # ─── SECTION 3: ADDRESSABLE POPULATION ───────────────────
    p.append(slabel("Section 03"))
    p.append(h1("Addressable Population Analysis: Quantifying the Target Market"))
    p.append(h1_bar())
    p.append(body("A robust risk framework requires a precise understanding of the population to which it will be applied. PaySick\u2019s addressable market is not the full 63 million South African population. It is two precisely defined segments totalling approximately 19.6 million adults, each with distinct income profiles, behavioural attributes, and risk characteristics. This section quantifies both segments with the specificity required for actuarial modelling and credit committee approval."))

    p.append(h2("3.1 Segment 1: Medical Aid Holders Requiring Gap Financing"))
    p.append(body("Approximately 9.7 million South Africans hold medical aid coverage (Statistics South Africa, 2023). These individuals are formally employed and predominantly fall within LSM 8\u201310, the upper-middle to affluent living standards tiers. Discovery Bank\u2019s SpendTrend 2024 report categorises middle-income South Africans as earning between R100,000 and R350,000 per annum, approximately R8,000 to R29,000 per month (Discovery Bank, 2024). Medical aid holders skew to the upper end of this distribution, as monthly scheme contributions of R2,000 to R6,000 require substantial disposable income."))
    p.append(h3("Buying Power"))
    p.append(body("Medical scheme members already spend on healthcare, but scheme coverage is not complete. The Council for Medical Schemes reports that medical schemes expend an average of 92% of member contributions on healthcare costs (Council for Medical Schemes, 2018), yet co-payments, specialist shortfalls, and procedures exceeding Prescribed Minimum Benefits create out-of-pocket exposure ranging from R5,000 to R50,000 per procedure depending on complexity and scheme tier. Per-capita private healthcare expenditure in South Africa was approximately R22,891 (approximately $1,242) in 2019, compared to R4,667 ($253) in the public sector (Schneider et al., 2024). This 4.9x expenditure gap means even insured patients face significant residual costs."))
    p.append(h3("Behavioural Attributes"))
    p.append(body("This segment is financially literate, fully banked, smartphone-enabled, and accustomed to structured credit products. They hold existing home loans, vehicle finance, and insurance policies. Their decision to use PaySick is not driven by inability to pay, but by a preference to preserve cash flow and avoid liquidating savings for an unexpected medical shortfall. In credit risk terminology, these are convenience borrowers: they could pay the full amount but prefer structured instalments. This behavioural profile produces the lowest probability of default in the portfolio."))
    p.append(TBL(
        ["Attribute", "Segment 1: Gap Financing"],
        [["Population size", "~9.7 million individuals"],
         ["LSM classification", "LSM 8\u201310 (upper-middle to affluent)"],
         ["Monthly household income", "R13,000 \u2013 R32,000+ per month"],
         ["Employment status", "Formally employed, employer-subsidised scheme"],
         ["Banking status", "Fully banked, multiple credit facilities"],
         ["Digital readiness", "High: smartphone, app-literate, digital payments"],
         ["Average loan requirement", "R3,000 \u2013 R25,000 (gap amount)"],
         ["Loan term", "3 \u2013 12 months"],
         ["Expected PD", "1.5 \u2013 2.0%"],
         ["Primary motivation", "Cash flow preservation, convenience"],
         ["Acquisition channel", "Medical aid scheme partnerships, employer wellness programmes, provider referral"]],
        [3500, 5526]
    ))
    p.append(sp(60))
    p.append(body_b("PaySick product fit: ", "Gap financing for the difference between medical aid reimbursement and actual procedure cost. Short-term, small to medium loans with rapid approval. This segment functions as the low-risk anchor of the portfolio, the actuarial bedrock upon which a diversified healthcare lending book is constructed."))

    p.append(h2("3.2 Segment 2: Uninsured Out-of-Pocket Private Healthcare Users"))
    p.append(body("Research published in BMC Public Health estimates that up to 28% of the South African population access private primary healthcare services, with a meaningful proportion of the low-income, uninsured population paying out-of-pocket (De Villiers et al., 2021). The New England Journal of Medicine reports that up to 25% of uninsured South Africans pay out-of-pocket for private-sector care (Mayosi & Benatar, 2014). Applied to the approximately 45 million uninsured individuals, this yields an estimated 11.25 million people who already use private healthcare without insurance. PaySick\u2019s addressable subset is the adult cohort with verifiable income, estimated at 9.9 million individuals."))
    p.append(h3("Income Profile"))
    p.append(body("This segment spans LSM 5\u20138, earning between R4,165 and R13,210 or more per month (SAARF, 2023). They are employed but in occupations that do not provide employer-subsidised medical scheme access: retail, hospitality, construction, domestic work, the gig economy, and the informal sector. Many earn R8,000 to R15,000 per month, sufficient to cover a private GP consultation at R400 to R800 but insufficient to absorb a R12,000 or greater hospital procedure without financing. Consumer healthcare spending per capita in South Africa is forecast at approximately US$304 for 2025 (Statista, 2025). For this segment, healthcare spending is reactive and cash-constrained."))
    p.append(h3("Buying Power and Healthcare-Seeking Behaviour"))
    p.append(body("These individuals choose private care over the free public alternative specifically because of perceived quality and speed. Research confirms that the perceived benefits and quality of care are a strong contributing factor to patient movement between sectors, particularly when care is deemed urgent or critical and funds make this possible (De Villiers et al., 2021). They are willing payers constrained by lump-sum pricing, not unwilling payers."))
    p.append(body("Their current coping mechanisms for medical expenses include: informal borrowing from family networks (most common, carrying relationship costs and social debt), mashonisa or informal lenders charging 30\u201350% effective annual rates, credit card cash advances at 20%+ rates, or complete deferral of care until emergency presentation. DebtBusters\u2019 Quarterly Debt Index for Q2 2024 reports that South Africans earning the average middle-income salary spend 63% of their income on debt repayments (DebtBusters, 2024). This segment is debt-heavy but services its obligations. They are mobile-first, with over 72% smartphone penetration enabling digital onboarding, and community-connected, meaning provider referral at the point of care carries high trust and conversion."))
    p.append(h3("Behavioural Attributes"))
    p.append(body("Understanding the behavioural distinction between this segment and the medical aid holder segment is essential for underwriting calibration. These patients present at the point of care with genuine clinical need and limited financial flexibility. Their default risk is higher not because of moral hazard but because of genuine income volatility: they are more exposed to retrenchment, informal employment fluctuation, and household financial shocks. However, medical debt carries a unique behavioural dynamic. Research across multiple markets demonstrates that patients prioritise healthcare debt repayment over other consumer obligations because the debt is tied to a tangible personal or family health outcome and because the provider relationship creates social accountability absent in anonymous retail credit (Prospect Capital Management, 2025)."))
    p.append(TBL(
        ["Attribute", "Segment 2: OOP Private Healthcare Users"],
        [["Population size", "~9.9 million adults with verifiable income"],
         ["LSM classification", "LSM 5\u20138 (emerging middle to middle class)"],
         ["Monthly household income", "R4,000 \u2013 R15,000 per month"],
         ["Employment status", "Employed (formal and informal), no employer scheme"],
         ["Banking status", "Banked (Capitec, FNB eWallet, or similar), limited credit history"],
         ["Digital readiness", "Moderate-high: smartphone, WhatsApp, USSD banking"],
         ["Average loan requirement", "R5,000 \u2013 R45,000 (full procedure cost)"],
         ["Loan term", "6 \u2013 36 months"],
         ["Expected PD", "3.0 \u2013 4.5%"],
         ["Primary motivation", "Access: cannot afford lump sum, chooses private over public"],
         ["Debt-to-income ratio (pre-loan)", "45 \u2013 63% (DebtBusters Q2 2024 benchmark)"],
         ["Acquisition channel", "Provider referral at point of care, community health networks"]],
        [3500, 5526]
    ))
    p.append(sp(60))
    p.append(body_b("PaySick product fit: ", "Full procedure financing for planned and semi-urgent procedures. Medium-term loans requiring the strictest underwriting controls, including mandatory bank statement verification, hard affordability ceilings, and credit life insurance wrapping. This segment represents the largest volume opportunity but demands the full deployment of the PaySick Shield Framework described in Section 7."))

    p.append(h2("3.3 Combined Addressable Market and Portfolio Construction"))
    p.append(body("The combined addressable population of 19.6 million adults creates a natural portfolio diversification strategy. Segment 1 provides the low-risk anchor with high margins and rapid repayment, while Segment 2 provides volume growth with acceptable risk when properly underwritten. The optimal portfolio blend targets 40\u201350% gap financing (Segment 1) and 50\u201360% full procedure financing (Segment 2) by value, producing a blended portfolio PD of 2.5\u20133.5%."))
    p.append(TBL(
        ["Portfolio Metric", "Segment 1 (Gap)", "Segment 2 (OOP)", "Blended Portfolio"],
        [["Population", "~9.7 million", "~9.9 million", "~19.6 million"],
         ["Income range", "R13K \u2013 R32K+/mo", "R4K \u2013 R15K/mo", "R4K \u2013 R32K+/mo"],
         ["Avg. loan size", "R14,000", "R25,000", "R20,000"],
         ["Expected PD", "1.5 \u2013 2.0%", "3.0 \u2013 4.5%", "2.5 \u2013 3.5%"],
         ["Expected LGD", "30 \u2013 35%", "40 \u2013 50%", "35 \u2013 45%"],
         ["Net loss rate", "0.45 \u2013 0.70%", "1.20 \u2013 2.25%", "0.88 \u2013 1.58%"],
         ["Target portfolio share", "40 \u2013 50% by value", "50 \u2013 60% by value", "100%"]],
        [2250, 2250, 2250, 2276]
    ))

    p.append(h2("3.4 The Excluded Population: Why the Floor Matters"))
    p.append(body("Equally critical is defining who PaySick does not serve. Approximately 25 million South Africans in LSM 1\u20134 earn below R4,000 per month and cannot sustain any meaningful loan repayment without breaching the 15\u201320% affordability ceiling. At R3,500 monthly income, a 15% affordability cap permits only R525 in monthly repayments, insufficient to service even a R5,000 loan over 12 months at prime + 8%. These individuals are served by the public healthcare system and social grants. PaySick\u2019s hard affordability controls structurally prevent lending to this population. This is simultaneously an ethical safeguard, preventing predatory over-extension into vulnerable populations, and a credit quality mechanism that ensures the portfolio floor remains above the minimum income threshold for sustainable repayment. No override, no exception, no manual approval can breach this floor. It is coded into the underwriting algorithm."))
    p.append(body("This exclusion differentiates PaySick from retail BNPL platforms, which routinely approve borrowers with insufficient repayment capacity. The CFPB (2024) documented that 78% of subprime applicants were approved for BNPL, a practice PaySick explicitly rejects. The affordability floor is the single most important structural control against portfolio deterioration, and it is absolute."))

    # ─── SECTION 4: ANATOMY OF LOSS ──────────────────────────
    p.append(slabel("Section 04"))
    p.append(h1("Anatomy of Loss: What Causes a Loss-Making Book"))
    p.append(h1_bar())
    p.append(body("Understanding loss in healthcare lending requires decomposing the drivers beyond simple default rate analysis. There are five distinct risk drivers, each with different triggers, velocities, and mitigation strategies."))

    p.append(h2("4.1 The Five Risk Drivers"))
    p.append(TBL(
        ["Risk Driver", "Mechanism", "Trigger Scenario", "Velocity"],
        [["1. Default Rate (PD)", "Patients stop making repayments due to income loss, financial stress, or procedure disputes", "Macro recession, adverse selection at onboarding, procedure regret", "Medium: visible in 60\u201390 day arrears data"],
         ["2. Recovery Rate (LGD)", "Defaults occur and recovery through collections is poor due to lack of collateral", "Medical debt has no physical collateral; legal recovery is expensive relative to loan size", "Slow: LGD crystallises over 6\u201312 months post-default"],
         ["3. Concentration Risk", "Excessive exposure to a single provider, procedure type, or geography", "Key provider goes under; one procedure category has structurally higher default rates", "Fast: concentrated exposure amplifies any localised shock"],
         ["4. Funding Cost Squeeze", "Cost of capital rises but existing fixed-term loans cannot be repriced", "Interest rate hikes; lender withdrawal forces higher-cost balance sheet funding", "Gradual: margin compression over quarters"],
         ["5. Lender Withdrawal", "Marketplace lenders exit during stress, forcing volume onto PaySick\u2019s balance sheet", "Portfolio quality deteriorates; lenders reduce allocation or pause entirely", "Fast: lender decisions are binary and can cascade"]],
        [1800, 2600, 2600, 2026]
    ))

    p.append(h2("4.2 Alternative Recovery Strategies: Reducing LGD Below Market Norms"))
    p.append(body("The target LGD of 45% assumes conventional unsecured recovery. However, PaySick\u2019s healthcare-specific model enables four alternative recovery mechanisms that can structurally reduce LGD to 25\u201335%, a level unachievable by generic consumer lenders:"))
    p.append(num(1, " Deduct from future provider payouts when a referred patient defaults. If a provider\u2019s patient defaults on a R18,500 loan and PaySick holds R1,850 in future payout reserves for that provider, the effective LGD on that loan drops from 45% to 35%. This mechanism is unique to B2B2C models where the referral channel has an ongoing commercial relationship with the platform.", prefix="Provider Holdback and Clawback:"))
    p.append(num(2, " Where a patient has partial medical aid coverage, structure the loan so the medical aid reimbursement portion is assigned directly to PaySick. This converts a portion of unsecured lending into quasi-secured lending backed by an institutional payer. In gap-financing scenarios, this can reduce the unsecured residual by 40\u201360%.", prefix="Medical Aid Assignment:"))
    p.append(num(3, " Under the National Credit Act, PaySick can apply for employer deduction orders for employed borrowers who default. This gives PaySick\u2019s claim priority over discretionary spending and converts recovery from a collections exercise into a payroll deduction. Available for formally employed borrowers, which should constitute 60\u201370% of the book.", prefix="Emoluments Attachment Orders:"))
    p.append(num(4, " Partner with credit life insurers to wrap each loan with death, disability, and retrenchment cover. The insurance premium is included in the loan cost. In the event of a covered life event, the insurer pays out the outstanding balance in full. This mechanism alone can reduce effective LGD from 45% to 25\u201330% by converting the three primary default triggers (death, disability, job loss) into insured events.", prefix="Credit Life Insurance Wrapping:"))
    p.append(callout("Blended LGD Projection with Recovery Strategies\nBase LGD (no strategies): 45%\nWith provider holdback (10% of loans): LGD reduces to ~42%\nWith medical aid assignment (20% of loans): LGD reduces to ~37%\nWith emoluments attachment (60% of employed defaulters): LGD reduces to ~32%\nWith credit life insurance (all loans): LGD reduces to ~27%\nBlended LGD with all strategies active: 25\u201330%\nImpact on net loss rate: reduces from 1.44% (base) to 0.80\u20130.96%"))

    p.append(h2("4.3 The Loss Equation"))
    p.append(body("The fundamental loss equation for PaySick\u2019s balance sheet book is:"))
    p.append(callout_s("Net Loss Rate = Probability of Default (PD) \u00d7 Loss Given Default (LGD)"))
    p.append(body("Break-even occurs when Net Loss Rate exceeds Blended Revenue per Loan. With PaySick\u2019s target revenue of R1,850 per R18,500 loan (10% blended yield), the break-even net loss rate is 10%. At target LGD of 45%, this implies a break-even PD of approximately 22%. At stress LGD of 70%, break-even PD is approximately 14%."))

    p.append(h2("4.4 Cost of Capital Analysis: Optimal Rate and Global Comparison"))
    p.append(body("South Africa\u2019s current repo rate of 6.75% (January 2026), with prime lending at 10.25%, positions PaySick\u2019s cost of capital favourably. Following six consecutive rate cuts totalling 150 basis points since September 2024, the monetary policy cycle is actively improving margin structure. Further cuts are anticipated, with analysts projecting a repo rate of 6.25% by late 2026."))
    p.append(body("PaySick\u2019s optimal cost of capital structure on balance sheet lending targets repo + 200\u2013300 basis points (8.75\u20139.75% blended funding cost), lending to patients at prime + 5\u20138% (15.25\u201318.25% APR), generating a net interest margin (NIM) of 5.5\u20138.5%. This NIM must absorb the target net loss rate of 1.44%, operating costs, and profit margin."))
    p.append(TBL(
        ["Market", "Policy Rate", "Funding Cost", "Lending Rate", "NIM Opportunity", "Favourability"],
        [["South Africa", "6.75% (declining)", "8.75\u20139.75%", "15\u201318%", "5.5\u20138.5%", "High"],
         ["Kenya", "10.0%", "12\u201314%", "20\u201324%", "6\u201310%", "High (higher risk)"],
         ["India", "6.5%", "8\u201310%", "14\u201318%", "5\u20138%", "High (scale advantage)"],
         ["Nigeria", "27.5%", "30\u201335%", "35\u201345%", "5\u201310%", "Moderate (FX risk)"],
         ["United Kingdom", "4.5%", "5\u20137%", "8\u201315%", "3\u20136%", "Moderate (competitive)"],
         ["Southeast Asia (avg)", "4\u20136%", "6\u20138%", "10\u201316%", "4\u20136%", "Moderate (tight margins)"]],
        [1500, 1500, 1500, 1500, 1500, 1526]
    ))
    p.append(sp(60))
    p.append(body("South Africa occupies a favourable position: mature banking infrastructure enabling efficient funding, moderate and declining cost of capital, a strong legal framework for debt recovery under the NCA, and a large addressable market with no incumbent. The declining rate cycle creates a window where PaySick can lock in favourable funding terms while the book is small and renegotiate as scale provides leverage. Kenya and India represent the most favourable expansion markets from a cost-of-capital perspective, while Nigeria\u2019s high rates create attractive NIM but introduce significant currency depreciation risk that must be hedged."))

    # ─── SECTION 5: SCENARIO ANALYSIS ────────────────────────
    p.append(slabel("Section 05"))
    p.append(h1("Scenario Analysis: Quantifying Loss Under Stress"))
    p.append(h1_bar())

    p.append(h2("5.1 Default Rate Derivation Methodology"))
    p.append(body("The default rate assumptions used throughout this analysis are derived from empirical data, adjusted for South Africa\u2019s specific risk environment. A CRO reviewing these numbers should understand the derivation chain:"))
    p.append(body_b("Base PD of 3.2% derivation: ", "Healthcare loans globally have maintained a cumulative default rate of 1.6% over the period 2000\u20132025, according to PitchBook LCD data cited by Prospect Capital Management. This represents institutional healthcare lending in mature markets (primarily U.S.). We apply a 2x multiplier to account for: (a) South Africa\u2019s higher structural unemployment rate of approximately 32% versus approximately 4% in the U.S., (b) emerging market risk premium reflecting currency volatility and weaker institutional frameworks, and (c) PaySick\u2019s early-stage portfolio concentration versus diversified institutional portfolios. The resulting 3.2% target PD is conservative relative to the 1.6% global benchmark while remaining realistic for a well-underwritten South African healthcare book."))
    p.append(body_b("Scenario progression logic: ", "The Conservative scenario PD of 5.0% aligns with South African personal loan averages for employed borrowers. The Stress scenario PD of 8.0% represents the lower bound of retail BNPL delinquency rates. The Crisis scenario of 12.0% reflects the upper bound of retail BNPL experience where 42% of users report late payments. The Catastrophic scenario of 15.0% represents deep subprime unsecured lending in a recessionary environment, a level that has been observed in South African micro-lending during economic contractions."))
    p.append(body_b("Retail BNPL benchmark of 8\u201312% derivation: ", "The Richmond Federal Reserve (2025) reported that top-five BNPL lenders had charge-off rates of 2.39% in 2021, but this understates true losses because BNPL loans are short-duration. When annualised, effective default rates on a portfolio basis are 8\u201312%. LendingTree data shows 42% of BNPL users made at least one late payment in 2025, up from 34% in 2023. Klarna reported a 17% increase in credit losses to $137 million in Q1 2025. The CFPB found that 78% of subprime applicants were approved for BNPL, indicating systematic adverse selection."))

    p.append(h2("5.2 Balance Sheet Book Scenarios"))
    p.append(body("The following table models six scenarios across PaySick\u2019s balance sheet lending book, based on an average loan of R18,500 and blended revenue per loan of R1,850 (10%)."))
    p.append(TBL(
        ["Scenario", "PD", "LGD", "Net Loss", "Revenue", "Loss/Loan", "Net/Loan", "Viable?"],
        [["Optimistic", "2.0%", "40%", "0.8%", "R1,850", "R148", "R1,702", "Yes"],
         ["Base Case", "3.2%", "45%", "1.44%", "R1,850", "R266", "R1,584", "Yes"],
         ["Conservative", "5.0%", "50%", "2.5%", "R1,850", "R463", "R1,387", "Yes"],
         ["Stress", "8.0%", "55%", "4.4%", "R1,850", "R814", "R1,036", "Tight"],
         ["Crisis", "12.0%", "65%", "7.8%", "R1,850", "R1,443", "R407", "Barely"],
         ["Catastrophic", "15.0%", "70%", "10.5%", "R1,850", "R1,943", "\u2013R93", "No"]],
        [1300, 900, 900, 1100, 1200, 1200, 1200, 1226]
    ))
    p.append(callout("Key Finding: Break-Even Default Rate\nThe balance sheet book becomes loss-making only at PD of approximately 14\u201315% combined with LGD of 65\u201370%. This is 4\u20135x PaySick\u2019s target PD and deep into unsecured retail lending territory. Even under a stress scenario (PD 8%), the book generates R1,036 net revenue per loan."))

    p.append(h2("5.3 Marketplace Book Risk Analysis"))
    p.append(body("On marketplace loans, PaySick earns 2\u20134% origination regardless of default. The risk is not credit loss but lender churn:"))
    p.append(TBL(
        ["Scenario", "Marketplace Default Rate", "Lender Response", "PaySick Impact"],
        [["Base", "3\u20134%", "Lenders expand allocation", "Fee income grows"],
         ["Elevated", "5\u20137%", "Lenders tighten criteria", "Fee income drops 20\u201330%"],
         ["Stress", "8\u201310%", "Lenders pause or exit", "Forced to balance sheet"],
         ["Crisis", "12%+", "Lenders exit platform", "Marketplace collapse"]],
        [1800, 2400, 2400, 2426]
    ))

    p.append(h2("5.4 Combined Stress Testing"))
    p.append(body("The most dangerous scenario is a quality spiral: deteriorating approval quality causes lender withdrawal, which forces more volume onto the balance sheet at precisely the moment when credit quality is weakest. This self-reinforcing loop is the single greatest existential risk to any healthcare lending marketplace."))
    p.append(body_b("The Cascade Sequence: ", "Provider pushes unaffordable patients \u2192 PaySick approves due to loose underwriting \u2192 bad lenders fill the gap as good lenders withdraw \u2192 patient has poor outcome combined with unaffordable debt \u2192 defaults spike \u2192 good lenders leave \u2192 more pressure on balance sheet \u2192 tighter cash forces lower underwriting standards to maintain volume \u2192 further deterioration."))
    p.append(callout("Every mitigation strategy in this paper is designed to break this chain at multiple points simultaneously. No single control is sufficient."))

    return p

if __name__ == "__main__":
    print("Part 2 loaded.")
