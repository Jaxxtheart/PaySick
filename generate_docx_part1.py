#!/usr/bin/env python3
"""
Generate PaySick White Paper V4 — branded .docx with embedded logo.
Pure-stdlib: zipfile + struct + zlib for PNG, xml.sax for escaping.
Redesigned to match investor deck aesthetic.
"""

import zipfile, struct, zlib, os, math
from xml.sax.saxutils import escape

# ── Brand constants ──────────────────────────────────────────
RED_PRIMARY = "FF4757"
RED_DARK    = "E01E37"
DARK_TEXT   = "1A1A1A"
BODY_TEXT   = "333333"
GRAY_MED    = "8A8A8A"
GRAY_LIGHT  = "C0C0C0"
TBL_HDR_BG  = "2D2D2D"
TBL_ALT_BG  = "F8F8F8"
CALLOUT_BG  = "FFF5F6"
CALLOUT_BD  = "E01E37"
SUBTLE_BG   = "F7F7F7"
SUBTLE_BD   = "E0E0E0"
WHITE       = "FFFFFF"
FONT        = "Segoe UI"

OUTPATH = "/home/user/PaySick/PaySick_Underwriting_Risk_WhitePaper_V4.docx"

# ── PNG Logo Generator (pure stdlib) ─────────────────────────

def make_logo_png(width=200, height=200):
    """Draw the PaySick medical cross logo as a PNG using raw pixel manipulation."""
    pixels = []
    cx, cy = width // 2, height // 2
    r_outer = min(width, height) // 2 - 4  # outer circle radius

    # Cross dimensions (proportional to the SVG: cross is 12/80 width, 60/80 height)
    cross_w = int(r_outer * 0.30)  # half-width of cross arm
    cross_h = int(r_outer * 0.75)  # half-height of cross arm
    cross_r = cross_w // 2         # corner radius

    # Inner circles
    r_white = int(r_outer * 0.20)
    r_dot   = int(r_outer * 0.15)

    for y in range(height):
        row = []
        for x in range(width):
            dx, dy = x - cx, y - cy
            dist = math.sqrt(dx*dx + dy*dy)

            # Background circle (subtle pink wash)
            if dist <= r_outer:
                # Base: transparent bg with pink circle
                bg_alpha = max(0, 1.0 - dist / r_outer)
                bg_r = int(255 * 0.96 + 255 * 0.04 * bg_alpha)
                bg_g = int(240 * 0.96 + 71 * 0.04 * bg_alpha)
                bg_b = int(240 * 0.96 + 87 * 0.04 * bg_alpha)

                # Cross shape (rounded rect check)
                in_vert = abs(dx) <= cross_w // 2 and abs(dy) <= cross_h
                in_horiz = abs(dy) <= cross_w // 2 and abs(dx) <= cross_h

                # Simple rounded corner approximation
                in_cross = in_vert or in_horiz

                if in_cross:
                    # Cross gradient (top-left brighter)
                    t = (dx + dy + cross_h * 2) / (cross_h * 4)
                    t = max(0, min(1, t))
                    cr = int(255 * (1-t) + 224 * t)
                    cg = int(71 * (1-t) + 30 * t)
                    cb = int(87 * (1-t) + 55 * t)

                    # White inner circle
                    if dist <= r_white:
                        row.extend([255, 255, 255, 255])
                    # Red inner dot
                    elif dist <= r_dot:
                        # This won't hit since r_dot < r_white... fix order
                        row.extend([cr, cg, cb, 255])
                    else:
                        row.extend([cr, cg, cb, 255])
                else:
                    # Background circle area
                    a = int(30 * bg_alpha)
                    row.extend([255, 71, 87, a])
            else:
                row.extend([0, 0, 0, 0])

            # Override: inner white circle on top of cross
            if dist <= r_white:
                row[-4:] = [255, 255, 255, 255]
            if dist <= r_dot:
                row[-4:] = [224, 30, 55, 255]

        pixels.append(bytes(row))

    # Encode PNG
    def png_chunk(chunk_type, data):
        c = chunk_type + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    raw = b''
    for row_bytes in pixels:
        raw += b'\x00' + row_bytes
    idat = zlib.compress(raw, 9)

    return sig + png_chunk(b'IHDR', ihdr) + png_chunk(b'IDAT', idat) + png_chunk(b'IEND', b'')


# ── XML Helpers ──────────────────────────────────────────────

