#!/usr/bin/env python3
"""Part 2: Sections 3-6"""

from generate_docx_part1 import *

def build_body_part2():
    parts = []

    # ══════════════════════════════════════════════════════════
    # SECTION 3: ADDRESSABLE POPULATION
    # ══════════════════════════════════════════════════════════
    parts.append(section_label("Section 03"))
    parts.append(heading1("Addressable Population Analysis: Quantifying the Target Market", page_break=True))
    parts.append(accent_bar())

    parts.append(body("A robust risk framework requires a precise understanding of the population to which it will be applied. PaySick\u2019s addressable market is not the full 63 million South African population. It is two precisely defined segments totalling approximately 19.6 million adults, each with distinct income profiles, behavioural attributes, and risk characteristics. This section quantifies both segments with the specificity required for actuarial modelling and credit committee approval."))

    parts.append(heading2("3.1 Segment 1: Medical Aid Holders Requiring Gap Financing"))
    parts.append(body("Approximately 9.7 million South Africans hold medical aid coverage (Statistics South Africa, 2023). These individuals are formally employed and predominantly fall within LSM 8\u201310, the upper-middle to affluent living standards tiers. Discovery Bank\u2019s SpendTrend 2024 report categorises middle-income South Africans as earning between R100,000 and R350,000 per annum, approximately R8,000 to R29,000 per month (Discovery Bank, 2024). Medical aid holders skew to the upper end of this distribution, as monthly scheme contributions of R2,000 to R6,000 require substantial disposable income."))

    parts.append(heading3("Buying Power"))
    parts.append(body("Medical scheme members already spend on healthcare, but scheme coverage is not complete. The Council for Medical Schemes reports that medical schemes expend an average of 92% of member contributions on healthcare costs (Council for Medical Schemes, 2018), yet co-payments, specialist shortfalls, and procedures exceeding Prescribed Minimum Benefits create out-of-pocket exposure ranging from R5,000 to R50,000 per procedure depending on complexity and scheme tier. Per-capita private healthcare expenditure in South Africa was approximately R22,891 (approximately $1,242) in 2019, compared to R4,667 ($253) in the public sector (Schneider et al., 2024). This 4.9x expenditure gap means even insured patients face significant residual costs."))

    parts.append(heading3("Behavioural Attributes"))
    parts.append(body("This segment is financially literate, fully banked, smartphone-enabled, and accustomed to structured credit products. They hold existing home loans, vehicle finance, and insurance policies. Their decision to use PaySick is not driven by inability to pay, but by a preference to preserve cash flow and avoid liquidating savings for an unexpected medical shortfall. In credit risk terminology, these are convenience borrowers: they could pay the full amount but prefer structured instalments. This behavioural profile produces the lowest probability of default in the portfolio."))

    # Segment 1 table
    parts.append(make_table(
        ["Attribute", "Segment 1: Gap Financing"],
        [
            ["Population size", "~9.7 million individuals"],
            ["LSM classification", "LSM 8\u201310 (upper-middle to affluent)"],
            ["Monthly household income", "R13,000 \u2013 R32,000+ per month"],
            ["Employment status", "Formally employed, employer-subsidised scheme"],
            ["Banking status", "Fully banked, multiple credit facilities"],
            ["Digital readiness", "High: smartphone, app-literate, digital payments"],
            ["Average loan requirement", "R3,000 \u2013 R25,000 (gap amount)"],
            ["Loan term", "3 \u2013 12 months"],
            ["Expected PD", "1.5 \u2013 2.0%"],
            ["Primary motivation", "Cash flow preservation, convenience"],
            ["Acquisition channel", "Medical aid scheme partnerships, employer wellness programmes, provider referral"],
        ],
        [3500, 5500]
    ))
    parts.append(spacer(40))
    parts.append(body_runs([make_run("PaySick product fit: ", bold=True, size=11, color=DARK_TEXT, font="Segoe UI"), make_run("Gap financing for the difference between medical aid reimbursement and actual procedure cost. Short-term, small to medium loans with rapid approval. This segment functions as the low-risk anchor of the portfolio, the actuarial bedrock upon which a diversified healthcare lending book is constructed.", size=11, color=BODY_TEXT, font="Segoe UI")]))

    parts.append(heading2("3.2 Segment 2: Uninsured Out-of-Pocket Private Healthcare Users"))
    parts.append(body("Research published in BMC Public Health estimates that up to 28% of the South African population access private primary healthcare services, with a meaningful proportion of the low-income, uninsured population paying out-of-pocket (De Villiers et al., 2021). The New England Journal of Medicine reports that up to 25% of uninsured South Africans pay out-of-pocket for private-sector care (Mayosi & Benatar, 2014). Applied to the approximately 45 million uninsured individuals, this yields an estimated 11.25 million people who already use private healthcare without insurance. PaySick\u2019s addressable subset is the adult cohort with verifiable income, estimated at 9.9 million individuals."))

    parts.append(heading3("Income Profile"))
    parts.append(body("This segment spans LSM 5\u20138, earning between R4,165 and R13,210 or more per month (SAARF, 2023). They are employed but in occupations that do not provide employer-subsidised medical scheme access: retail, hospitality, construction, domestic work, the gig economy, and the informal sector. Many earn R8,000 to R15,000 per month, sufficient to cover a private GP consultation at R400 to R800 but insufficient to absorb a R12,000 or greater hospital procedure without financing. Consumer healthcare spending per capita in South Africa is forecast at approximately US$304 for 2025 (Statista, 2025). For this segment, healthcare spending is reactive and cash-constrained."))

    parts.append(heading3("Buying Power and Healthcare-Seeking Behaviour"))
    parts.append(body("These individuals choose private care over the free public alternative specifically because of perceived quality and speed. Research confirms that the perceived benefits and quality of care are a strong contributing factor to patient movement between sectors, particularly when care is deemed urgent or critical and funds make this possible (De Villiers et al., 2021). They are willing payers constrained by lump-sum pricing, not unwilling payers."))
    parts.append(body("Their current coping mechanisms for medical expenses include: informal borrowing from family networks (most common, carrying relationship costs and social debt), mashonisa or informal lenders charging 30\u201350% effective annual rates, credit card cash advances at 20%+ rates, or complete deferral of care until emergency presentation. DebtBusters\u2019 Quarterly Debt Index for Q2 2024 reports that South Africans earning the average middle-income salary spend 63% of their income on debt repayments (DebtBusters, 2024). This segment is debt-heavy but services its obligations. They are mobile-first, with over 72% smartphone penetration enabling digital onboarding, and community-connected, meaning provider referral at the point of care carries high trust and conversion."))

    parts.append(heading3("Behavioural Attributes"))
    parts.append(body("Understanding the behavioural distinction between this segment and the medical aid holder segment is essential for underwriting calibration. These patients present at the point of care with genuine clinical need and limited financial flexibility. Their default risk is higher not because of moral hazard but because of genuine income volatility: they are more exposed to retrenchment, informal employment fluctuation, and household financial shocks. However, medical debt carries a unique behavioural dynamic. Research across multiple markets demonstrates that patients prioritise healthcare debt repayment over other consumer obligations because the debt is tied to a tangible personal or family health outcome and because the provider relationship creates social accountability absent in anonymous retail credit (Prospect Capital Management, 2025)."))

    # Segment 2 table
    parts.append(make_table(
        ["Attribute", "Segment 2: OOP Private Healthcare Users"],
        [
            ["Population size", "~9.9 million adults with verifiable income"],
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
            ["Acquisition channel", "Provider referral at point of care, community health networks"],
        ],
        [3500, 5500]
    ))
    parts.append(spacer(40))
    parts.append(body_runs([make_run("PaySick product fit: ", bold=True, size=11, color=DARK_TEXT, font="Segoe UI"), make_run("Full procedure financing for planned and semi-urgent procedures. Medium-term loans requiring the strictest underwriting controls, including mandatory bank statement verification, hard affordability ceilings, and credit life insurance wrapping. This segment represents the largest volume opportunity but demands the full deployment of the PaySick Shield Framework described in Section 7.", size=11, color=BODY_TEXT, font="Segoe UI")]))

    parts.append(heading2("3.3 Combined Addressable Market and Portfolio Construction"))
    parts.append(body("The combined addressable population of 19.6 million adults creates a natural portfolio diversification strategy. Segment 1 provides the low-risk anchor with high margins and rapid repayment, while Segment 2 provides volume growth with acceptable risk when properly underwritten. The optimal portfolio blend targets 40\u201350% gap financing (Segment 1) and 50\u201360% full procedure financing (Segment 2) by value, producing a blended portfolio PD of 2.5\u20133.5%."))

    parts.append(make_table(
        ["Portfolio Metric", "Segment 1 (Gap)", "Segment 2 (OOP)", "Blended Portfolio"],
        [
            ["Population", "~9.7 million", "~9.9 million", "~19.6 million"],
            ["Income range", "R13K \u2013 R32K+/mo", "R4K \u2013 R15K/mo", "R4K \u2013 R32K+/mo"],
            ["Avg. loan size", "R14,000", "R25,000", "R20,000"],
            ["Expected PD", "1.5 \u2013 2.0%", "3.0 \u2013 4.5%", "2.5 \u2013 3.5%"],
            ["Expected LGD", "30 \u2013 35%", "40 \u2013 50%", "35 \u2013 45%"],
            ["Net loss rate", "0.45 \u2013 0.70%", "1.20 \u2013 2.25%", "0.88 \u2013 1.58%"],
            ["Target portfolio share", "40 \u2013 50% by value", "50 \u2013 60% by value", "100%"],
        ],
        [2250, 2250, 2250, 2250]
    ))

    parts.append(heading2("3.4 The Excluded Population: Why the Floor Matters"))
    parts.append(body("Equally critical is defining who PaySick does not serve. Approximately 25 million South Africans in LSM 1\u20134 earn below R4,000 per month and cannot sustain any meaningful loan repayment without breaching the 15\u201320% affordability ceiling. At R3,500 monthly income, a 15% affordability cap permits only R525 in monthly repayments, insufficient to service even a R5,000 loan over 12 months at prime + 8%. These individuals are served by the public healthcare system and social grants. PaySick\u2019s hard affordability controls structurally prevent lending to this population. This is simultaneously an ethical safeguard, preventing predatory over-extension into vulnerable populations, and a credit quality mechanism that ensures the portfolio floor remains above the minimum income threshold for sustainable repayment. No override, no exception, no manual approval can breach this floor. It is coded into the underwriting algorithm."))
    parts.append(body("This exclusion differentiates PaySick from retail BNPL platforms, which routinely approve borrowers with insufficient repayment capacity. The CFPB (2024) documented that 78% of subprime applicants were approved for BNPL, a practice PaySick explicitly rejects. The affordability floor is the single most important structural control against portfolio deterioration, and it is absolute."))

    # ══════════════════════════════════════════════════════════
    # SECTION 4: ANATOMY OF LOSS
    # ══════════════════════════════════════════════════════════
    parts.append(section_label("Section 04"))
    parts.append(heading1("Anatomy of Loss: What Causes a Loss-Making Book", page_break=True))
    parts.append(accent_bar())

    parts.append(body("Understanding loss in healthcare lending requires decomposing the drivers beyond simple default rate analysis. There are five distinct risk drivers, each with different triggers, velocities, and mitigation strategies."))

    parts.append(heading2("4.1 The Five Risk Drivers"))
    parts.append(make_table(
        ["Risk Driver", "Mechanism", "Trigger Scenario", "Velocity"],
        [
            ["1. Default Rate (PD)", "Patients stop making repayments due to income loss, financial stress, or procedure disputes", "Macro recession, adverse selection at onboarding, procedure regret", "Medium: visible in 60\u201390 day arrears data"],
            ["2. Recovery Rate (LGD)", "Defaults occur and recovery through collections is poor due to lack of collateral", "Medical debt has no physical collateral; legal recovery is expensive relative to loan size", "Slow: LGD crystallises over 6\u201312 months post-default"],
            ["3. Concentration Risk", "Excessive exposure to a single provider, procedure type, or geography", "Key provider goes under; one procedure category has structurally higher default rates", "Fast: concentrated exposure amplifies any localised shock"],
            ["4. Funding Cost Squeeze", "Cost of capital rises but existing fixed-term loans cannot be repriced", "Interest rate hikes; lender withdrawal forces higher-cost balance sheet funding", "Gradual: margin compression over quarters"],
            ["5. Lender Withdrawal", "Marketplace lenders exit during stress, forcing volume onto PaySick\u2019s balance sheet", "Portfolio quality deteriorates; lenders reduce allocation or pause entirely", "Fast: lender decisions are binary and can cascade"],
        ],
        [1800, 2600, 2600, 2000]
    ))

    parts.append(heading2("4.2 Alternative Recovery Strategies: Reducing LGD Below Market Norms"))
    parts.append(body("The target LGD of 45% assumes conventional unsecured recovery. However, PaySick\u2019s healthcare-specific model enables four alternative recovery mechanisms that can structurally reduce LGD to 25\u201335%, a level unachievable by generic consumer lenders:"))

    parts.append(numbered(1, " Deduct from future provider payouts when a referred patient defaults. If a provider\u2019s patient defaults on a R18,500 loan and PaySick holds R1,850 in future payout reserves for that provider, the effective LGD on that loan drops from 45% to 35%. This mechanism is unique to B2B2C models where the referral channel has an ongoing commercial relationship with the platform.", bold_prefix="Provider Holdback and Clawback:"))
    parts.append(numbered(2, " Where a patient has partial medical aid coverage, structure the loan so the medical aid reimbursement portion is assigned directly to PaySick. This converts a portion of unsecured lending into quasi-secured lending backed by an institutional payer. In gap-financing scenarios, this can reduce the unsecured residual by 40\u201360%.", bold_prefix="Medical Aid Assignment:"))
    parts.append(numbered(3, " Under the National Credit Act, PaySick can apply for employer deduction orders for employed borrowers who default. This gives PaySick\u2019s claim priority over discretionary spending and converts recovery from a collections exercise into a payroll deduction. Available for formally employed borrowers, which should constitute 60\u201370% of the book.", bold_prefix="Emoluments Attachment Orders:"))
    parts.append(numbered(4, " Partner with credit life insurers to wrap each loan with death, disability, and retrenchment cover. The insurance premium is included in the loan cost. In the event of a covered life event, the insurer pays out the outstanding balance in full. This mechanism alone can reduce effective LGD from 45% to 25\u201330% by converting the three primary default triggers (death, disability, job loss) into insured events.", bold_prefix="Credit Life Insurance Wrapping:"))

    parts.append(callout("Blended LGD Projection with Recovery Strategies\n\nBase LGD (no strategies): 45%\nWith provider holdback (10% of loans): LGD reduces to ~42%\nWith medical aid assignment (20% of loans): LGD reduces to ~37%\nWith emoluments attachment (60% of employed defaulters): LGD reduces to ~32%\nWith credit life insurance (all loans): LGD reduces to ~27%\nBlended LGD with all strategies active: 25\u201330%\nImpact on net loss rate: reduces from 1.44% (base) to 0.80\u20130.96%"))

    parts.append(heading2("4.3 The Loss Equation"))
    parts.append(body("The fundamental loss equation for PaySick\u2019s balance sheet book is:"))
    parts.append(callout_subtle("Net Loss Rate = Probability of Default (PD) \u00d7 Loss Given Default (LGD)"))
    parts.append(body("Break-even occurs when Net Loss Rate exceeds Blended Revenue per Loan. With PaySick\u2019s target revenue of R1,850 per R18,500 loan (10% blended yield), the break-even net loss rate is 10%. At target LGD of 45%, this implies a break-even PD of approximately 22%. At stress LGD of 70%, break-even PD is approximately 14%."))

    parts.append(heading2("4.4 Cost of Capital Analysis: Optimal Rate and Global Comparison"))
    parts.append(body("South Africa\u2019s current repo rate of 6.75% (January 2026), with prime lending at 10.25%, positions PaySick\u2019s cost of capital favourably. Following six consecutive rate cuts totalling 150 basis points since September 2024, the monetary policy cycle is actively improving margin structure. Further cuts are anticipated, with analysts projecting a repo rate of 6.25% by late 2026."))
    parts.append(body("PaySick\u2019s optimal cost of capital structure on balance sheet lending targets repo + 200\u2013300 basis points (8.75\u20139.75% blended funding cost), lending to patients at prime + 5\u20138% (15.25\u201318.25% APR), generating a net interest margin (NIM) of 5.5\u20138.5%. This NIM must absorb the target net loss rate of 1.44%, operating costs, and profit margin."))

    parts.append(make_table(
        ["Market", "Policy Rate", "Funding Cost", "Lending Rate", "NIM Opportunity", "Favourability"],
        [
            ["South Africa", "6.75% (declining)", "8.75\u20139.75%", "15\u201318%", "5.5\u20138.5%", "High"],
            ["Kenya", "10.0%", "12\u201314%", "20\u201324%", "6\u201310%", "High (higher risk)"],
            ["India", "6.5%", "8\u201310%", "14\u201318%", "5\u20138%", "High (scale advantage)"],
            ["Nigeria", "27.5%", "30\u201335%", "35\u201345%", "5\u201310%", "Moderate (FX risk)"],
            ["United Kingdom", "4.5%", "5\u20137%", "8\u201315%", "3\u20136%", "Moderate (competitive)"],
            ["Southeast Asia (avg)", "4\u20136%", "6\u20138%", "10\u201316%", "4\u20136%", "Moderate (tight margins)"],
        ],
        [1500, 1500, 1500, 1500, 1500, 1500]
    ))
    parts.append(spacer(40))
    parts.append(body("South Africa occupies a favourable position: mature banking infrastructure enabling efficient funding, moderate and declining cost of capital, a strong legal framework for debt recovery under the NCA, and a large addressable market with no incumbent. The declining rate cycle creates a window where PaySick can lock in favourable funding terms while the book is small and renegotiate as scale provides leverage. Kenya and India represent the most favourable expansion markets from a cost-of-capital perspective, while Nigeria\u2019s high rates create attractive NIM but introduce significant currency depreciation risk that must be hedged."))

    # ══════════════════════════════════════════════════════════
    # SECTION 5: SCENARIO ANALYSIS
    # ══════════════════════════════════════════════════════════
    parts.append(section_label("Section 05"))
    parts.append(heading1("Scenario Analysis: Quantifying Loss Under Stress", page_break=True))
    parts.append(accent_bar())

    parts.append(heading2("5.1 Default Rate Derivation Methodology"))
    parts.append(body("The default rate assumptions used throughout this analysis are derived from empirical data, adjusted for South Africa\u2019s specific risk environment. A CRO reviewing these numbers should understand the derivation chain:"))
    parts.append(body_runs([make_run("Base PD of 3.2% derivation: ", bold=True, size=11, color=DARK_TEXT, font="Segoe UI"), make_run("Healthcare loans globally have maintained a cumulative default rate of 1.6% over the period 2000\u20132025, according to PitchBook LCD data cited by Prospect Capital Management. This represents institutional healthcare lending in mature markets (primarily U.S.). We apply a 2x multiplier to account for: (a) South Africa\u2019s higher structural unemployment rate of approximately 32% versus approximately 4% in the U.S., (b) emerging market risk premium reflecting currency volatility and weaker institutional frameworks, and (c) PaySick\u2019s early-stage portfolio concentration versus diversified institutional portfolios. The resulting 3.2% target PD is conservative relative to the 1.6% global benchmark while remaining realistic for a well-underwritten South African healthcare book.", size=11, color=BODY_TEXT, font="Segoe UI")]))
    parts.append(body_runs([make_run("Scenario progression logic: ", bold=True, size=11, color=DARK_TEXT, font="Segoe UI"), make_run("The Conservative scenario PD of 5.0% aligns with South African personal loan averages for employed borrowers. The Stress scenario PD of 8.0% represents the lower bound of retail BNPL delinquency rates. The Crisis scenario of 12.0% reflects the upper bound of retail BNPL experience where 42% of users report late payments. The Catastrophic scenario of 15.0% represents deep subprime unsecured lending in a recessionary environment, a level that has been observed in South African micro-lending during economic contractions.", size=11, color=BODY_TEXT, font="Segoe UI")]))
    parts.append(body_runs([make_run("Retail BNPL benchmark of 8\u201312% derivation: ", bold=True, size=11, color=DARK_TEXT, font="Segoe UI"), make_run("The Richmond Federal Reserve (2025) reported that top-five BNPL lenders had charge-off rates of 2.39% in 2021, but this understates true losses because BNPL loans are short-duration. When annualised, effective default rates on a portfolio basis are 8\u201312%. LendingTree data shows 42% of BNPL users made at least one late payment in 2025, up from 34% in 2023. Klarna reported a 17% increase in credit losses to $137 million in Q1 2025. The CFPB found that 78% of subprime applicants were approved for BNPL, indicating systematic adverse selection.", size=11, color=BODY_TEXT, font="Segoe UI")]))

    parts.append(heading2("5.2 Balance Sheet Book Scenarios"))
    parts.append(body("The following table models six scenarios across PaySick\u2019s balance sheet lending book, based on an average loan of R18,500 and blended revenue per loan of R1,850 (10%)."))

    parts.append(make_table(
        ["Scenario", "PD", "LGD", "Net Loss", "Revenue", "Loss/Loan", "Net/Loan", "Viable?"],
        [
            ["Optimistic", "2.0%", "40%", "0.8%", "R1,850", "R148", "R1,702", "Yes"],
            ["Base Case", "3.2%", "45%", "1.44%", "R1,850", "R266", "R1,584", "Yes"],
            ["Conservative", "5.0%", "50%", "2.5%", "R1,850", "R463", "R1,387", "Yes"],
            ["Stress", "8.0%", "55%", "4.4%", "R1,850", "R814", "R1,036", "Tight"],
            ["Crisis", "12.0%", "65%", "7.8%", "R1,850", "R1,443", "R407", "Barely"],
            ["Catastrophic", "15.0%", "70%", "10.5%", "R1,850", "R1,943", "\u2013R93", "No"],
        ],
        [1200, 900, 900, 1100, 1200, 1200, 1200, 1300]
    ))

    parts.append(callout("Key Finding: Break-Even Default Rate\n\nThe balance sheet book becomes loss-making only at PD of approximately 14\u201315% combined with LGD of 65\u201370%. This is 4\u20135x PaySick\u2019s target PD and deep into unsecured retail lending territory. Even under a stress scenario (PD 8%), the book generates R1,036 net revenue per loan."))

    parts.append(heading2("5.3 Marketplace Book Risk Analysis"))
    parts.append(body("On marketplace loans, PaySick earns 2\u20134% origination regardless of default. The risk is not credit loss but lender churn:"))

    parts.append(make_table(
        ["Scenario", "Marketplace Default Rate", "Lender Response", "PaySick Impact"],
        [
            ["Base", "3\u20134%", "Lenders expand allocation", "Fee income grows"],
            ["Elevated", "5\u20137%", "Lenders tighten criteria", "Fee income drops 20\u201330%"],
            ["Stress", "8\u201310%", "Lenders pause or exit", "Forced to balance sheet"],
            ["Crisis", "12%+", "Lenders exit platform", "Marketplace collapse"],
        ],
        [1800, 2400, 2400, 2400]
    ))

    parts.append(heading2("5.4 Combined Stress Testing"))
    parts.append(body("The most dangerous scenario is a quality spiral: deteriorating approval quality causes lender withdrawal, which forces more volume onto the balance sheet at precisely the moment when credit quality is weakest. This self-reinforcing loop is the single greatest existential risk to any healthcare lending marketplace."))
    parts.append(body_runs([make_run("The Cascade Sequence: ", bold=True, size=11, color=DARK_TEXT, font="Segoe UI"), make_run("Provider pushes unaffordable patients \u2192 PaySick approves due to loose underwriting \u2192 bad lenders fill the gap as good lenders withdraw \u2192 patient has poor outcome combined with unaffordable debt \u2192 defaults spike \u2192 good lenders leave \u2192 more pressure on balance sheet \u2192 tighter cash forces lower underwriting standards to maintain volume \u2192 further deterioration.", size=11, color=BODY_TEXT, font="Segoe UI")]))
    parts.append(callout("Every mitigation strategy in this paper is designed to break this chain at multiple points simultaneously. No single control is sufficient."))

    return parts

if __name__ == "__main__":
    print("Part 2 loaded.")
