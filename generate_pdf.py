#!/usr/bin/env python3
"""Generate PaySick White Paper V4 as PDF — pure Python, no dependencies."""
import zlib

# Helvetica char widths (chars 32-126, 1/1000 units)
_HW = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
       556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
       1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
       667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
       333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
       556,556,333,500,278,556,500,722,500,500,500,334,260,334,584]
_HBW = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
        556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
        975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,
        667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
        333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,
        611,611,389,556,333,611,556,778,556,556,500,389,280,389,584]
_UMAP = {0x2014:0x97,0x2013:0x96,0x2018:0x91,0x2019:0x92,0x201C:0x93,
         0x201D:0x94,0x2022:0x95,0x2026:0x85,0x2212:0x2D,0x00D7:0xD7,
         0x00A9:0xA9,0x00A3:0xA3,0x00AB:0xAB,0x00BB:0xBB}

class PDF:
    def __init__(self):
        self._pages = []
        self._s = []
        self.W, self.H = 595.28, 841.89
        self.ML, self.MR, self.MT, self.MB = 72, 72, 72, 72
        self.TW = self.W - self.ML - self.MR
        self.y = 0
        self._on = False

    def _esc(self, t):
        r = []
        for ch in t:
            cp = ord(ch)
            if cp == 0x5C: r.append('\\\\')
            elif cp == 0x28: r.append('\\(')
            elif cp == 0x29: r.append('\\)')
            elif 32 <= cp < 127: r.append(ch)
            elif cp in _UMAP: r.append('\\%03o' % _UMAP[cp])
            elif cp < 256: r.append('\\%03o' % cp)
            else: r.append('?')
        return ''.join(r)

    def _tw(self, t, b=False):
        w = _HBW if b else _HW
        return sum(w[ord(c)-32] if 32<=ord(c)<=126 else 500 for c in t)/1000.0

    def _wrap(self, t, b=False, mw=None, sz=10.5):
        if mw is None: mw = self.TW
        words = t.split()
        if not words: return ['']
        lines, line, lw = [], [], 0
        spw = self._tw(' ', b) * sz
        for wd in words:
            ww = self._tw(wd, b) * sz
            if line and lw + spw + ww > mw:
                lines.append(' '.join(line)); line, lw = [wd], ww
            else:
                if line: lw += spw
                line.append(wd); lw += ww
        if line: lines.append(' '.join(line))
        return lines or ['']

    def _cmd(self, s): self._s.append(s)
    def _np(self):
        if self._on and self._s: self._flush()
        self._s = []; self.y = self.H - self.MT; self._on = True
    def _flush(self):
        d = '\n'.join(self._s)
        self._pages.append(zlib.compress(d.encode('latin-1', errors='replace')))
        self._s = []
    def _ep(self):
        if not self._on: self._np()
    def _need(self, h):
        if self.y - h < self.MB: self._np()

    def _txt(self, x, y, t, fk, sz, c):
        fm = {'H':'/F1','HB':'/F2','HI':'/F3','HBI':'/F4'}
        self._cmd('BT')
        self._cmd('%.3f %.3f %.3f rg' % c)
        self._cmd('%s %s Tf' % (fm[fk], sz))
        self._cmd('%.2f %.2f Td' % (x, y))
        self._cmd('(%s) Tj' % self._esc(t))
        self._cmd('ET')

    def _rect(self, x, y, w, h, c):
        self._cmd('%.3f %.3f %.3f rg' % c)
        self._cmd('%.2f %.2f %.2f %.2f re f' % (x, y, w, h))

    def _ln(self, x1, y1, x2, y2, c, w=0.5):
        self._cmd('%.3f %.3f %.3f RG' % c)
        self._cmd('%.1f w' % w)
        self._cmd('%.2f %.2f m %.2f %.2f l S' % (x1, y1, x2, y2))

    # High-level
    def h1(self, t, pb=True):
        if pb: self._np()
        else: self._ep(); self._need(60)
        self._txt(self.ML, self.y, t, 'HB', 20, (0.1,0.1,0.1))
        self.y -= 28
        self._rect(self.ML, self.y, 50, 2.5, (0.878,0.118,0.216))
        self.y -= 20

    def h2(self, t):
        self._ep(); self._need(36)
        self.y -= 14
        self._txt(self.ML, self.y, t, 'HB', 13, (0.1,0.1,0.1))
        self.y -= 20

    def h3(self, t):
        self._ep(); self._need(28)
        self.y -= 8
        self._txt(self.ML, self.y, t, 'HB', 11, (0.1,0.1,0.1))
        self.y -= 16

    def para(self, t, sz=10, c=(0.2,0.2,0.2), indent=0):
        self._ep()
        ld = sz * 1.45
        for ln in self._wrap(t, False, self.TW - indent, sz):
            self._need(ld + 2)
            self._txt(self.ML + indent, self.y, ln, 'H', sz, c)
            self.y -= ld
        self.y -= 5

    def para_bp(self, bold, rest, sz=10):
        self._ep()
        ld = sz * 1.45
        full = bold + rest
        pw = self._tw(bold, True) * sz
        for i, ln in enumerate(self._wrap(full, False, self.TW, sz)):
            self._need(ld + 2)
            if i == 0:
                self._txt(self.ML, self.y, bold, 'HB', sz, (0.1,0.1,0.1))
                r = ln[len(bold):]
                if r: self._txt(self.ML + pw, self.y, r, 'H', sz, (0.2,0.2,0.2))
            else:
                self._txt(self.ML, self.y, ln, 'H', sz, (0.2,0.2,0.2))
            self.y -= ld
        self.y -= 5

    def bullet(self, t, prefix=None, sz=10, indent=30):
        self._ep(); ld = sz * 1.45
        self._need(ld + 2)
        self._txt(self.ML + indent - 14, self.y, '\u2022', 'H', sz, (0.878,0.118,0.216))
        full = (prefix or '') + t
        pw = self._tw(prefix or '', True) * sz
        for i, ln in enumerate(self._wrap(full, False, self.TW - indent, sz)):
            self._need(ld + 2)
            if i == 0 and prefix:
                self._txt(self.ML + indent, self.y, prefix, 'HB', sz, (0.1,0.1,0.1))
                r = ln[len(prefix):]
                if r: self._txt(self.ML + indent + pw, self.y, r, 'H', sz, (0.2,0.2,0.2))
            else:
                self._txt(self.ML + indent, self.y, ln, 'H', sz, (0.2,0.2,0.2))
            self.y -= ld
        self.y -= 2

    def numbered(self, n, t, prefix=None, sz=10, indent=30):
        self._ep(); ld = sz * 1.45
        self._need(ld + 2)
        self._txt(self.ML + indent - 16, self.y, '%d.' % n, 'HB', 9, (0.878,0.118,0.216))
        full = (prefix or '') + t
        pw = self._tw(prefix or '', True) * sz
        for i, ln in enumerate(self._wrap(full, False, self.TW - indent, sz)):
            self._need(ld + 2)
            if i == 0 and prefix:
                self._txt(self.ML + indent, self.y, prefix, 'HB', sz, (0.1,0.1,0.1))
                r = ln[len(prefix):]
                if r: self._txt(self.ML + indent + pw, self.y, r, 'H', sz, (0.2,0.2,0.2))
            else:
                self._txt(self.ML + indent, self.y, ln, 'H', sz, (0.2,0.2,0.2))
            self.y -= ld
        self.y -= 2

    def callout(self, t):
        self._ep()
        sz, ld, indent = 9, 13, 16
        raw = t.split('\n')
        all_lines = []
        for i, r in enumerate(raw):
            b = (i == 0)
            for w in self._wrap(r, b, self.TW - indent - 4, sz):
                all_lines.append((w, b))
        pad = 8
        th = len(all_lines) * ld + pad * 2
        self._need(th + 8)
        top = self.y + pad
        self._rect(self.ML, top - th, self.TW, th, (1.0, 0.96, 0.96))
        self._rect(self.ML, top - th, 3, th, (0.878, 0.118, 0.216))
        ty = self.y
        for lt, b in all_lines:
            fk = 'HB' if b else 'H'
            c = (0.1,0.1,0.1) if b else (0.25,0.25,0.25)
            self._txt(self.ML + indent, ty, lt, fk, sz, c)
            ty -= ld
        self.y = ty - pad

    def table(self, headers, rows, widths=None):
        self._ep()
        nc = len(headers)
        if widths:
            tot = sum(widths); widths = [w/tot*self.TW for w in widths]
        else:
            widths = [self.TW/nc]*nc
        sz, ld, px, py = 8, 11, 5, 4
        def wc(t, w, b=False): return self._wrap(t, b, w - px*2, sz)
        def rh(cells, bolds):
            mx = 1
            for i, c in enumerate(cells):
                mx = max(mx, len(wc(str(c), widths[i], bolds[i] if i<len(bolds) else False)))
            return mx * ld + py * 2
        def dr(cells, bolds, bg, tc):
            h = rh(cells, bolds)
            self._need(h)
            top = self.y + py
            self._rect(self.ML, top-h, self.TW, h, bg)
            self._ln(self.ML, top-h, self.ML+self.TW, top-h, (0.88,0.88,0.88), 0.5)
            x = self.ML
            for i, c in enumerate(cells):
                b = bolds[i] if i<len(bolds) else False
                fk = 'HB' if b else 'H'
                ls = wc(str(c), widths[i], b)
                ty = top - py - ld + 2
                for l in ls:
                    self._txt(x+px, ty, l, fk, sz, tc); ty -= ld
                x += widths[i]
            self.y -= h
        dr(headers, [True]*nc, (0.18,0.18,0.18), (1,1,1))
        for ri, r in enumerate(rows):
            bg = (0.97,0.97,0.97) if ri%2==1 else (1,1,1)
            dr(r, [True]+[False]*(nc-1), bg, (0.2,0.2,0.2))
        self.y -= 8

    def label(self, t):
        self._ep(); self._need(16)
        self._txt(self.ML, self.y, t.upper(), 'HB', 7.5, (0.878,0.118,0.216))
        self.y -= 12

    def source(self, t):
        self._ep()
        self._txt(self.ML, self.y, 'Sources: ' + t, 'HI', 7.5, (0.54,0.54,0.54))
        self.y -= 12

    def space(self, pts=14): self._ep(); self.y -= pts

    def centered(self, t, fk, sz, c):
        self._ep()
        lw = self._tw(t, 'B' in fk) * sz
        self._txt(self.ML + (self.TW - lw)/2, self.y, t, fk, sz, c)
        self.y -= sz * 1.3

    def save(self, path):
        if self._s: self._flush()
        objs = {}
        objs[1] = b'<< /Type /Catalog /Pages 2 0 R >>'
        objs[3] = b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
        objs[4] = b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
        objs[5] = b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>'
        objs[6] = b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique /Encoding /WinAnsiEncoding >>'
        pnums = []
        nxt = 7
        for comp in self._pages:
            sn, pn = nxt, nxt+1; nxt += 2
            objs[sn] = ('<< /Length %d /Filter /FlateDecode >>' % len(comp)).encode() + b'\nstream\n' + comp + b'\nendstream'
            objs[pn] = ('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] /Contents %d 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> >>' % (self.W, self.H, sn)).encode()
            pnums.append(pn)
        kids = ' '.join('%d 0 R' % n for n in pnums)
        objs[2] = ('<< /Type /Pages /Kids [%s] /Count %d >>' % (kids, len(pnums))).encode()
        mx = max(objs.keys())
        off = {}
        buf = b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
        for i in range(1, mx+1):
            off[i] = len(buf)
            buf += ('%d 0 obj\n' % i).encode() + objs[i] + b'\nendobj\n'
        xoff = len(buf)
        buf += b'xref\n'
        buf += ('0 %d\n' % (mx+1)).encode()
        buf += b'0000000000 65535 f \n'
        for i in range(1, mx+1):
            buf += ('%010d 00000 n \n' % off[i]).encode()
        buf += b'trailer\n'
        buf += ('<< /Size %d /Root 1 0 R >>' % (mx+1)).encode()
        buf += b'\nstartxref\n'
        buf += ('%d\n' % xoff).encode()
        buf += b'%%EOF\n'
        with open(path, 'wb') as f: f.write(buf)
        print('PDF: %s (%d pages, %d bytes)' % (path, len(self._pages), len(buf)))