def R(text, bold=False, italic=False, size=None, color=None, font=FONT,
      underline=False, caps=False, spacing=None, light=False):
    """Create a w:r (run) element."""
    rpr = []
    rpr.append(f'<w:rFonts w:ascii="{font}" w:hAnsi="{font}" w:cs="{font}"/>')
    if bold:
        rpr.append('<w:b/><w:bCs/>')
    if light:
        # Use font weight via w:rFonts — not natively supported; simulate with color
        pass
    if italic:
        rpr.append('<w:i/><w:iCs/>')
    if underline:
        rpr.append('<w:u w:val="single"/>')
    if caps:
        rpr.append('<w:caps/>')
    if size:
        h = size * 2
        rpr.append(f'<w:sz w:val="{h}"/><w:szCs w:val="{h}"/>')
    if color:
        rpr.append(f'<w:color w:val="{color}"/>')
    if spacing:
        rpr.append(f'<w:spacing w:val="{spacing}"/>')

    rpr_xml = f'<w:rPr>{"".join(rpr)}</w:rPr>'
    escaped = escape(text)
    segs = escaped.split('\n')
    content = ''
    for i, seg in enumerate(segs):
        content += f'<w:t xml:space="preserve">{seg}</w:t>'
        if i < len(segs) - 1:
            content += '<w:br/>'
    return f'<w:r>{rpr_xml}{content}</w:r>'


def P(runs, align=None, before=None, after=None, indent=None,
      keep_next=False, page_break=False, border_left=None, shading=None,
      line_spacing=288):
    """Create a w:p (paragraph) element."""
    ppr = []
    if keep_next:
        ppr.append('<w:keepNext/>')
    if page_break:
        ppr.append('<w:pageBreakBefore/>')
    sp = []
    if before is not None:
        sp.append(f'w:before="{before}"')
    if after is not None:
        sp.append(f'w:after="{after}"')
    sp.append(f'w:line="{line_spacing}" w:lineRule="auto"')
    ppr.append(f'<w:spacing {" ".join(sp)}/>')
    if align:
        ppr.append(f'<w:jc w:val="{align}"/>')
    if indent:
        ppr.append(f'<w:ind w:left="{indent}"/>')
    if border_left:
        bc, bs = border_left
        ppr.append(f'<w:pBdr><w:left w:val="single" w:sz="{bs}" w:space="14" w:color="{bc}"/></w:pBdr>')
    if shading:
        ppr.append(f'<w:shd w:val="clear" w:color="auto" w:fill="{shading}"/>')

    ppr_xml = f'<w:pPr>{"".join(ppr)}</w:pPr>'
    r_xml = ''.join(runs) if isinstance(runs, list) else runs
    return f'<w:p>{ppr_xml}{r_xml}</w:p>'


