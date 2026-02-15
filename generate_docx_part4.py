#!/usr/bin/env python3
"""Part 4: Sections 10-11, References, and ZIP assembly."""
import zipfile, os
from generate_docx_part1 import *
from generate_docx_part2 import build_body_part2
from generate_docx_part3 import build_body_part3

def build_body_part4():
    parts = []

    # ══════════════════════════════════════════════════════════
    # SECTION 10: RISK-SHARING WATERFALL
    # ══════════════════════════════════════════════════════════
    parts.append(section_label("Section 10"))
    parts.append(heading1("Risk-Sharing Waterfall: Who Bears What", page_break=True))
    parts.append(accent_bar())
    parts.append(body("A clear understanding of risk allocation across the value chain is essential for investor confidence. The PaySick model distributes risk structurally across four parties:"))

    parts.append(make_table(
        ["Party", "Risk Exposure", "Mitigation", "Incentive Alignment"],
        [
            ["Provider", "Zero direct credit risk (paid in 24hrs). Indirect risk via provider scoring affecting future approval limits and payout speed.", "Co-payment holdback on new providers. Graduated trust. Treatment benchmarking.", "Better patient repayment = higher limits, faster payouts, more patients."],
            ["PaySick (Marketplace)", "Earns origination fee. Bears no credit risk on marketplace loans. Bears reputational risk from poor lender behaviour.", "Rate caps, lender quality scoring, minimum coverage requirements.", "Better approval quality = lender retention = sustained fee income."],
            ["PaySick (Balance Sheet)", "Bears full credit risk on directly funded loans (target 35% of revenue). This is the learning engine.", "Healthcare-specific underwriting. Cap at 40% of total book. Circuit breakers at 6% arrears.", "Balance sheet data trains marketplace algorithms. Exposure shrinks as marketplace scales."],
            ["Lender Partners", "Bear credit risk on marketplace loans. Protected by PaySick\u2019s pre-screening (only qualified patients reach marketplace).", "First-loss data from PaySick\u2019s own book. Diversification across procedure types and providers.", "PaySick\u2019s balance sheet acts as canary: if PaySick\u2019s own book deteriorates, lenders see the signal early."],
            ["Patient", "Bears repayment obligation. Protected by affordability checks, flexible restructuring, and transparent terms.", "Hard income ceiling prevents over-extension. Proactive restructuring for complications. No hidden fees.", "Medical debt carries social and family support dynamics. Patients return for follow-up care."],
        ],
        [1800, 2600, 2400, 2200]
    ))

    parts.append(callout("The Critical Insight: As the marketplace scales, PaySick\u2019s own balance sheet exposure shrinks as a percentage of total volume, while the underwriting intelligence from balance sheet lending improves marketplace quality. The balance sheet is a learning engine, not the long-term risk centre."))

    # ══════════════════════════════════════════════════════════
    # SECTION 11: CONCLUSION
    # ══════════════════════════════════════════════════════════
    parts.append(section_label("Section 11"))
    parts.append(heading1("Conclusion", page_break=True))
    parts.append(accent_bar())

    parts.append(body("Healthcare lending is not retail BNPL with a different label. It operates in a fundamentally different risk environment characterised by non-discretionary demand, provider-mediated distribution, and multi-party incentive dynamics that generic consumer lending models are not equipped to manage."))
    parts.append(body("The PaySick Shield Framework addresses this by building five layers of structural protection, each designed to break the adverse selection cascade at a different point. The framework achieves three objectives simultaneously:"))

    parts.append(bullet("Target net loss rate of 1.0\u20131.44%, with structural break-even at PD of 14%+ and multiple circuit breakers long before that threshold.", bold_prefix="Loss prevention: "))
    parts.append(bullet("Every transaction strengthens the model, creating an unreplicable dataset that improves loss rates over time, from an expected 5% PD at cold start to below 2.5% at scale.", bold_prefix="Data compounding: "))
    parts.append(bullet("The framework is market-agnostic by design, requiring only local calibration of regulatory thresholds, affordability ceilings, and provider onboarding criteria.", bold_prefix="Global scalability: "))

    parts.append(body("The single most important insight for investors: the provider gets paid in 24 hours, but trust is earned over 6 months. New providers start with capped limits and graduated payouts tied to their patients\u2019 repayment performance. This one structural control, when combined with patient affordability ceilings and portfolio circuit breakers, creates a healthcare lending platform that is structurally resistant to the adverse selection dynamics that plague retail consumer credit."))

    parts.append(callout("PaySick\u2019s risk framework is not a credit score with a healthcare label. It is a three-dimensional model encompassing clinical, financial, and insurance dimensions that improves with every transaction. Generic fintechs see a loan. PaySick sees a procedure, a provider, a patient, and a payer. That is why our loss rates will structurally outperform, and that is why this framework scales."))

    # ══════════════════════════════════════════════════════════
    # REFERENCES
    # ══════════════════════════════════════════════════════════
    parts.append(section_label("References"))
    parts.append(heading1("References", page_break=True))
    parts.append(accent_bar())

    refs = [
        "Browne Commission (1986) Report of the Commission of Inquiry into Health Services. Pretoria: Government Printer.",
        "Consumer Financial Protection Bureau (CFPB) (2024) Buy Now, Pay Later: Market Trends and Consumer Impacts. Washington, DC: CFPB Office of Research.",
        "Council for Medical Schemes (2018) Annual Report 2017\u20132018: Financial Analysis of Medical Schemes in South Africa. Pretoria: Council for Medical Schemes.",
        "DebtBusters (2024) Quarterly Debt Index Q2 2024: South African Consumer Debt Trends. Cape Town: DebtBusters Pty Ltd.",
        "De Villiers, K., Van Rensburg, M.J. and Van Schaik, N. (2021) \u2018Primary healthcare seeking behaviour of low-income patients across the public and private health sectors in South Africa\u2019, BMC Public Health, 21(1), pp. 1\u201312.",
        "Discovery Bank (2024) SpendTrend 2024 Report: South African Consumer Income and Spending Patterns. Johannesburg: Discovery Bank.",
        "Koch, S.F. (2009) \u2018Medical aid scheme coverage in South Africa: evidence from General Household Surveys 2002\u20132007\u2019, Development Southern Africa, 34(5), pp. 575\u2013592.",
        "LendingTree (2025) Buy Now, Pay Later Consumer Tracker Q1 2025. Charlotte, NC: LendingTree Inc.",
        "Mayosi, B.M. and Benatar, S.R. (2014) \u2018Health and health care in South Africa: 20 years after Mandela\u2019, New England Journal of Medicine, 371(14), pp. 1344\u20131353.",
        "McIntyre, D. (2010) \u2018Private sector involvement in funding and providing health services in South Africa: implications for equity and access to health care\u2019, EQUINET Discussion Paper Series 84. Harare: EQUINET.",
        "Morgan Stanley (2025) Global BNPL Market Assessment: Credit Risk and Growth Trajectories. New York: Morgan Stanley Research.",
        "Ndlovu, T. (2021) \u2018Financial health of medical schemes in South Africa\u2019, Finance Research Letters, 50(1), pp. 103\u2013118.",
        "Prospect Capital Management (2025) Healthcare Credit Outlook 2025: Cumulative Default Analysis 2000\u20132025. New York: Prospect Capital Corporation.",
        "Richmond Federal Reserve (2025) BNPL Market Report: Systemic Risk Assessment in Consumer Credit. Richmond, VA: Federal Reserve Bank of Richmond.",
        "Schneider, H., Gilson, L. and Nxumalo, N. (2024) \u2018South Africa\u2019s health-care reform in limbo following election\u2019, Think Global Health. Council on Foreign Relations.",
        "South African Audience Research Foundation (SAARF) (2023) Living Standards Measure (LSM) 2023: Segmentation Framework. Johannesburg: SAARF.",
        "South African Reserve Bank (SARB) (2026) Monetary Policy Committee Statement, January 2026. Pretoria: SARB.",
        "Statista (2025) Consumption Indicators: South Africa Healthcare Spending Per Capita Forecast 2025. Hamburg: Statista GmbH.",
        "Statistics South Africa (2023) General Household Survey 2022: Medical Aid Coverage and Healthcare Access. Pretoria: Statistics South Africa.",
        "Statistics South Africa (2025) Income and Expenditure Survey (IES) 2022/2023: Household Consumption Expenditure. Pretoria: Statistics South Africa.",
        "World Health Organisation (WHO) (2023) Global Health Expenditure Database: Africa Regional Analysis. Geneva: WHO.",
        "Australian Prudential Regulation Authority (APRA) (2024) Quarterly Private Health Insurance Statistics: March 2024. Sydney: APRA.",
        "Health Professions Council of South Africa (HPCSA) (2024) Registration Statistics: Dental Practitioners. Pretoria: HPCSA.",
        "National Health Accounts (India) (2022) National Health Accounts Estimates 2020\u201321 and 2021\u201322. New Delhi: Ministry of Health and Family Welfare.",
        "NHS England (2025) Referral to Treatment Waiting Times Statistics. London: NHS England.",
        "NITI Aayog (2021) Health Insurance for India\u2019s Missing Middle. New Delhi: NITI Aayog, Government of India.",
        "Private Healthcare Information Network (PHIN) (2025) Annual Self-Pay and Private Hospital Admissions Report 2024. London: PHIN.",
    ]
    for ref in refs:
        parts.append(body(ref))

    # End mark
    parts.append(spacer(200))
    parts.append(make_para([make_run("\u2014 END \u2014", size=11, color=LIGHT_GRAY, font="Segoe UI")], alignment="center", spacing_after=100))
    parts.append(spacer(100))

    # Footer
    logo1 = make_run("Pay", size=14, color=DARK_TEXT, font="Segoe UI")
    logo2 = make_run("Sick", size=14, color="4A4A4A", font="Segoe UI")
    parts.append(make_para([logo1, logo2], alignment="center", spacing_after=20))
    parts.append(make_para([make_run("Heal Now, Pay Later", size=10, color=LIGHT_GRAY, font="Segoe UI")], alignment="center", spacing_after=60))
    parts.append(make_para([make_run("\u00a9 2026 PaySick (Pty) Ltd. All rights reserved.", size=9, color=LIGHT_GRAY, font="Segoe UI")], alignment="center", spacing_after=10))
    parts.append(make_para([make_run("This document is confidential and intended solely for the use of intended recipients.", size=9, color=LIGHT_GRAY, font="Segoe UI")], alignment="center", spacing_after=10))
    parts.append(make_para([make_run("Unauthorised distribution is prohibited.", size=9, color=LIGHT_GRAY, font="Segoe UI")], alignment="center"))

    return parts