def build(pdf):
    # ── COVER PAGE ──
    pdf._np()
    pdf.space(180)
    pdf.centered('PaySick', 'HB', 36, (0.1,0.1,0.1))
    pdf.space(4)
    pdf.centered('HEAL NOW, PAY LATER', 'HB', 9, (0.878,0.118,0.216))
    pdf.space(30)
    pdf._rect(pdf.ML + pdf.TW/2 - 30, pdf.y, 60, 2.5, (0.878,0.118,0.216))
    pdf.space(30)
    pdf.centered('WHITE PAPER', 'HB', 8, (0.54,0.54,0.54))
    pdf.space(20)
    pdf.centered('When Care Meets Capital:', 'HB', 22, (0.1,0.1,0.1))
    pdf.centered('Underwriting Risk & Adverse Selection', 'HB', 22, (0.1,0.1,0.1))
    pdf.centered('in Healthcare Lending', 'HB', 22, (0.1,0.1,0.1))
    pdf.space(20)
    pdf.centered('A Framework for Building Loss-Resistant Healthcare Financing at Scale', 'HI', 12, (0.4,0.4,0.4))
    pdf.space(60)
    for lbl, val in [('Author','Mosiuwa Tshabalala'),('Version','4.0'),('Date','February 2026'),('Classification','Confidential \u2014 Institutional & Investor Audiences')]:
        pdf.centered('%s:  %s' % (lbl, val), 'H', 9, (0.5,0.5,0.5))
    pdf.space(80)
    pdf.centered('\u00a9 2026 PaySick (Pty) Ltd. All rights reserved.', 'H', 8, (0.7,0.7,0.7))

    # ── TABLE OF CONTENTS ──
    pdf.h1('Contents')
    toc = [('','Abstract'),('01','Executive Summary'),('02','Market Context: The Case for Healthcare-Specific Underwriting'),
           ('03','Addressable Population Analysis: Quantifying the Target Market'),('04','Anatomy of Loss: What Causes a Loss-Making Book'),
           ('05','Scenario Analysis: Quantifying Loss Under Stress'),('06','Adverse Selection: Mapping Every Relationship'),
           ('07','The PaySick Shield Framework: Target Underwriting Model'),('08','The Ideal Operating State: Shielded Underwriting Model'),
           ('09','Global Replicability: Scaling the Framework'),('10','Risk-Sharing Waterfall: Who Bears What'),('11','Conclusion'),('','References')]
    for n, title in toc:
        t = ('%s    %s' % (n, title)) if n else title
        pdf.para(t, 10.5, (0.15,0.15,0.15))

    # ── ABSTRACT ──
    pdf.h1('Abstract')
    pdf.para("This paper presents a comprehensive risk management framework for healthcare-specific consumer lending in emerging markets, with South Africa as the primary case study. The framework addresses a critical gap in the literature on point-of-care financing: how to structurally prevent adverse selection and maintain loss rates below 2% in a market characterised by 84% uninsured population, 10:1 private-to-public healthcare expenditure disparity, and 32% structural unemployment. Drawing on empirical data from global BNPL loss experience (Richmond Federal Reserve, 2025), healthcare credit performance over 25 years (Prospect Capital Management, 2025), and South African socioeconomic data (Statistics South Africa, 2023), the paper identifies a dual addressable market of approximately 19.6 million adults comprising medical aid holders requiring gap financing and uninsured out-of-pocket private healthcare users. It maps four distinct adverse selection relationships inherent in healthcare lending marketplaces, quantifies their financial impact through scenario analysis across six stress states, and proposes the PaySick Shield Framework: a five-layer control architecture encompassing provider gating, patient underwriting, lender curation, outcome monitoring, and portfolio circuit breakers.")
    pdf.para_bp("Keywords: ", "Healthcare financing, adverse selection, underwriting risk, BNPL, medical lending, emerging markets, South Africa, credit risk framework, provider moral hazard, portfolio construction.", 9)

    # ── SECTION 1 ──
    pdf.label('Section 01')
    pdf.h1('Executive Summary')
    pdf.para("This white paper presents PaySick\u2019s comprehensive framework for managing underwriting risk and adverse selection in healthcare lending. It addresses three critical questions that investors, lenders, and regulators ask of any healthcare financing platform: what causes losses, how bad can they get, and what structural controls prevent catastrophic outcomes.")
    pdf.para("Healthcare lending operates in a fundamentally different risk environment from retail Buy Now, Pay Later (BNPL). The global BNPL sector reached $560 billion in gross merchandise volume in 2025, yet late payment rates among users have climbed to 42%, with 78% of subprime applicants being approved. This is not a model to replicate. PaySick\u2019s thesis is that healthcare-specific underwriting, embedded at the point of care through direct provider integration, produces structurally superior loss rates because it eliminates the information asymmetries that drive adverse selection in generic consumer lending.")
    pdf.para("This paper maps every relationship in the PaySick ecosystem where adverse selection can emerge. For each, it identifies the mechanism of adverse selection, models the financial impact through scenario analysis, and prescribes specific structural controls. The result is the PaySick Shield Framework, designed to maintain net loss rates below 2% across economic cycles and replicable across any market where healthcare is financed privately.")
    pdf.para("The framework is anchored in South Africa, where 84% of the population lacks medical aid coverage and the private healthcare sector serves roughly 16% of citizens at ten times the per-capita expenditure of the public sector. However, every control mechanism is designed to be market-agnostic, requiring only localised calibration of regulatory thresholds, affordability ceilings, and provider onboarding criteria.")

    # ── SECTION 2 ──
    pdf.label('Section 02')
    pdf.h1('Market Context: The Case for Healthcare-Specific Underwriting')
    pdf.h2('2.1 The Global BNPL Risk Landscape')
    pdf.para("The BNPL industry has grown rapidly but is exhibiting systemic risk signals that healthcare lending must avoid:")
    pdf.table(['Metric','Data Point'],
        [['Global BNPL GMV (2025)','$560.1 billion, 13.7% YoY growth'],
         ['BNPL users making late payments (2025)','42%, up from 34% in 2023'],
         ['Subprime/deep subprime approval rate','78% approved in BNPL vs standard credit'],
         ['Klarna Q1 2025 credit losses','17% increase YoY to $137 million'],
         ['Healthcare loan cumulative default (2000\u20132025)','1.6% across 25 years of data'],
         ['U.S. patient financing market (2024)','$16 billion with 3.2% CAGR']],
        [5,5])
    pdf.source("Richmond Federal Reserve (2025); Morgan Stanley (2025); Prospect Capital Management (2025); LendingTree (2025).")
    pdf.para("The contrast is stark: retail BNPL is experiencing accelerating late payments among an increasingly financially vulnerable user base, while healthcare lending has maintained a cumulative default rate of just 1.6% over 25 years. This divergence reflects the fundamental difference between discretionary consumer spending and non-discretionary medical need.")

    pdf.h2('2.2 South Africa: The Launch Market')
    pdf.para("South Africa presents a uniquely compelling launch market for healthcare financing:")
    pdf.bullet("84% of the population lacks medical aid coverage, creating massive unmet demand for healthcare financing.", prefix="84% uninsured: ")
    pdf.bullet("Only 8 million out of 63 million citizens have private medical scheme membership.", prefix="15.7% coverage: ")
    pdf.bullet("Per-capita health expenditure is approximately $1,400 private vs $140 public.", prefix="10:1 expenditure gap: ")
    pdf.bullet("73% of GPs serve the 16% who can pay, leaving the public system chronically under-resourced.", prefix="73% of GPs private: ")
    pdf.bullet("No specialised healthcare financing platform has established market leadership, despite R240 billion in total addressable market.", prefix="Zero dominant player: ")

    pdf.h2('2.3 Scalability: Why the Framework is Market-Agnostic')
    pdf.para("While calibrated for South Africa, the PaySick underwriting framework is designed around universal healthcare financing principles. Every market where private healthcare exists shares three characteristics: information asymmetry between patients and lenders, provider moral hazard when financing eliminates collection risk, and adverse selection among patients who actively seek credit. The framework addresses each through structural controls that require only local calibration, not redesign, when entering new markets.")
    pdf.para("Africa\u2019s broader healthcare financing landscape reinforces the opportunity. The continent bears 22% of the global disease burden but accounts for only 1% of global health expenditure. Out-of-pocket payments constitute 35% of total health expenditure in Africa, pushing an estimated 15 million people into poverty annually.")

    # ── SECTION 3 ──
    pdf.label('Section 03')
    pdf.h1('Addressable Population Analysis: Quantifying the Target Market')
    pdf.para("PaySick\u2019s addressable market is two precisely defined segments totalling approximately 19.6 million adults, each with distinct income profiles, behavioural attributes, and risk characteristics.")

    pdf.h2('3.1 Segment 1: Medical Aid Holders Requiring Gap Financing')
    pdf.para("Approximately 9.7 million South Africans hold medical aid coverage. These individuals are formally employed and predominantly fall within LSM 8\u201310. Medical aid holders skew to the upper end of income distribution, as monthly scheme contributions of R2,000 to R6,000 require substantial disposable income.")
    pdf.table(['Attribute','Segment 1: Gap Financing'],
        [['Population size','~9.7 million individuals'],['LSM classification','LSM 8\u201310 (upper-middle to affluent)'],
         ['Monthly household income','R13,000 \u2013 R32,000+ per month'],['Employment status','Formally employed, employer-subsidised scheme'],
         ['Average loan requirement','R3,000 \u2013 R25,000 (gap amount)'],['Expected PD','1.5 \u2013 2.0%'],
         ['Primary motivation','Cash flow preservation, convenience']],[4,6])

    pdf.h2('3.2 Segment 2: Uninsured Out-of-Pocket Private Healthcare Users')
    pdf.para("An estimated 9.9 million adults with verifiable income already use private healthcare without insurance. This segment spans LSM 5\u20138, earning between R4,165 and R13,210+ per month.")
    pdf.table(['Attribute','Segment 2: OOP Private Healthcare Users'],
        [['Population size','~9.9 million adults with verifiable income'],['LSM classification','LSM 5\u20138 (emerging middle to middle class)'],
         ['Monthly household income','R4,000 \u2013 R15,000 per month'],['Employment status','Employed (formal and informal), no employer scheme'],
         ['Average loan requirement','R5,000 \u2013 R45,000 (full procedure cost)'],['Expected PD','3.0 \u2013 4.5%'],
         ['Primary motivation','Access: cannot afford lump sum, chooses private over public']],[4,6])

    pdf.h2('3.3 Combined Addressable Market')
    pdf.table(['Portfolio Metric','Segment 1 (Gap)','Segment 2 (OOP)','Blended Portfolio'],
        [['Population','~9.7 million','~9.9 million','~19.6 million'],
         ['Avg. loan size','R14,000','R25,000','R20,000'],
         ['Expected PD','1.5 \u2013 2.0%','3.0 \u2013 4.5%','2.5 \u2013 3.5%'],
         ['Net loss rate','0.45 \u2013 0.70%','1.20 \u2013 2.25%','0.88 \u2013 1.58%'],
         ['Target portfolio share','40 \u2013 50% by value','50 \u2013 60% by value','100%']],[3,3,3,3])

    # ── SECTION 4 ──
    pdf.label('Section 04')
    pdf.h1('Anatomy of Loss: What Causes a Loss-Making Book')
    pdf.para("Understanding loss in healthcare lending requires decomposing the drivers beyond simple default rate analysis. There are five distinct risk drivers:")
    pdf.h2('4.1 The Five Risk Drivers')
    pdf.table(['Risk Driver','Mechanism','Velocity'],
        [['1. Default Rate (PD)','Patients stop repayments due to income loss or disputes','Medium: visible in 60\u201390 day arrears'],
         ['2. Recovery Rate (LGD)','Defaults with poor recovery due to no collateral','Slow: crystallises over 6\u201312 months'],
         ['3. Concentration Risk','Excessive exposure to single provider or procedure','Fast: amplifies localised shocks'],
         ['4. Funding Cost Squeeze','Cost of capital rises but loans cannot be repriced','Gradual: margin compression over quarters'],
         ['5. Lender Withdrawal','Marketplace lenders exit during stress','Fast: binary decisions can cascade']],[3,5,3])

    pdf.h2('4.2 Alternative Recovery Strategies')
    pdf.para("PaySick\u2019s healthcare-specific model enables four recovery mechanisms that can reduce LGD to 25\u201335%:")
    pdf.numbered(1, " Deduct from future provider payouts when a referred patient defaults.", prefix="Provider Holdback:")
    pdf.numbered(2, " Structure loans so medical aid reimbursement is assigned directly to PaySick.", prefix="Medical Aid Assignment:")
    pdf.numbered(3, " Apply for employer deduction orders for employed borrowers who default.", prefix="Emoluments Attachment:")
    pdf.numbered(4, " Wrap each loan with death, disability, and retrenchment cover.", prefix="Credit Life Insurance:")
    pdf.callout("Blended LGD Projection with Recovery Strategies\nBase LGD (no strategies): 45%\nWith all strategies active: 25\u201330%\nImpact on net loss rate: reduces from 1.44% to 0.80\u20130.96%")

    pdf.h2('4.3 The Loss Equation')
    pdf.callout("Net Loss Rate = Probability of Default (PD) \u00d7 Loss Given Default (LGD)\nBreak-even PD at target LGD of 45%: approximately 22%\nBreak-even PD at stress LGD of 70%: approximately 14%")

    pdf.h2('4.4 Cost of Capital Analysis')
    pdf.table(['Market','Policy Rate','Lending Rate','NIM Opportunity','Favourability'],
        [['South Africa','6.75% (declining)','15\u201318%','5.5\u20138.5%','High'],
         ['Kenya','10.0%','20\u201324%','6\u201310%','High'],
         ['India','6.5%','14\u201318%','5\u20138%','High'],
         ['United Kingdom','4.5%','8\u201315%','3\u20136%','Moderate'],
         ['Philippines','6.5%','12\u201318%','4\u20137%','Moderate']],[2,2,2,2,2])

    # ── SECTION 5 ──
    pdf.label('Section 05')
    pdf.h1('Scenario Analysis: Quantifying Loss Under Stress')
    pdf.h2('5.1 Balance Sheet Book Scenarios')
    pdf.para("The following models six scenarios based on an average loan of R18,500 and blended revenue per loan of R1,850 (10%):")
    pdf.table(['Scenario','PD','LGD','Net Loss','Net/Loan','Viable?'],
        [['Optimistic','2.0%','40%','0.8%','R1,702','Yes'],
         ['Base Case','3.2%','45%','1.44%','R1,584','Yes'],
         ['Conservative','5.0%','50%','2.5%','R1,387','Yes'],
         ['Stress','8.0%','55%','4.4%','R1,036','Tight'],
         ['Crisis','12.0%','65%','7.8%','R407','Barely'],
         ['Catastrophic','15.0%','70%','10.5%','\u2013R93','No']],[2,1,1,1,2,1])
    pdf.callout("Key Finding: Break-Even Default Rate\nThe balance sheet book becomes loss-making only at PD of approximately 14\u201315% combined with LGD of 65\u201370%. This is 4\u20135x PaySick\u2019s target PD. Even under stress (PD 8%), the book generates R1,036 net revenue per loan.")

    pdf.h2('5.2 Marketplace Book Risk')
    pdf.table(['Scenario','Default Rate','Lender Response','PaySick Impact'],
        [['Base','3\u20134%','Lenders expand allocation','Fee income grows'],
         ['Elevated','5\u20137%','Lenders tighten criteria','Fee income drops 20\u201330%'],
         ['Stress','8\u201310%','Lenders pause or exit','Forced to balance sheet'],
         ['Crisis','12%+','Lenders exit platform','Marketplace collapse']],[2,2,3,3])

    pdf.h2('5.3 Combined Stress Testing')
    pdf.para("The most dangerous scenario is a quality spiral: deteriorating approval quality causes lender withdrawal, which forces more volume onto the balance sheet at precisely the moment when credit quality is weakest.")
    pdf.callout("Every mitigation strategy in this paper is designed to break this chain at multiple points simultaneously. No single control is sufficient.")

    # ── SECTION 6 ──
    pdf.label('Section 06')
    pdf.h1('Adverse Selection: Mapping Every Relationship')
    pdf.para("In PaySick\u2019s four-party ecosystem (Patient, Provider, PaySick, Lender), adverse selection can emerge at every relationship node.")

    pdf.h2('6.1 Provider to PaySick: The Most Dangerous Relationship')
    pdf.para("Providers receive payment within 24 hours regardless of whether the patient ever repays. This creates zero financial incentive for the provider to care about patient creditworthiness. A financially struggling practice may actively funnel its worst-paying patients into PaySick to convert bad debt into guaranteed cash.")
    pdf.callout("Provider Adverse Selection Impact\nBlended PD = (90% \u00d7 3.2%) + (10% \u00d7 12.0%) = 4.08%\nNet Loss Rate increase: from 1.44% to 1.84% (28% increase)\nAt R500M volume: R2 million in additional annual losses")
    pdf.h3('Mitigation Controls')
    pdf.numbered(1, " Track repayment of each provider\u2019s referred patients. Providers at 6%+ default receive throttling.", prefix="Provider Risk Scoring: ")
    pdf.numbered(2, " Flag providers quoting 30%+ above benchmark for mandatory review.", prefix="Cost Benchmarking: ")
    pdf.numbered(3, " New providers start with R10,000 cap and 5-day payout, earning faster payouts over 6 months.", prefix="Graduated Trust: ")
    pdf.numbered(4, " 5\u201310% holdback on first 20 loans from new providers, released after 90 days.", prefix="Co-Payment Holdback: ")

    pdf.h2('6.2 Patient to PaySick: The Classic Selection Problem')
    pdf.para("Patients who actively seek financing are statistically more likely to be financially stressed. In healthcare, clinical urgency compounds this \u2014 patients needing emergency procedures will accept any terms. BNPL data confirms: 55% of users choose the service because it allows them to afford things they otherwise could not.")
    pdf.callout("Patient Adverse Selection Drift\nYear 1: 70% convenience / 30% necessity = Blended PD 3.2%\nYear 2: 50/50 = PD 4.0%\nYear 3: 30/70 = PD 4.8%\nNet loss rate progression: 1.44% \u2192 1.80% \u2192 2.16% (50% increase)")
    pdf.h3('Mitigation Controls')
    pdf.numbered(1, " Elective vs urgent procedures have different approval criteria.", prefix="Urgency Segmentation: ")
    pdf.numbered(2, " Bank statement analysis (30 days of transaction data).", prefix="Affordability Verification: ")
    pdf.numbered(3, " Monthly repayment capped at 15\u201320% of verified income. Non-negotiable.", prefix="Hard Income Ceiling: ")
    pdf.numbered(4, " 48-hour wait for elective procedures above R15,000.", prefix="Cooling-Off Period: ")

    pdf.h3('The PaySick Health Line (Revolving Credit Facility)')
    pdf.para("The most powerful structural answer to patient adverse selection is a revolving healthcare credit facility. Patients who complete their first loan (6+ months on-time) are pre-approved for a revolving credit line. This inverts the adverse selection dynamic: the best patients are rewarded with pre-approved credit. By Year 3, if 30% of portfolio is revolving-facility patients with 1.5% PD, the blended portfolio PD drops to 2.69%.")

    pdf.h2('6.3 Lender to PaySick: Reverse Selection')
    pdf.para("The best lenders cherry-pick the safest loans. Riskier loans are picked up by aggressive lenders charging the highest rates. Over time this creates a two-tier system that damages the PaySick brand.")
    pdf.bullet("Maximum allowable interest rate of prime + 12%.", prefix="Rate Caps: ")
    pdf.bullet("Score lenders on approval rates, complaints, satisfaction.", prefix="Lender Quality Scoring: ")
    pdf.bullet("Each lender must bid on a minimum percentage of all requests.", prefix="Minimum Coverage: ")

    pdf.h2('6.4 Patient to Provider: The Hidden Outcome Risk')
    pdf.para("If a patient has a bad clinical outcome, they psychologically disengage from repayment. Medical debt tied to negative outcomes has measurably higher default rates.")
    pdf.bullet("Post-treatment survey at 30 and 90 days tied to provider scoring.", prefix="Satisfaction Feedback: ")
    pdf.bullet("Providers with poor outcomes AND elevated defaults get flagged.", prefix="Outcome-Adjusted Scoring: ")
    pdf.bullet("Track default rates by procedure type per provider.", prefix="Procedure-Level Monitoring: ")

    # ── SECTION 7 ──
    pdf.label('Section 07')
    pdf.h1('The PaySick Shield Framework: Target Underwriting Model')
    pdf.para("The Shield Framework operates across five layers, each breaking the adverse selection cascade at a different point, targeting net loss rates below 2% across economic cycles.")

    pdf.h2('7.1 Layer 1: Provider Gate')
    pdf.table(['Control','Specification','Replicability'],
        [['Graduated trust onboarding','New providers: R10K cap, 5-day payout. Graduated over 6 months','Universal: adjust currency thresholds per market'],
         ['Provider risk scorecard','Monthly scoring on: patient PD, cost variance, satisfaction','Universal: scoring inputs available in any market'],
         ['Treatment cost benchmarking','Flag 30%+ above regional average for review','Requires local cost database per market'],
         ['Co-payment holdback','5\u201310% holdback on first 20 loans, released at 90 days','Universal: adjust percentage per market'],
         ['Concentration limits','No single provider >5% of book. No procedure >20%','Universal: adjust for provider density']],[3,4,4])

    pdf.h2('7.2 Layer 2: Patient Gate')
    pdf.table(['Control','Specification','Replicability'],
        [['Hard affordability ceiling','15\u201320% of verified income. Non-negotiable.','Universal: adjust per local DTI norms'],
         ['Urgency segmentation','Elective vs urgent have separate criteria','Universal: adaptable per market'],
         ['Bank statement verification','30-day transaction analysis for income patterns','Requires open banking or statement upload'],
         ['Cooling-off period','48hr wait for elective >R15K','Universal: adjust threshold per market'],
         ['Medical aid gap calculation','Only finance the residual gap, not full cost','Requires local insurance integration']],[3,4,4])

    pdf.h2('7.3 Layer 3: Lender Gate')
    pdf.bullet("All marketplace loans capped at prime + 12%.", prefix="Rate cap: ")
    pdf.bullet("Ongoing lender quality assessment.", prefix="Lender scoring: ")
    pdf.bullet("Lenders must bid on minimum % of all requests.", prefix="Min coverage: ")
    pdf.bullet("No single lender >25% of marketplace volume.", prefix="Diversification: ")

    pdf.h2('7.4 Layer 4: Outcome Gate')
    pdf.bullet("30/90-day patient satisfaction surveys tied to provider scoring.", prefix="Surveys: ")
    pdf.bullet("Procedure-level default tracking per provider.", prefix="Tracking: ")
    pdf.bullet("Proactive repayment restructuring for complications.", prefix="Restructuring: ")

    pdf.h2('7.5 Layer 5: Portfolio Circuit Breakers')
    pdf.table(['Trigger','Response','Rationale'],
        [['90-day arrears >6%','Tighten approval criteria','Early intervention before losses crystallise'],
         ['Balance sheet >40% of book','Pause BS origination','Prevents over-concentration'],
         ['Single provider PD >8%','Immediate suspension','Isolates provider-specific selection'],
         ['Reserve fund <15% of fees','Redirect 20% of fees to rebuild','Maintains first-loss buffer'],
         ['Net loss >3% for 2 months','Comprehensive portfolio review','Systemic response']],[3,4,4])

    # ── SECTION 8 ──
    pdf.label('Section 08')
    pdf.h1('The Ideal Operating State: Shielded Underwriting Model')
    pdf.para("When the Shield Framework is operating at target, every participant\u2019s incentives are structurally aligned with portfolio quality.")

    pdf.h2('8.1 Target Operating Metrics')
    pdf.table(['Metric','Target','Benchmark'],
        [['Probability of Default','2.5 \u2013 3.2%','vs 8\u201312% retail BNPL'],
         ['Loss Given Default','40 \u2013 45%','vs 60%+ unsecured retail'],
         ['Net Loss Rate','1.0 \u2013 1.44%','vs 5\u20137% retail BNPL'],
         ['Balance sheet % of book','< 35%','Declining as marketplace scales'],
         ['Provider adverse selection','< 3% flagged','Graduated trust filters early'],
         ['Convenience:necessity ratio','> 60:40','Maintained through affordability ceilings'],
         ['Lender retention','> 90% annual','Quality approvals keep lenders']],[3,3,4])

    pdf.h2('8.2 Data Flywheel')
    pdf.table(['Phase','Volume','Expected PD','Data Advantage'],
        [['Months 1\u20136','< 500 loans','~5.0%','Known-provider-only, tight criteria'],
         ['Months 6\u201312','2,000 loans','~3.5%','Procedure-level data emerges'],
         ['Year 2','10,000+ loans','~2.5\u20133.2%','Provider scoring calibrated'],
         ['Year 3+','50,000+ loans','< 2.5%','Cross-lender patterns create moat']],[2,2,2,4])
    pdf.para("Every transaction generates a proprietary data point mapping Procedure \u2192 Provider \u2192 Patient Profile \u2192 Repayment Outcome. After 10,000 transactions, this dataset is unreplicable. This is the true moat.")

    pdf.h2('8.3 The Virtuous Cycle')
    pdf.bullet("Better underwriting data leads to lower loss rates")
    pdf.bullet("Lower loss rates attract higher-quality lenders at better rates")
    pdf.bullet("Better rates attract higher-quality patients (convenience over necessity)")
    pdf.bullet("Higher-quality patients improve repayment data further")
    pdf.bullet("Better data attracts premium providers with better clinical outcomes")
    pdf.bullet("Premium providers reduce outcome-driven defaults")

    # ── SECTION 9 ──
    pdf.label('Section 09')
    pdf.h1('Global Replicability: Scaling the Framework')
    pdf.para("The PaySick Shield Framework is designed for global deployment. Every control mechanism requires only local calibration, not fundamental redesign.")

    pdf.h2('9.1 Expansion Market Assessment')
    pdf.h3('Market 1: India \u2014 The Scale Engine')
    pdf.para("Approximately 400 million Indians remain uninsured. Out-of-pocket expenditure accounted for 39.4% of total health expenditure. UPI processes 12+ billion monthly transactions. The Account Aggregator framework solves income verification natively.")

    pdf.h3('Market 2: United Kingdom \u2014 The Waiting-List Arbitrage')
    pdf.para("NHS elective care waiting list exceeded 7.36 million cases. Over 5.2 million UK residents now pay for private treatment out-of-pocket each year. The average private hip replacement costs \u00a313,985. FCA regulation aligns with PaySick\u2019s existing compliance architecture.")

    pdf.h3('Market 3: Australia \u2014 The Premium Gap Financing Market')
    pdf.para("44.8% of population holds private hospital cover, but insurance is legally prohibited from covering gap payments for outpatient services. Gap payments are rising three times faster than hospital costs. Only 44% of private admissions had zero out-of-pocket fees.")

    pdf.h3('Market 4: Kenya \u2014 The African Expansion Proof Point')
    pdf.para("Most advanced mobile money infrastructure globally through M-Pesa. CarePay (M-TIBA) has connected 5 million people and 4,000 providers. Strategic gateway to East Africa\u2019s 300 million people.")

    pdf.h3('Market 5: Philippines \u2014 The APAC Gateway')
    pdf.para("110 million people, large private hospital sector, significant OOP spending despite PhilHealth. Strong BPO-driven middle class. GCash/Maya provide M-Pesa-comparable infrastructure. Gateway to Indonesia (270M) and Vietnam (100M).")

    pdf.h3('Expansion Market Comparison')
    pdf.table(['Factor','India','UK','Australia','Kenya','Philippines'],
        [['Population','1.4B','67M','26M','55M','110M'],
         ['Uninsured','~60%','100% NHS, 7.4M waiting','55% no PHI','~80%','~65%'],
         ['Policy rate','6.5%','4.5%','4.35%','10%','6.5%'],
         ['Avg loan size','$150\u2013$2K','$2K\u2013$18K','$800\u2013$4K','$50\u2013$500','$100\u2013$1.5K'],
         ['Strategic role','Scale engine','Credibility anchor','Premium value','African proof','APAC gateway']],[2,2,2,2,2,2])
    pdf.para_bp("Recommended sequencing: ", "South Africa (live) \u2192 Kenya (Year 2) \u2192 United Kingdom (Year 2\u20133) \u2192 India (Year 3\u20134) \u2192 Philippines (Year 4\u20135).")

    pdf.h2('9.2 Procedure Profitability Analysis')
    pdf.h3('Procedure Priority Matrix')
    pdf.table(['Procedure','Avg. Loan Size','Elective %','Expected PD','Profitability'],
        [['Dental','R8K \u2013 R35K','90%+','1.0 \u2013 2.0%','Very High'],
         ['Ophthalmology','R12K \u2013 R45K','95%+','1.0 \u2013 1.5%','Very High'],
         ['Cosmetic surgery','R25K \u2013 R100K','100%','0.8 \u2013 1.5%','Very High'],
         ['Orthopaedics (gap)','R15K \u2013 R50K','70%','1.5 \u2013 2.5%','High'],
         ['Fertility / IVF','R30K \u2013 R60K/cycle','100%','1.5 \u2013 2.0%','High'],
         ['General surgery','R25K \u2013 R60K','40%','2.5 \u2013 4.0%','Moderate-High'],
         ['Maternity','R25K \u2013 R45K','Planned','2.0 \u2013 3.5%','Moderate-High']],[2,2,1,2,2])

    # ── SECTION 10 ──
    pdf.label('Section 10')
    pdf.h1('Risk-Sharing Waterfall: Who Bears What')
    pdf.table(['Party','Risk Exposure','Mitigation','Incentive Alignment'],
        [['Provider','Zero credit risk. Indirect risk via scoring.','Holdback, graduated trust, benchmarking.','Better repayment = higher limits, more patients.'],
         ['PaySick (Marketplace)','Origination fee. No credit risk. Reputational risk.','Rate caps, lender scoring, coverage requirements.','Better quality = lender retention = sustained fees.'],
         ['PaySick (Balance Sheet)','Full credit risk on directly funded loans (35% target).','Healthcare underwriting. Cap at 40%. Circuit breakers.','BS data trains marketplace algorithms.'],
         ['Lender Partners','Credit risk on marketplace loans.','First-loss data from PaySick BS. Diversification.','PaySick BS acts as canary for early warning.'],
         ['Patient','Repayment obligation.','Affordability checks, restructuring, transparent terms.','Medical debt carries social accountability.']],[2,3,3,3])
    pdf.callout("The Critical Insight\nAs the marketplace scales, PaySick\u2019s balance sheet exposure shrinks while underwriting intelligence improves marketplace quality. The balance sheet is a learning engine, not the long-term risk centre.")

    # ── SECTION 11 ──
    pdf.label('Section 11')
    pdf.h1('Conclusion')
    pdf.para("Healthcare lending is not retail BNPL with a different label. It operates in a fundamentally different risk environment characterised by non-discretionary demand, provider-mediated distribution, and multi-party incentive dynamics that generic consumer lending models are not equipped to manage.")
    pdf.para("The PaySick Shield Framework addresses this by building five layers of structural protection, each designed to break the adverse selection cascade at a different point:")
    pdf.bullet("Target net loss rate of 1.0\u20131.44%, with structural break-even at PD of 14%+.", prefix="Loss prevention: ")
    pdf.bullet("Every transaction strengthens the model, from 5% PD at cold start to below 2.5% at scale.", prefix="Data compounding: ")
    pdf.bullet("Market-agnostic by design, requiring only local calibration.", prefix="Global scalability: ")
    pdf.para("The single most important insight: the provider gets paid in 24 hours, but trust is earned over 6 months. This one structural control, combined with patient affordability ceilings and portfolio circuit breakers, creates a platform structurally resistant to adverse selection.")
    pdf.callout("PaySick\u2019s risk framework is not a credit score with a healthcare label. It is a three-dimensional model \u2014 clinical, financial, and insurance \u2014 that improves with every transaction. Generic fintechs see a loan. PaySick sees a procedure, a provider, a patient, and a payer. That is why our loss rates will structurally outperform, and that is why this framework scales.")

    # ── REFERENCES ──
    pdf.label('References')
    pdf.h1('References')
    refs = [
        "Browne Commission (1986) Report of the Commission of Inquiry into Health Services. Pretoria.",
        "Consumer Financial Protection Bureau (CFPB) (2024) Buy Now, Pay Later: Market Trends and Consumer Impacts.",
        "Council for Medical Schemes (2018) Annual Report 2017\u20132018. Pretoria.",
        "DebtBusters (2024) Quarterly Debt Index Q2 2024. Cape Town.",
        "De Villiers, K. et al. (2021) BMC Public Health, 21(1), pp. 1\u201312.",
        "Discovery Bank (2024) SpendTrend 2024 Report. Johannesburg.",
        "Koch, S.F. (2009) Development Southern Africa, 34(5), pp. 575\u2013592.",
        "LendingTree (2025) Buy Now, Pay Later Consumer Tracker Q1 2025.",
        "Mayosi, B.M. and Benatar, S.R. (2014) NEJM, 371(14), pp. 1344\u20131353.",
        "Morgan Stanley (2025) Global BNPL Market Assessment. New York.",
        "Prospect Capital Management (2025) Healthcare Credit Outlook 2025.",
        "Richmond Federal Reserve (2025) BNPL Market Report. Richmond, VA.",
        "Statistics South Africa (2023) General Household Survey 2022.",
        "World Health Organisation (2023) Global Health Expenditure Database.",
        "Australian Prudential Regulation Authority (APRA) (2024) Quarterly PHI Statistics.",
        "NHS England (2025) Referral to Treatment Waiting Times Statistics.",
        "NITI Aayog (2021) Health Insurance for India\u2019s Missing Middle.",
        "Private Healthcare Information Network (PHIN) (2025) Self-Pay Report 2024.",
    ]
    for ref in refs:
        pdf.para(ref, 8.5, (0.3,0.3,0.3))

    # End mark
    pdf.space(40)
    pdf.centered('\u2014 END \u2014', 'H', 11, (0.54,0.54,0.54))
    pdf.space(20)
    pdf.centered('PaySick', 'HB', 14, (0.1,0.1,0.1))
    pdf.centered('Heal Now, Pay Later', 'H', 10, (0.54,0.54,0.54))
    pdf.space(10)
    pdf.centered('\u00a9 2026 PaySick (Pty) Ltd. All rights reserved.', 'H', 8, (0.7,0.7,0.7))
    pdf.centered('Confidential \u2014 For institutional and investor audiences only.', 'H', 8, (0.7,0.7,0.7))


if __name__ == '__main__':
    pdf = PDF()
    build(pdf)
    pdf.save('/home/user/PaySick/assets/docs/PaySick_Underwriting_Risk_WhitePaper_V4.pdf')