def TBL(headers, rows, widths=None):
    """Create a w:tbl element with clean modern styling."""
    nc = len(headers)
    if not widths:
        total = 9026
        widths = [total // nc] * nc

    grid = ''.join(f'<w:gridCol w:w="{w}"/>' for w in widths)
    tpr = f'''<w:tblPr>
      <w:tblStyle w:val="TableGrid"/>
      <w:tblW w:w="0" w:type="auto"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="2" w:space="0" w:color="E0E0E0"/>
        <w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        <w:bottom w:val="single" w:sz="2" w:space="0" w:color="E0E0E0"/>
        <w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        <w:insideH w:val="single" w:sz="2" w:space="0" w:color="E0E0E0"/>
        <w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>
      </w:tblBorders>
      <w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar>
      <w:tblLook w:val="04A0" w:firstRow="1"/>
    </w:tblPr>'''

    # Header
    hcells = ''
    for i, h in enumerate(headers):
        hcells += f'''<w:tc>
          <w:tcPr><w:tcW w:w="{widths[i]}" w:type="dxa"/>
          <w:shd w:val="clear" w:color="auto" w:fill="{TBL_HDR_BG}"/>
          <w:vAlign w:val="center"/></w:tcPr>
          {P([R(h, bold=True, size=9, color=WHITE)], before=70, after=70, line_spacing=240)}
        </w:tc>'''
    hrow = f'<w:tr><w:trPr><w:tblHeader/></w:trPr>{hcells}</w:tr>'

    # Data
    drows = ''
    for ri, row in enumerate(rows):
        bg = TBL_ALT_BG if ri % 2 == 1 else WHITE
        cells = ''
        for ci, cell in enumerate(row):
            is_first = ci == 0
            ct, cb = (cell if isinstance(cell, tuple) else (str(cell), is_first))
            cells += f'''<w:tc>
              <w:tcPr><w:tcW w:w="{widths[ci]}" w:type="dxa"/>
              <w:shd w:val="clear" w:color="auto" w:fill="{bg}"/>
              <w:vAlign w:val="center"/></w:tcPr>
              {P([R(ct, bold=cb, size=9, color=BODY_TEXT)], before=60, after=60, line_spacing=240)}
            </w:tc>'''
        drows += f'<w:tr>{cells}</w:tr>'

    return f'<w:tbl>{tpr}<w:tblGrid>{grid}</w:tblGrid>{hrow}{drows}</w:tbl>'


# ── Semantic helpers ─────────────────────────────────────────

def h1(text, pb=True):
    return P([R(text, bold=True, size=26, color=DARK_TEXT)],
             before=0, after=80, keep_next=True, page_break=pb)

def h1_bar():
    """Red accent line below h1."""
    return f'''<w:p><w:pPr><w:spacing w:after="280" w:line="240" w:lineRule="auto"/>
      <w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="{RED_DARK}"/>
      </w:pBdr></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>'''

def h2(text):
    return P([R(text, bold=True, size=17, color=DARK_TEXT)],
             before=360, after=160, keep_next=True)

def h3(text):
    return P([R(text, bold=True, size=13, color=DARK_TEXT)],
             before=280, after=100, keep_next=True)

def body(text):
    return P([R(text, size=11, color=BODY_TEXT)], after=160, line_spacing=300)

def body_b(prefix, text):
    """Body with bold prefix."""
    return P([R(prefix, bold=True, size=11, color=DARK_TEXT),
              R(text, size=11, color=BODY_TEXT)], after=160, line_spacing=300)

def body_r(run_list):
    return P(run_list, after=160, line_spacing=300)

def bul(text, prefix=None):
    runs = [R("\u2022  ", size=11, color=RED_DARK)]
    if prefix:
        runs.append(R(prefix, bold=True, size=11, color=DARK_TEXT))
    runs.append(R(text, size=11, color=BODY_TEXT))
    return P(runs, after=100, indent=540, line_spacing=300)

def num(n, text, prefix=None):
    runs = [R(f"{n}.  ", bold=True, size=11, color=RED_DARK)]
    if prefix:
        runs.append(R(prefix, bold=True, size=11, color=DARK_TEXT))
    runs.append(R(text, size=11, color=BODY_TEXT))
    return P(runs, after=100, indent=540, line_spacing=300)

def callout(text, bd=CALLOUT_BD, bg=CALLOUT_BG):
    lines = text.split('\n')
    runs = []
    for i, line in enumerate(lines):
        b = i == 0  # first line bold
        runs.append(R(line, bold=b, size=10, color=DARK_TEXT))
        if i < len(lines) - 1:
            runs.append('<w:r><w:br/></w:r>')
    return P(runs, before=240, after=240, border_left=(bd, 18), shading=bg, line_spacing=280)

def callout_s(text):
    return callout(text, bd=SUBTLE_BD, bg=SUBTLE_BG)

def sp(pts=160):
    return P([R("")], after=pts, line_spacing=240)

def slabel(text):
    return P([R(text, bold=True, size=9, color=RED_DARK, caps=True, spacing=80)],
             after=20, line_spacing=240)

def source_line(text):
    return P([R("Sources: ", bold=True, italic=True, size=9, color=GRAY_MED),
              R(text, italic=True, size=9, color=GRAY_MED)], after=80, line_spacing=240)


# ── Logo image embedding ────────────────────────────────────

def logo_drawing(rel_id, cx_emu=1143000, cy_emu=1143000):
    """Inline drawing referencing the logo image relationship."""
    return f'''<w:r><w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0"
        xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
        <wp:extent cx="{cx_emu}" cy="{cy_emu}"/>
        <wp:docPr id="1" name="Logo"/>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr><pic:cNvPr id="1" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="{rel_id}"
                  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx_emu}" cy="{cy_emu}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing></w:r>'''


# ══════════════════════════════════════════════════════════════
# BUILD FULL DOCUMENT BODY
# ══════════════════════════════════════════════════════════════

def build_all():
    p = []

    # ─── COVER PAGE ──────────────────────────────────────────
    p.append(sp(500))

    # Logo image (centered)
    logo_img = logo_drawing("rId10", cx_emu=914400, cy_emu=914400)  # 1 inch
    p.append(P([logo_img], align="center", after=80, line_spacing=240))

    # Wordmark
    p.append(P([R("Pay", size=32, color=DARK_TEXT, bold=False),
                R("Sick", size=32, color="4A4A4A")],
               align="center", after=60, line_spacing=240))

    # Tagline — matches investor deck style
    p.append(P([R("HEAL NOW, PAY LATER", size=10, color=RED_DARK, spacing=100)],
               align="center", after=280, line_spacing=240))

    # Red divider (full-width thin line)
    p.append(f'''<w:p><w:pPr><w:spacing w:before="0" w:after="280" w:line="240" w:lineRule="auto"/>
      <w:jc w:val="center"/>
      <w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="{RED_DARK}"/>
      </w:pBdr></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>''')

    # Document type label
    p.append(P([R("WHITE PAPER", size=9, color=GRAY_MED, caps=True, spacing=120)],
               align="center", after=200, line_spacing=240))

    # Title block
    p.append(P([R("When Care Meets Capital:", bold=True, size=26, color=DARK_TEXT)],
               align="center", after=0, line_spacing=276))
    p.append(P([R("Underwriting Risk & Adverse Selection", bold=True, size=26, color=DARK_TEXT)],
               align="center", after=0, line_spacing=276))
    p.append(P([R("in Healthcare Lending", bold=True, size=26, color=DARK_TEXT)],
               align="center", after=240, line_spacing=276))

    # Subtitle
    p.append(P([R("A Framework for Building Loss-Resistant Healthcare Financing at Scale",
                   size=13, color="666666")],
               align="center", after=500, line_spacing=300))

    # Meta info — clean grid-like layout
    meta = [
        ("Author", "Mosiuwa Tshabalala"),
        ("Version", "4.0"),
        ("Date", "February 2026"),
        ("Classification", "Confidential \u2014 Institutional & Investor Audiences"),
    ]
    for label, value in meta:
        p.append(P([R(label, bold=True, size=9, color=BODY_TEXT),
                     R("    " + value, size=9, color=GRAY_MED)],
                    align="center", after=40, line_spacing=240))

    p.append(sp(400))

    # Footer line
    p.append(P([R("CONFIDENTIAL  \u2014  PAYSICK (PTY) LTD", size=8, color=GRAY_LIGHT, spacing=80)],
               align="center", after=0, line_spacing=240))

    # ─── TABLE OF CONTENTS ───────────────────────────────────
    p.append(h1("Contents", pb=True))
    p.append(h1_bar())

    toc = [
        ("", "Abstract"),
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
    for n, title in toc:
        if n:
            runs = [R(n + "    ", bold=True, size=10, color=GRAY_LIGHT),
                    R(title, size=11, color=DARK_TEXT)]
        else:
            runs = [R(title, size=11, color=DARK_TEXT)]
        p.append(P(runs, before=60, after=60, line_spacing=300))
    p.append(sp(200))

    # ─── ABSTRACT ────────────────────────────────────────────
    p.append(h1("Abstract", pb=True))
    p.append(h1_bar())
    p.append(body("This paper presents a comprehensive risk management framework for healthcare-specific consumer lending in emerging markets, with South Africa as the primary case study. The framework addresses a critical gap in the literature on point-of-care financing: how to structurally prevent adverse selection and maintain loss rates below 2% in a market characterised by 84% uninsured population, 10:1 private-to-public healthcare expenditure disparity, and 32% structural unemployment. Drawing on empirical data from global BNPL loss experience (Richmond Federal Reserve, 2025), healthcare credit performance over 25 years (Prospect Capital Management, 2025), and South African socioeconomic data (Statistics South Africa, 2023), the paper identifies a dual addressable market of approximately 19.6 million adults comprising medical aid holders requiring gap financing and uninsured out-of-pocket private healthcare users. It maps four distinct adverse selection relationships inherent in healthcare lending marketplaces, quantifies their financial impact through scenario analysis across six stress states, and proposes the PaySick Shield Framework: a five-layer control architecture encompassing provider gating, patient underwriting, lender curation, outcome monitoring, and portfolio circuit breakers. The framework is designed to survive actuarial scrutiny and is calibrated for global replicability across any market where healthcare is privately financed."))
    p.append(body_r([
        R("Keywords: ", bold=True, italic=True, size=10, color=DARK_TEXT),
        R("Healthcare financing, adverse selection, underwriting risk, BNPL, medical lending, emerging markets, South Africa, credit risk framework, provider moral hazard, portfolio construction.", italic=True, size=10, color=BODY_TEXT)
    ]))

    return p

if __name__ == "__main__":
    print("Part 1 loaded.")
