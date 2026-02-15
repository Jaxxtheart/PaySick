#!/usr/bin/env python3
"""
Generate PaySick White Paper V4 as a branded .docx file.
Uses zipfile + raw OOXML XML — no external dependencies.
"""

import zipfile
import os
from xml.sax.saxutils import escape

# --- Color constants (PaySick brand) ---
RED_PRIMARY = "FF4757"
RED_DARK = "E01E37"
DARK_TEXT = "1A1A1A"
BODY_TEXT = "4A4A4A"
LIGHT_GRAY = "8A8A8A"
TABLE_HEADER_BG = "1A1A1A"
TABLE_ALT_ROW = "FAFAFA"
CALLOUT_BG = "FFF5F6"
CALLOUT_BORDER = "E01E37"
SUBTLE_CALLOUT_BG = "FAFAFA"
SUBTLE_CALLOUT_BORDER = "E5E5E5"

OUTPATH = "/home/user/PaySick/PaySick_Underwriting_Risk_WhitePaper_V4.docx"

# ── XML Helpers ──────────────────────────────────────────────

def make_run(text, bold=False, italic=False, size=None, color=None, font=None, underline=False, caps=False, spacing=None):
    """Create a w:r element."""
    rpr_parts = []
    if font:
        rpr_parts.append(f'<w:rFonts w:ascii="{font}" w:hAnsi="{font}" w:cs="{font}"/>')
    if bold:
        rpr_parts.append('<w:b/><w:bCs/>')
    if italic:
        rpr_parts.append('<w:i/><w:iCs/>')
    if underline:
        rpr_parts.append('<w:u w:val="single"/>')
    if caps:
        rpr_parts.append('<w:caps/>')
    if size:
        half = size * 2
        rpr_parts.append(f'<w:sz w:val="{half}"/><w:szCs w:val="{half}"/>')
    if color:
        rpr_parts.append(f'<w:color w:val="{color}"/>')
    if spacing:
        rpr_parts.append(f'<w:spacing w:val="{spacing}"/>')

    rpr = f'<w:rPr>{"".join(rpr_parts)}</w:rPr>' if rpr_parts else ''
    # Handle line breaks
    escaped = escape(text)
    parts = escaped.split('\n')
    content = ''
    for i, part in enumerate(parts):
        content += f'<w:t xml:space="preserve">{part}</w:t>'
        if i < len(parts) - 1:
            content += '<w:br/>'
    return f'<w:r>{rpr}{content}</w:r>'


def make_para(runs, alignment=None, spacing_before=None, spacing_after=None, style=None, indent_left=None, keep_next=False, page_break_before=False, border_left=None, shading=None, tabs=None):
    """Create a w:p element from a list of run strings."""
    ppr_parts = []
    if style:
        ppr_parts.append(f'<w:pStyle w:val="{style}"/>')
    if keep_next:
        ppr_parts.append('<w:keepNext/>')
    if page_break_before:
        ppr_parts.append('<w:pageBreakBefore/>')

    spacing_attrs = []
    if spacing_before is not None:
        spacing_attrs.append(f'w:before="{spacing_before}"')
    if spacing_after is not None:
        spacing_attrs.append(f'w:after="{spacing_after}"')
    spacing_attrs.append('w:line="276" w:lineRule="auto"')
    ppr_parts.append(f'<w:spacing {" ".join(spacing_attrs)}/>')

    if alignment:
        ppr_parts.append(f'<w:jc w:val="{alignment}"/>')
    if indent_left:
        ppr_parts.append(f'<w:ind w:left="{indent_left}"/>')
    if border_left:
        bcolor, bsize = border_left
        ppr_parts.append(f'<w:pBdr><w:left w:val="single" w:sz="{bsize}" w:space="12" w:color="{bcolor}"/></w:pBdr>')
    if shading:
        ppr_parts.append(f'<w:shd w:val="clear" w:color="auto" w:fill="{shading}"/>')
    if tabs:
        tab_entries = ''.join(f'<w:tab w:val="{t[0]}" w:pos="{t[1]}"/>' for t in tabs)
        ppr_parts.append(f'<w:tabs>{tab_entries}</w:tabs>')

    ppr = f'<w:pPr>{"".join(ppr_parts)}</w:pPr>' if ppr_parts else ''
    runs_str = ''.join(runs) if isinstance(runs, list) else runs
    return f'<w:p>{ppr}{runs_str}</w:p>'