# ══════════════════════════════════════════════════════════════
# ASSEMBLE FULL DOCX
# ══════════════════════════════════════════════════════════════

def assemble_docx():
    # Gather all body parts
    all_parts = build_body()            # Part 1: Cover, TOC, Abstract, Sections 1-2
    all_parts += build_body_part2()     # Part 2: Sections 3-5
    all_parts += build_body_part3()     # Part 3: Sections 6-9
    all_parts += build_body_part4()     # Part 4: Sections 10-11, References

    body_xml = '\n'.join(all_parts)

    # document.xml
    document_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:w10="urn:schemas-microsoft-com:office:word"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
            xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
            xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
            xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
            xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
            mc:Ignorable="w14 wp14">
  <w:body>
    {body_xml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1700" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
    </w:sectPr>
  </w:body>
</w:document>'''

    # styles.xml
    styles_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI" w:eastAsia="Segoe UI"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:lang w:val="en-ZA"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="120" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:tblPr>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="E5E5E5"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="E5E5E5"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="E5E5E5"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="E5E5E5"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E5E5E5"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E5E5E5"/>
      </w:tblBorders>
    </w:tblPr>
  </w:style>
</w:styles>'''

    # settings.xml
    settings_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="720"/>
  <w:compat>
    <w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>
  </w:compat>
</w:settings>'''

    # fontTable.xml
    font_table_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:font w:name="Segoe UI">
    <w:panose1 w:val="020B0502040204020203"/>
    <w:charset w:val="00"/>
    <w:family w:val="swiss"/>
    <w:pitch w:val="variable"/>
  </w:font>
</w:fonts>'''

    # [Content_Types].xml
    content_types_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
</Types>'''

    # _rels/.rels
    rels_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''

    # word/_rels/document.xml.rels
    doc_rels_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>
</Relationships>'''

    # Build ZIP
    with zipfile.ZipFile(OUTPATH, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', content_types_xml)
        zf.writestr('_rels/.rels', rels_xml)
        zf.writestr('word/_rels/document.xml.rels', doc_rels_xml)
        zf.writestr('word/document.xml', document_xml)
        zf.writestr('word/styles.xml', styles_xml)
        zf.writestr('word/settings.xml', settings_xml)
        zf.writestr('word/fontTable.xml', font_table_xml)

    print(f"Generated: {OUTPATH}")
    sz = os.path.getsize(OUTPATH)
    print(f"File size: {sz:,} bytes ({sz/1024:.1f} KB)")


if __name__ == "__main__":
    assemble_docx()