def make_table(headers, rows, col_widths=None):
    """Create a w:tbl element."""
    num_cols = len(headers)
    if col_widths is None:
        total = 9000
        col_widths = [total // num_cols] * num_cols

    grid = ''.join(f'<w:gridCol w:w="{w}"/>' for w in col_widths)

    tbl_pr = f'''<w:tblPr>
        <w:tblStyle w:val="TableGrid"/>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblBorders>
            <w:top w:val="single" w:sz="4" w:space="0" w:color="E5E5E5"/>
            <w:left w:val="single" w:sz="4" w:space="0" w:color="E5E5E5"/>
            <w:bottom w:val="single" w:sz="4" w:space="0" w:color="E5E5E5"/>
            <w:right w:val="single" w:sz="4" w:space="0" w:color="E5E5E5"/>
            <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E5E5E5"/>
            <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E5E5E5"/>
        </w:tblBorders>
        <w:tblLook w:val="04A0" w:firstRow="1"/>
    </w:tblPr>'''

    # Header row
    hcells = ''
    for i, h in enumerate(headers):
        hcells += f'''<w:tc>
            <w:tcPr><w:tcW w:w="{col_widths[i]}" w:type="dxa"/>
            <w:shd w:val="clear" w:color="auto" w:fill="{TABLE_HEADER_BG}"/>
            <w:vAlign w:val="center"/></w:tcPr>
            {make_para([make_run(h, bold=True, size=9, color="FFFFFF", font="Segoe UI")], spacing_before=60, spacing_after=60)}
        </w:tc>'''
    header_row = f'<w:tr><w:trPr><w:tblHeader/></w:trPr>{hcells}</w:tr>'

    # Data rows
    data_rows = ''
    for ri, row in enumerate(rows):
        bg = TABLE_ALT_ROW if ri % 2 == 1 else "FFFFFF"
        cells = ''
        for ci, cell in enumerate(row):
            is_first = ci == 0
            cell_runs = []
            # Handle bold markers in cell text
            if isinstance(cell, tuple):
                cell_text, cell_bold = cell
            else:
                cell_text = str(cell)
                cell_bold = is_first
            cell_runs.append(make_run(cell_text, bold=cell_bold, size=9, color=BODY_TEXT, font="Segoe UI"))
            cells += f'''<w:tc>
                <w:tcPr><w:tcW w:w="{col_widths[ci]}" w:type="dxa"/>
                <w:shd w:val="clear" w:color="auto" w:fill="{bg}"/>
                <w:vAlign w:val="center"/></w:tcPr>
                {make_para(cell_runs, spacing_before=50, spacing_after=50)}
            </w:tc>'''
        data_rows += f'<w:tr>{cells}</w:tr>'

    return f'<w:tbl>{tbl_pr}<w:tblGrid>{grid}</w:tblGrid>{header_row}{data_rows}</w:tbl>'


def heading1(text, page_break=True):
    runs = [make_run(text, bold=True, size=24, color=DARK_TEXT, font="Segoe UI")]
    return make_para(runs, spacing_before=0, spacing_after=200, keep_next=True, page_break_before=page_break)

def heading2(text):
    runs = [make_run(text, bold=True, size=16, color=DARK_TEXT, font="Segoe UI")]
    return make_para(runs, spacing_before=300, spacing_after=120, keep_next=True)

def heading3(text):
    runs = [make_run(text, bold=True, size=13, color=DARK_TEXT, font="Segoe UI")]
    return make_para(runs, spacing_before=240, spacing_after=80, keep_next=True)

def body(text, bold_prefix=None):
    """Body paragraph. If bold_prefix, the first part is bold."""
    runs = []
    if bold_prefix:
        runs.append(make_run(bold_prefix, bold=True, size=11, color=DARK_TEXT, font="Segoe UI"))
        runs.append(make_run(text, size=11, color=BODY_TEXT, font="Segoe UI"))
    else:
        runs.append(make_run(text, size=11, color=BODY_TEXT, font="Segoe UI"))
    return make_para(runs, spacing_after=120)

def body_runs(run_list):
    """Body paragraph from pre-built runs."""
    return make_para(run_list, spacing_after=120)

def bullet(text, bold_prefix=None, level=0):
    indent = 720 + level * 360
    runs = []
    bullet_char = make_run("\u2022  ", size=11, color=RED_DARK, font="Segoe UI")
    runs.append(bullet_char)
    if bold_prefix:
        runs.append(make_run(bold_prefix, bold=True, size=11, color=DARK_TEXT, font="Segoe UI"))
        runs.append(make_run(text, size=11, color=BODY_TEXT, font="Segoe UI"))
    else:
        runs.append(make_run(text, size=11, color=BODY_TEXT, font="Segoe UI"))
    return make_para(runs, spacing_after=60, indent_left=indent)

def numbered(number, text, bold_prefix=None):
    runs = []
    runs.append(make_run(f"{number}.  ", bold=True, size=11, color=RED_DARK, font="Segoe UI"))
    if bold_prefix:
        runs.append(make_run(bold_prefix, bold=True, size=11, color=DARK_TEXT, font="Segoe UI"))
        runs.append(make_run(text, size=11, color=BODY_TEXT, font="Segoe UI"))
    else:
        runs.append(make_run(text, size=11, color=BODY_TEXT, font="Segoe UI"))
    return make_para(runs, spacing_after=60, indent_left=720)

def callout(text, border_color=CALLOUT_BORDER, bg=CALLOUT_BG):
    runs = [make_run(text, bold=True, size=11, color=DARK_TEXT, font="Segoe UI")]
    return make_para(runs, spacing_before=200, spacing_after=200, border_left=(border_color, 24), shading=bg)

def callout_subtle(text):
    return callout(text, border_color=SUBTLE_CALLOUT_BORDER, bg=SUBTLE_CALLOUT_BG)

def spacer(pts=120):
    return make_para([make_run("")], spacing_after=pts)

def section_label(text):
    runs = [make_run(text, bold=True, size=9, color=RED_DARK, font="Segoe UI", caps=True, spacing=60)]
    return make_para(runs, spacing_after=40)

def accent_bar():
    """A thin red horizontal line."""
    return f'''<w:p><w:pPr><w:spacing w:after="200"/><w:pBdr>
        <w:bottom w:val="single" w:sz="18" w:space="1" w:color="{RED_DARK}"/>
    </w:pBdr></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>'''

def page_header():
    """PaySick logo text + section marker."""
    r1 = make_run("Pay", size=12, color="C0C0C0", font="Segoe UI")
    r2 = make_run("Sick", size=12, color="D0D0D0", font="Segoe UI", bold=False)
    return make_para([r1, r2], alignment="right", spacing_after=120)


# ── Build document body ──────────────────────────────────────

def build_body():
    parts = []

    # ══════════════════════════════════════════════════════════
    # COVER PAGE
    # ══════════════════════════════════════════════════════════
    parts.append(spacer(600))

    # Logo
    logo1 = make_run("Pay", size=36, color=DARK_TEXT, font="Segoe UI")
    logo2 = make_run("Sick", size=36, color="4A4A4A", font="Segoe UI")
    parts.append(make_para([logo1, logo2], alignment="center", spacing_after=40))

    # Tagline
    parts.append(make_para([make_run("HEAL NOW, PAY LATER", size=9, color=LIGHT_GRAY, font="Segoe UI", caps=True, spacing=80)], alignment="center", spacing_after=100))

    # Label
    parts.append(make_para([make_run("WHITE PAPER", size=9, color=LIGHT_GRAY, font="Segoe UI", caps=True, spacing=100)], alignment="center", spacing_after=300))

    # Red divider
    parts.append(accent_bar())

    # Title
    parts.append(make_para([make_run("When Care Meets Capital:", bold=True, size=28, color=DARK_TEXT, font="Segoe UI")], alignment="center", spacing_after=0))
    parts.append(make_para([make_run("Underwriting Risk & Adverse Selection", bold=True, size=28, color=DARK_TEXT, font="Segoe UI")], alignment="center", spacing_after=0))
    parts.append(make_para([make_run("in Healthcare Lending", bold=True, size=28, color=DARK_TEXT, font="Segoe UI")], alignment="center", spacing_after=200))

    # Subtitle
    parts.append(make_para([make_run("A Framework for Building Loss-Resistant Healthcare Financing at Scale", size=14, color=BODY_TEXT, font="Segoe UI")], alignment="center", spacing_after=400))

    # Meta
    parts.append(make_para([make_run("Author", bold=True, size=10, color=BODY_TEXT, font="Segoe UI"), make_run("   Mosiuwa Tshabalala", size=10, color=LIGHT_GRAY, font="Segoe UI")], alignment="center", spacing_after=20))
    parts.append(make_para([make_run("Version", bold=True, size=10, color=BODY_TEXT, font="Segoe UI"), make_run("   4.0", size=10, color=LIGHT_GRAY, font="Segoe UI")], alignment="center", spacing_after=20))
    parts.append(make_para([make_run("Date", bold=True, size=10, color=BODY_TEXT, font="Segoe UI"), make_run("   February 2026", size=10, color=LIGHT_GRAY, font="Segoe UI")], alignment="center", spacing_after=20))
    parts.append(make_para([make_run("Classification", bold=True, size=10, color=BODY_TEXT, font="Segoe UI"), make_run("   Confidential \u2014 Institutional & Investor Audiences", size=10, color=LIGHT_GRAY, font="Segoe UI")], alignment="center", spacing_after=300))

    # Confidential footer
    parts.append(make_para([make_run("CONFIDENTIAL \u2014 PAYSICK (PTY) LTD", size=8, color="C0C0C0", font="Segoe UI", caps=True, spacing=60)], alignment="center"))

    # ══════════════════════════════════════════════════════════
    # TABLE OF CONTENTS
    # ══════════════════════════════════════════════════════════
    parts.append(heading1("Contents", page_break=True))
    parts.append(accent_bar())

    toc_items = [
        ("Abstract", ""),
        ("01", "Executive Summary"),
        ("02", "Market Context: The Case for Healthcare-Specific Underwriting"),
        ("03", "Addressable Population Analysis: Quantifying the Target Market"),
        ("04", "Anatomy of Loss: What Causes a Loss-Making Book"),
        ("05", "Scenario Analysis: Quantifying Loss Under Stress"),
        ("06", "Adverse Selection: Mapping Every Relationship"),
        ("07", "The PaySick Shield Framework: Target Underwriting Model"),
        ("08", "The Ideal Operating State: Shielded Underwriting Model"),
        ("09", "Global Replicability: Scaling the Framework"),
        ("10", "Risk-Sharing Waterfall: Who Bears What"),
        ("11", "Conclusion"),
        ("", "References"),
    ]
    for num, title in toc_items:
        if num and num != "Abstract":
            runs = [
                make_run(num + "   ", bold=True, size=10, color="C0C0C0", font="Segoe UI"),
                make_run(title, size=11, color=DARK_TEXT, font="Segoe UI")
            ]
        else:
            runs = [make_run(num or title, size=11, color=DARK_TEXT, font="Segoe UI")]
        parts.append(make_para(runs, spacing_before=80, spacing_after=80))

    # ══════════════════════════════════════════════════════════
    # ABSTRACT
    # ══════════════════════════════════════════════════════════
    parts.append(section_label("Abstract"))
    parts.append(heading1("Abstract", page_break=True))
    parts.append(accent_bar())
    parts.append(body("This paper presents a comprehensive risk management framework for healthcare-specific consumer lending in emerging markets, with South Africa as the primary case study. The framework addresses a critical gap in the literature on point-of-care financing: how to structurally prevent adverse selection and maintain loss rates below 2% in a market characterised by 84% uninsured population, 10:1 private-to-public healthcare expenditure disparity, and 32% structural unemployment. Drawing on empirical data from global BNPL loss experience (Richmond Federal Reserve, 2025), healthcare credit performance over 25 years (Prospect Capital Management, 2025), and South African socioeconomic data (Statistics South Africa, 2023), the paper identifies a dual addressable market of approximately 19.6 million adults comprising medical aid holders requiring gap financing and uninsured out-of-pocket private healthcare users. It maps four distinct adverse selection relationships inherent in healthcare lending marketplaces, quantifies their financial impact through scenario analysis across six stress states, and proposes the PaySick Shield Framework: a five-layer control architecture encompassing provider gating, patient underwriting, lender curation, outcome monitoring, and portfolio circuit breakers. The framework is designed to survive actuarial scrutiny and is calibrated for global replicability across any market where healthcare is privately financed."))
    parts.append(body_runs([
        make_run("Keywords: ", bold=True, italic=True, size=10, color=DARK_TEXT, font="Segoe UI"),
        make_run("Healthcare financing, adverse selection, underwriting risk, BNPL, medical lending, emerging markets, South Africa, credit risk framework, provider moral hazard, portfolio construction.", italic=True, size=10, color=BODY_TEXT, font="Segoe UI")
    ]))

    # ══════════════════════════════════════════════════════════
    # SECTION 1: EXECUTIVE SUMMARY
    # ══════════════════════════════════════════════════════════
    parts.append(section_label("Section 01"))
    parts.append(heading1("Executive Summary", page_break=True))
    parts.append(accent_bar())

    parts.append(body("This white paper presents PaySick\u2019s comprehensive framework for managing underwriting risk and adverse selection in healthcare lending. It addresses three critical questions that investors, lenders, and regulators ask of any healthcare financing platform: what causes losses, how bad can they get, and what structural controls prevent catastrophic outcomes."))
    parts.append(body("Healthcare lending operates in a fundamentally different risk environment from retail Buy Now, Pay Later (BNPL). The global BNPL sector reached $560 billion in gross merchandise volume in 2025, yet late payment rates among users have climbed to 42%, with 78% of subprime applicants being approved. This is not a model to replicate. PaySick\u2019s thesis is that healthcare-specific underwriting, embedded at the point of care through direct provider integration, produces structurally superior loss rates because it eliminates the information asymmetries that drive adverse selection in generic consumer lending."))
    parts.append(body("This paper maps every relationship in the PaySick ecosystem where adverse selection can emerge, including the provider-to-platform, patient-to-platform, lender-to-platform, and patient-to-provider relationships. For each, it identifies the mechanism of adverse selection, models the financial impact through scenario analysis, and prescribes specific structural controls. The result is a target underwriting model, the PaySick Shield Framework, that is designed to maintain net loss rates below 2% across economic cycles and is replicable across any market where healthcare is financed privately."))
    parts.append(body("The framework is anchored in South Africa, where 84% of the population lacks medical aid coverage and the private healthcare sector serves roughly 16% of citizens at ten times the per-capita expenditure of the public sector. However, every control mechanism is designed to be market-agnostic, requiring only localised calibration of regulatory thresholds, affordability ceilings, and provider onboarding criteria."))

    # ══════════════════════════════════════════════════════════
    # SECTION 2: MARKET CONTEXT
    # ══════════════════════════════════════════════════════════
    parts.append(section_label("Section 02"))
    parts.append(heading1("Market Context: The Case for Healthcare-Specific Underwriting", page_break=True))
    parts.append(accent_bar())

    parts.append(heading2("2.1 The Global BNPL Risk Landscape"))
    parts.append(body("The BNPL industry has grown rapidly but is exhibiting systemic risk signals that healthcare lending must avoid. Key data points from 2024\u20132025 research inform our risk positioning:"))

    parts.append(make_table(
        ["Metric", "Data Point"],
        [
            ["Global BNPL GMV (2025)", "$560.1 billion, 13.7% YoY growth"],
            ["BNPL users making late payments (2025)", "42%, up from 34% in 2023"],
            ["Subprime/deep subprime approval rate", "78% approved in BNPL vs standard credit"],
            ["Klarna Q1 2025 credit losses", "17% increase YoY to $137 million"],
            ["BNPL users who are financially fragile", "77.7% rely on financial coping strategies"],
            ["Healthcare loan cumulative default (2000\u20132025)", "1.6% across 25 years of data"],
            ["U.S. patient financing market (2024)", "$16 billion with 3.2% CAGR"],
        ],
        [4500, 4500]
    ))
    parts.append(spacer(40))
    parts.append(body_runs([make_run("Sources: ", bold=True, italic=True, size=9, color=LIGHT_GRAY, font="Segoe UI"), make_run("Richmond Federal Reserve (2025); Morgan Stanley (2025); Prospect Capital Management (2025); CommerceHealthcare (2025); LendingTree (2025).", italic=True, size=9, color=LIGHT_GRAY, font="Segoe UI")]))

    parts.append(body("The contrast is stark: retail BNPL is experiencing accelerating late payments among an increasingly financially vulnerable user base, while healthcare lending has maintained a cumulative default rate of just 1.6% over 25 years. This divergence is not accidental. It reflects the fundamental difference between discretionary consumer spending and non-discretionary medical need."))

    parts.append(heading2("2.2 South Africa: The Launch Market"))
    parts.append(body("South Africa presents a uniquely compelling launch market for healthcare financing. The structural dynamics are as follows:"))

    parts.append(bullet("84% of the population lacks medical aid coverage, creating massive unmet demand for healthcare financing mechanisms.", bold_prefix="84% uninsured population: "))
    parts.append(body("The root causes of this coverage gap are structural, not clinical. South Africa\u2019s uninsured are not rejected by medical schemes; they are priced out. The Medical Schemes Act of 1998 mandates community rating, meaning schemes cannot refuse membership based on health status. The barriers are primarily economic: official unemployment stands at approximately 32% (expanded definition approximately 42%), average medical scheme contributions exceed R6,296 per family annually, and the informal employment sector, comprising roughly 30% of employed persons, has no access to employer-subsidised schemes. Medical inflation has consistently outpaced consumer price inflation, widening the affordability gap each year. This distinction is critical for PaySick\u2019s actuarial positioning: the uninsured population is not inherently higher-risk from a health perspective. They are income-constrained. This means that with appropriate affordability controls, lending to this segment does not carry the elevated clinical risk that a CRO might instinctively associate with an uninsured population."))

    parts.append(bullet("Only 8 million out of 63 million citizens have private medical scheme membership, a ratio that has remained essentially flat since 2002.", bold_prefix="15.7% medical aid coverage: "))
    parts.append(body("This stagnation followed a period of active decline. Prior to 2002, coverage was deteriorating. In 1989, deregulation under the Browne Commission allowed medical schemes to risk-rate premiums and exclude individuals deemed \u2018medically uninsurable,\u2019 triggering a rapid exodus of older and sicker members. Between 1993 and 1994 alone, 200,000 South Africans lost medical scheme coverage. From 1980 to 1990, private-sector doctors increased from 40% to 60% of the total medical workforce, but membership did not track this growth because premiums escalated faster than incomes. The Medical Schemes Act of 1998 re-introduced community rating and open enrolment, stabilising the decline, but by then premiums had structurally exceeded the affordability threshold for the majority of households. The contributing factors are worsening, not improving: medical inflation consistently outpaces CPI, unemployment remains above 30%, the informal economy is expanding, and National Health Insurance legislation, while signed in 2024, faces implementation uncertainty spanning a decade or more. For PaySick, this trend is significant: the healthcare financing gap is widening structurally, ensuring sustained and growing demand for the foreseeable future."))

    parts.append(bullet("Per-capita health expenditure is approximately $1,400 in the private sector versus $140 in the public sector, creating a two-tier system where affordability is the primary barrier to quality care.", bold_prefix="10:1 expenditure gap: "))
    parts.append(bullet("The majority of medical practitioners serve the 16% who can pay, leaving the public system chronically under-resourced.", bold_prefix="73% of GPs in private sector: "))

    parts.append(body("PaySick\u2019s exclusive focus on the private healthcare sector is a deliberate and advantageous strategic choice. Public healthcare in South Africa is free at the point of service, meaning there is nothing to finance. The private sector, however, is where patients have both the clinical need and some payment capacity, providers are commercially motivated and therefore incentivised to adopt financing tools that increase patient conversion, and procedure pricing is transparent and standardised. Critically, the addressable population extends well beyond the 16% with medical aid. An estimated 25% of uninsured South Africans already pay out-of-pocket for private care, choosing to sacrifice other spending for what they perceive as faster and higher-quality treatment. This creates a dual addressable market: medical aid holders who need gap financing for the difference between scheme coverage and actual procedure cost, and cash-paying uninsured patients who need structured repayment terms. Both segments present lower risk profiles than the broader uninsured population because they have demonstrated willingness and some capacity to pay for private healthcare."))

    parts.append(bullet("No specialised healthcare financing platform has established market leadership, despite R240 billion in total addressable market.", bold_prefix="Zero dominant healthcare BNPL player: "))

    parts.append(heading2("2.3 Scalability: Why the Framework is Market-Agnostic"))
    parts.append(body("While calibrated for South Africa, the PaySick underwriting framework is designed around universal healthcare financing principles. Every market where private healthcare exists shares three characteristics: information asymmetry between patients and lenders, provider moral hazard when financing eliminates collection risk, and adverse selection among patients who actively seek credit. The framework addresses each through structural controls that require only local calibration, not redesign, when entering new markets."))
    parts.append(body("Africa\u2019s broader healthcare financing landscape reinforces the opportunity. The continent bears 22% of the global disease burden but accounts for only 1% of global health expenditure, with average per-capita health spending of just $85 across the region. Out-of-pocket payments constitute 35% of total health expenditure in Africa, pushing an estimated 15 million people into poverty annually."))
    parts.append(body("The mechanism of healthcare-induced poverty is specific and well-documented. A single hospital admission or surgical procedure can consume six to twelve months of household income, demanded as a lump-sum payment. The cascade is: medical emergency occurs, family liquidates savings and productive assets such as livestock or equipment, borrows from informal lenders at rates frequently exceeding 30% per annum, defaults on existing obligations, and enters a debt spiral that may take years to escape. In South Africa, where seven in ten households use public facilities as their first option specifically because of affordability, those who do access private care often do so in crisis, compounding the financial shock."))
    parts.append(body("A legitimate actuarial question is whether PaySick\u2019s model adds to this debt burden rather than alleviating it. The answer depends entirely on underwriting discipline. PaySick reduces poverty risk versus the status quo through four structural mechanisms. First, structured repayments replace catastrophic lump-sum payments, converting an unmanageable shock into a budgetable monthly obligation. Second, the hard affordability ceiling of 15\u201320% of verified monthly income prevents over-extension by design, a control that informal lenders and credit cards do not impose. Third, transparent and regulated pricing under the NCA replaces predatory informal lending rates. Fourth, and critically, patients who would otherwise defer care due to cost end up requiring more expensive emergency treatment later; early intervention at lower cost is both clinically and financially superior. PaySick is not introducing debt to a debt-free population. It is replacing worse forms of debt, including informal lending, credit card cash advances, family borrowing with relationship costs, and complete care deferral, with structured, affordable, transparent healthcare financing."))

    # We'll continue in part 2...
    return parts


# This file continues in part 2
if __name__ == "__main__":
    print("Part 1 loaded. Run part 2 to continue.")
