#!/usr/bin/env python3
"""
ARB Document Generator — AI Governance Platform
Generates a professional Architecture Review Board document in .docx format
"""

import io
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import numpy as np
from docx import Document
from docx.shared import Inches, Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from datetime import datetime
import copy

# ─── BRAND COLOURS ────────────────────────────────────────────────────────────
PRIMARY   = RGBColor(0x1E, 0x3A, 0x5F)   # deep navy
ACCENT    = RGBColor(0x00, 0x7A, 0xCC)   # corporate blue
LIGHT     = RGBColor(0xE8, 0xF4, 0xFF)   # pale blue
DARKGRAY  = RGBColor(0x2D, 0x2D, 0x2D)
MIDGRAY   = RGBColor(0x5A, 0x5A, 0x5A)
LIGHTGRAY = RGBColor(0xF5, 0xF5, 0xF5)
SUCCESS   = RGBColor(0x1E, 0x7E, 0x34)
WARNING   = RGBColor(0xB8, 0x6E, 0x00)
DANGER    = RGBColor(0xA8, 0x1C, 0x1C)
WHITE     = RGBColor(0xFF, 0xFF, 0xFF)

# ─── HELPERS ──────────────────────────────────────────────────────────────────

def set_cell_bg(cell, rgb_hex: str):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), rgb_hex)
    tcPr.append(shd)

def set_cell_borders(cell, border_color='1E3A5F', size=4):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for side in ('top', 'left', 'bottom', 'right'):
        el = OxmlElement(f'w:{side}')
        el.set(qn('w:val'), 'single')
        el.set(qn('w:sz'), str(size))
        el.set(qn('w:space'), '0')
        el.set(qn('w:color'), border_color)
        tcBorders.append(el)
    tcPr.append(tcBorders)

def add_paragraph_border_bottom(para, color='1E3A5F', size=6):
    pPr = para._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), str(size))
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), color)
    pBdr.append(bottom)
    pPr.append(pBdr)

def add_run(para, text, bold=False, italic=False, size=None, color=None, font='Calibri'):
    run = para.add_run(text)
    run.bold = bold
    run.italic = italic
    run.font.name = font
    if size:
        run.font.size = Pt(size)
    if color:
        run.font.color.rgb = color
    return run

def fig_to_docx_image(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                facecolor=fig.get_facecolor())
    buf.seek(0)
    plt.close(fig)
    return buf

def insert_image(doc, buf, width=Inches(6.3)):
    doc.add_picture(buf, width=width)
    last = doc.paragraphs[-1]
    last.alignment = WD_ALIGN_PARAGRAPH.CENTER

def add_caption(doc, text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(f'Figure: {text}')
    run.italic = True
    run.font.size = Pt(9)
    run.font.color.rgb = MIDGRAY

# ─── COVER PAGE ───────────────────────────────────────────────────────────────

def build_cover(doc):
    # Top colour band via a full-width table
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = t.cell(0, 0)
    set_cell_bg(cell, '1E3A5F')
    cell.width = Inches(6.5)
    cp = cell.paragraphs[0]
    cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cp.paragraph_format.space_before = Pt(24)
    cp.paragraph_format.space_after  = Pt(4)
    add_run(cp, 'AMPERA TECHNOLOGY', bold=True, size=11, color=ACCENT, font='Calibri')

    cp2 = cell.add_paragraph()
    cp2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_run(cp2, 'ARCHITECTURE REVIEW BOARD', bold=True, size=22, color=WHITE, font='Calibri')

    cp3 = cell.add_paragraph()
    cp3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cp3.paragraph_format.space_after = Pt(24)
    add_run(cp3, 'AI GOVERNANCE & OBSERVABILITY PLATFORM', bold=False, size=13, color=LIGHT, font='Calibri')

    doc.add_paragraph()

    # Meta table
    meta = doc.add_table(rows=6, cols=2)
    meta.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta.style = 'Table Grid'
    labels = ['Document Title', 'Document Version', 'Classification', 'Status',
              'Prepared By', 'Review Date']
    values = ['AI Governance Platform — ARB Submission',
              '1.0',
              'INTERNAL — CONFIDENTIAL',
              'DRAFT FOR ARB REVIEW',
              'Platform Engineering Team',
              datetime.now().strftime('%d %B %Y')]
    for i, (lbl, val) in enumerate(zip(labels, values)):
        lc = meta.cell(i, 0)
        vc = meta.cell(i, 1)
        set_cell_bg(lc, 'E8F4FF')
        set_cell_borders(lc)
        set_cell_borders(vc)
        lp = lc.paragraphs[0]
        vp = vc.paragraphs[0]
        add_run(lp, lbl, bold=True, size=10, color=PRIMARY)
        add_run(vp, val, size=10, color=DARKGRAY)
    doc.add_page_break()

# ─── SECTION HEADING HELPERS ──────────────────────────────────────────────────

def h1(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after  = Pt(6)
    add_paragraph_border_bottom(p, color='1E3A5F', size=8)
    add_run(p, text.upper(), bold=True, size=14, color=PRIMARY)
    return p

def h2(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after  = Pt(4)
    add_run(p, text, bold=True, size=12, color=ACCENT)
    return p

def h3(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after  = Pt(2)
    add_run(p, text, bold=True, size=11, color=DARKGRAY)
    return p

def body(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
    add_run(p, text, size=10, color=DARKGRAY)
    return p

def bullet(doc, text, level=0):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.left_indent  = Inches(0.25 + level * 0.25)
    p.paragraph_format.space_after  = Pt(3)
    add_run(p, text, size=10, color=DARKGRAY)
    return p

def add_styled_table(doc, headers, rows, col_widths=None):
    n = len(headers)
    tbl = doc.add_table(rows=1 + len(rows), cols=n)
    tbl.style = 'Table Grid'
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Header row
    hdr_cells = tbl.rows[0].cells
    for i, h in enumerate(headers):
        set_cell_bg(hdr_cells[i], '1E3A5F')
        set_cell_borders(hdr_cells[i], border_color='FFFFFF', size=2)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        add_run(p, h, bold=True, size=9, color=WHITE)

    # Data rows
    for ri, row in enumerate(rows):
        cells = tbl.rows[ri + 1].cells
        bg = 'F5F5F5' if ri % 2 == 0 else 'FFFFFF'
        for ci, val in enumerate(row):
            set_cell_bg(cells[ci], bg)
            set_cell_borders(cells[ci], border_color='CCCCCC', size=2)
            p = cells[ci].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            # Colour status keywords
            text = str(val)
            if text in ('✅ Implemented', '✅ Complete'):
                add_run(p, text, size=9, color=SUCCESS)
            elif text in ('⚠️ Partial', '⚠️ Stub'):
                add_run(p, text, size=9, color=WARNING)
            elif text in ('❌ Missing', '❌ Not Implemented'):
                add_run(p, text, size=9, color=DANGER)
            else:
                add_run(p, text, size=9, color=DARKGRAY)

    if col_widths:
        for i, w in enumerate(col_widths):
            for row in tbl.rows:
                row.cells[i].width = Inches(w)
    doc.add_paragraph()
    return tbl

# ═══════════════════════════════════════════════════════════════════════════════
# DIAGRAM GENERATORS
# ═══════════════════════════════════════════════════════════════════════════════

def make_hld_diagram():
    """High-Level Architecture diagram"""
    fig, ax = plt.subplots(figsize=(14, 10))
    fig.patch.set_facecolor('#F0F4F8')
    ax.set_facecolor('#F0F4F8')
    ax.set_xlim(0, 14)
    ax.set_ylim(0, 10)
    ax.axis('off')

    def box(x, y, w, h, label, sublabel='', bg='#1E3A5F', fg='white', radius=0.3, fontsize=9):
        rect = FancyBboxPatch((x, y), w, h,
                               boxstyle=f'round,pad=0.05,rounding_size={radius}',
                               facecolor=bg, edgecolor='white', linewidth=1.5, zorder=3)
        ax.add_patch(rect)
        cy = y + h / 2 + (0.15 if sublabel else 0)
        ax.text(x + w/2, cy, label, ha='center', va='center',
                color=fg, fontsize=fontsize, fontweight='bold', zorder=4)
        if sublabel:
            ax.text(x + w/2, y + h/2 - 0.22, sublabel, ha='center', va='center',
                    color=fg, fontsize=7, alpha=0.85, zorder=4)

    def arrow(x1, y1, x2, y2, label=''):
        ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle='->', color='#1E3A5F', lw=1.8), zorder=5)
        if label:
            mx, my = (x1+x2)/2, (y1+y2)/2
            ax.text(mx+0.05, my, label, fontsize=7, color='#1E3A5F', zorder=6)

    # ── Layer 0: Producers ──
    ax.add_patch(FancyBboxPatch((0.3, 8.5), 13.4, 1.1, boxstyle='round,pad=0.1',
                                 facecolor='#BDD7EE', edgecolor='#1E3A5F', lw=1.5, zorder=1))
    ax.text(7, 9.7, 'PRODUCERS / CLIENTS', ha='center', fontsize=9, fontweight='bold', color='#1E3A5F')
    for xi, (lbl, sub) in enumerate([('GovernanceSDK','Python Decorator'),
                                      ('Direct API','REST / Batch'),
                                      ('Webhooks','3rd-Party Tools'),
                                      ('File Upload','JSON/JSONL/CSV')]):
        box(0.5 + xi*3.3, 8.6, 2.9, 0.85, lbl, sub, bg='#1E3A5F', fontsize=8)

    # ── Layer 1: API Gateway ──
    box(4.5, 7.3, 5, 0.8, 'LOAD BALANCER / NGINX', 'TLS Termination · Rate Limiting', bg='#2E75B6')
    arrow(7, 8.6, 7, 8.1)

    # ── Layer 2: FastAPI ──
    ax.add_patch(FancyBboxPatch((0.3, 5.0), 9.2, 2.0, boxstyle='round,pad=0.1',
                                 facecolor='#DEEAF1', edgecolor='#2E75B6', lw=1.5, zorder=1))
    ax.text(4.9, 6.85, 'FASTAPI BACKEND (20 Routers)', ha='center', fontsize=9,
            fontweight='bold', color='#1E3A5F')
    for xi, (lbl, sub) in enumerate([('Telemetry\nControl','Ingestion'),
                                      ('Costs\nSummary','Analytics'),
                                      ('Security\nAlerts','Governance'),
                                      ('Tools\nOrgs / Projects','Admin')]):
        box(0.45 + xi*2.3, 5.15, 2.1, 1.35, lbl, sub, bg='#2E75B6', fontsize=8)

    arrow(7, 7.3, 5.0, 7.0)

    # ── Layer 2b: Workers ──
    ax.add_patch(FancyBboxPatch((9.8, 5.0), 3.9, 2.0, boxstyle='round,pad=0.1',
                                 facecolor='#E2EFDA', edgecolor='#375623', lw=1.5, zorder=1))
    ax.text(11.75, 6.85, 'BACKGROUND WORKERS', ha='center', fontsize=9,
            fontweight='bold', color='#375623')
    for xi, (lbl, sub) in enumerate([('APScheduler','Hourly/Daily'),
                                      ('Task Jobs','Anom·Alerts')]):
        box(9.95 + xi*1.95, 5.15, 1.75, 1.35, lbl, sub, bg='#375623', fg='white', fontsize=8)

    # ── Layer 3: Services ──
    ax.add_patch(FancyBboxPatch((0.3, 3.1), 13.4, 1.6, boxstyle='round,pad=0.1',
                                 facecolor='#FFF2CC', edgecolor='#BF9000', lw=1.5, zorder=1))
    ax.text(7, 4.55, 'SERVICES LAYER', ha='center', fontsize=9, fontweight='bold', color='#7F6000')
    services = [('CostEngine','6 cost models\n100+ LLM prices'),
                ('SecurityEngine','PII detection\nRisk scoring'),
                ('AlertEngine','7 alert types\nDedup logic'),
                ('ControlIngest','Unified trace\nBatch buffer'),
                ('Notification','Email/Teams\nWhatsApp'),
                ('Ingestion\nNormalizer','Vendor\nAdapters')]
    for xi, (lbl, sub) in enumerate(services):
        box(0.45 + xi*2.25, 3.25, 2.0, 1.2, lbl, sub, bg='#BF9000', fg='white', fontsize=7.5)

    arrow(7, 5.0, 7, 4.7)

    # ── Layer 4: Data ──
    ax.add_patch(FancyBboxPatch((0.3, 0.8), 13.4, 2.05, boxstyle='round,pad=0.1',
                                 facecolor='#FCE4D6', edgecolor='#C55A11', lw=1.5, zorder=1))
    ax.text(7, 2.7, 'DATA LAYER', ha='center', fontsize=9, fontweight='bold', color='#833C00')
    datastores = [('PostgreSQL\nPrimary','Writes + Migrations'),
                  ('PostgreSQL\nRead Replica','Dashboard Queries'),
                  ('Redis','Cache · Sessions\nRate Limits'),
                  ('Object Store\nS3 / GCS','Cold Archive\nParquet Files')]
    for xi, (lbl, sub) in enumerate(datastores):
        box(0.45 + xi*3.35, 0.95, 3.1, 1.6, lbl, sub, bg='#C55A11', fg='white', fontsize=8)

    arrow(7, 3.1, 7, 2.85)

    ax.set_title('AI Governance Platform — High-Level Architecture',
                 fontsize=13, fontweight='bold', color='#1E3A5F', pad=10)
    return fig


def make_pipeline_diagram():
    """Event Ingestion Pipeline flow diagram"""
    fig, ax = plt.subplots(figsize=(13, 9))
    fig.patch.set_facecolor('#FAFAFA')
    ax.set_facecolor('#FAFAFA')
    ax.set_xlim(0, 13)
    ax.set_ylim(0, 9)
    ax.axis('off')

    def step(x, y, w, h, num, title, detail, bg):
        rect = FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.08,rounding_size=0.25',
                               facecolor=bg, edgecolor='white', linewidth=2, zorder=3)
        ax.add_patch(rect)
        ax.text(x + 0.28, y + h/2, num, ha='center', va='center',
                color='white', fontsize=12, fontweight='bold', zorder=4)
        ax.text(x + 0.6 + (w-0.6)/2, y + h/2 + 0.18, title, ha='center', va='center',
                color='white', fontsize=9, fontweight='bold', zorder=4)
        ax.text(x + 0.6 + (w-0.6)/2, y + h/2 - 0.2, detail, ha='center', va='center',
                color='white', fontsize=7.5, alpha=0.9, zorder=4)

    def arw(x1, y1, x2, y2):
        ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle='->', color='#1E3A5F', lw=2.0), zorder=5)

    # Entry points
    ax.add_patch(FancyBboxPatch((0.3, 7.5), 12.4, 1.1, boxstyle='round,pad=0.08',
                                 facecolor='#BDD7EE', edgecolor='#1E3A5F', lw=1.5, zorder=1))
    ax.text(6.5, 8.25, 'EVENT ENTRY POINTS', ha='center', fontsize=9, fontweight='bold', color='#1E3A5F')
    eps = ['POST /telemetry/event', 'POST /control/ingest/trace',
           'POST /ingestion/webhook/{name}', 'POST /ingestion/upload/{name}']
    for i, ep in enumerate(eps):
        box_x = 0.45 + i * 3.1
        ax.add_patch(FancyBboxPatch((box_x, 7.55), 2.95, 0.65,
                                     boxstyle='round,pad=0.05', facecolor='#1E3A5F',
                                     edgecolor='white', lw=1, zorder=3))
        ax.text(box_x + 1.475, 7.875, ep, ha='center', va='center',
                color='white', fontsize=7.5, fontweight='bold', zorder=4)

    # Normalizer
    step(4.5, 6.3, 4, 0.85, '0', 'Ingestion Normalizer',
         'VendorAdapters: OpenAI · Anthropic · Google · Generic', '#7030A0')
    arw(6.5, 7.55, 6.5, 7.15)

    # Step 1
    step(1.0, 5.0, 5.0, 0.95, '1', 'INSERT telemetry_events',
         'Append-only source of truth · event_id generated', '#1E3A5F')
    arw(6.5, 6.3, 6.5, 5.95)
    arw(6.0, 5.95, 3.5, 5.95)

    # Step 2
    step(1.0, 3.7, 5.0, 0.95, '2', 'CostEngine.compute()',
         'Pre-computed → Model Pricing → Tool Registry fallback', '#2E75B6')
    arw(3.5, 5.0, 3.5, 4.65)

    # Step 3
    step(1.0, 2.4, 5.0, 0.95, '3', 'SecurityEngine.analyze()',
         'PII regex · Risk score = Σ RISK_WEIGHT_* env vars', '#C55A11')
    arw(3.5, 3.7, 3.5, 3.35)

    # Step 4
    step(1.0, 1.1, 5.0, 0.95, '4', 'AlertEngine.evaluate()',
         'PII · Data-Out · Budget · Quota · Rules · Anomalies', '#833C00')
    arw(3.5, 2.4, 3.5, 2.05)

    # Step 5 and 6
    step(7.0, 3.7, 5.5, 0.95, '5', 'UPSERT daily_org_summary',
         'Rebuilt hourly by APScheduler — fast dashboard reads', '#375623')
    step(7.0, 2.4, 5.5, 0.95, '6', 'NotificationService',
         'Email (SMTP) · MS Teams webhook · WhatsApp', '#1E3A5F')
    step(7.0, 1.1, 5.5, 0.95, '7', 'Langfuse Bridge (optional)',
         'Graceful no-op if package absent', '#5A5A5A')

    arw(6.0, 5.0, 9.25, 4.65)
    arw(9.25, 3.7, 9.25, 3.35)
    arw(9.25, 2.4, 9.25, 2.05)

    # DB outputs
    for xi, (lbl, yy) in enumerate([('cost_breakdown', 3.7),
                                      ('data_security_logs', 2.4),
                                      ('alerts', 1.1)]):
        bx = 0.3
        ax.add_patch(FancyBboxPatch((bx - 0.05, yy + 0.2), 0.75, 0.55,
                                     boxstyle='round,pad=0.03', facecolor='#FCE4D6',
                                     edgecolor='#C55A11', lw=1, zorder=3))
        ax.text(bx + 0.325, yy + 0.475, lbl, ha='center', va='center',
                color='#833C00', fontsize=6.5, fontweight='bold', zorder=4)

    ax.set_title('Event Ingestion Pipeline — End-to-End Flow',
                 fontsize=12, fontweight='bold', color='#1E3A5F', pad=8)
    return fig


def make_cost_engine_diagram():
    """Cost engine decision tree"""
    fig, ax = plt.subplots(figsize=(12, 7))
    fig.patch.set_facecolor('#FAFAFA')
    ax.set_facecolor('#FAFAFA')
    ax.set_xlim(0, 12)
    ax.set_ylim(0, 7)
    ax.axis('off')

    def dbox(x, y, w, h, text, bg='#1E3A5F', fg='white', fontsize=9):
        rect = FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.1,rounding_size=0.2',
                               facecolor=bg, edgecolor='white', linewidth=1.5, zorder=3)
        ax.add_patch(rect)
        ax.text(x + w/2, y + h/2, text, ha='center', va='center',
                color=fg, fontsize=fontsize, fontweight='bold', zorder=4,
                multialignment='center')

    def diamond(x, y, w, h, text, bg='#BF9000', fg='white'):
        import matplotlib.transforms as transforms
        cx, cy = x + w/2, y + h/2
        dx, dy = w/2, h/2
        xs = [cx, cx+dx, cx, cx-dx, cx]
        ys = [cy+dy, cy, cy-dy, cy, cy+dy]
        ax.fill(xs, ys, color=bg, zorder=3)
        ax.plot(xs, ys, color='white', linewidth=1.5, zorder=4)
        ax.text(cx, cy, text, ha='center', va='center', color=fg,
                fontsize=8, fontweight='bold', zorder=5, multialignment='center')

    def arw(x1, y1, x2, y2, label='', lx=0, ly=0):
        ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle='->', color='#2D2D2D', lw=1.5), zorder=5)
        if label:
            ax.text((x1+x2)/2+lx, (y1+y2)/2+ly, label, fontsize=8,
                    color='#2D2D2D', fontweight='bold', zorder=6)

    # Input
    dbox(4.5, 6.1, 3, 0.65, 'Event Payload Received', bg='#1E3A5F')

    # Diamond 1
    diamond(4.2, 4.9, 3.6, 0.9, 'precomputed_llm_cost\nsupplied?')
    arw(6, 6.1, 6, 5.8)
    dbox(9.0, 4.95, 2.7, 0.65, '✓  Use directly\n(pre-computed)', bg='#375623', fontsize=8)
    arw(7.8, 5.35, 9.0, 5.275, 'YES')

    # Diamond 2
    diamond(4.2, 3.7, 3.6, 0.9, 'model_pricing has\n(provider, model)?')
    arw(6, 4.9, 6, 4.6)
    dbox(9.0, 3.75, 2.7, 0.65, '✓  Token-based\n(input/output per 1M)', bg='#2E75B6', fontsize=8)
    arw(7.8, 4.15, 9.0, 4.075, 'YES')

    # Diamond 3
    diamond(4.2, 2.5, 3.6, 0.9, 'tool_registry has\ntool_name?')
    arw(6, 3.7, 6, 3.4)
    dbox(9.0, 2.55, 2.7, 0.65, '✓  Registry model\n(6 types below)', bg='#C55A11', fontsize=8)
    arw(7.8, 2.95, 9.0, 2.875, 'YES')

    # Fallback
    dbox(4.5, 1.4, 3, 0.65, 'Default rate fallback\n$0.0025 / 1k tokens', bg='#5A5A5A', fontsize=8)
    arw(6, 2.5, 6, 2.05)

    # NO labels
    for yy in [5.35, 4.15, 2.95]:
        ax.text(5.2, yy - 0.45, 'NO ↓', fontsize=8, color='#A81C1C', fontweight='bold', zorder=6)

    # 6 cost model types
    ax.add_patch(FancyBboxPatch((0.3, 0.1), 11.4, 1.0, boxstyle='round,pad=0.08',
                                 facecolor='#E8F4FF', edgecolor='#2E75B6', lw=1.5, zorder=1))
    ax.text(6, 0.97, 'Cost Model Types (stored in tool_registry)',
            ha='center', fontsize=8.5, fontweight='bold', color='#1E3A5F')
    types = [('per_token', '(tokens/1k)×rate'),
             ('per_request', 'flat base_cost'),
             ('per_second', '(ms/1000)×rate'),
             ('fixed', 'constant'),
             ('custom', 'multiplier+MB'),
             ('pre_computed', 'caller supplies')]
    for xi, (name, desc) in enumerate(types):
        bx = 0.45 + xi * 1.9
        ax.add_patch(FancyBboxPatch((bx, 0.15), 1.75, 0.68,
                                     boxstyle='round,pad=0.05', facecolor='#2E75B6',
                                     edgecolor='white', lw=1, zorder=3))
        ax.text(bx + 0.875, 0.63, name, ha='center', va='center',
                color='white', fontsize=8, fontweight='bold', zorder=4)
        ax.text(bx + 0.875, 0.33, desc, ha='center', va='center',
                color='white', fontsize=7, alpha=0.9, zorder=4)

    ax.set_title('CostEngine — Model Selection & Cost Type Decision Tree',
                 fontsize=11, fontweight='bold', color='#1E3A5F', pad=8)
    return fig


def make_multitenancy_diagram():
    """Multi-tenancy hierarchy"""
    fig, ax = plt.subplots(figsize=(11, 6))
    fig.patch.set_facecolor('#FAFAFA')
    ax.set_facecolor('#FAFAFA')
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 6)
    ax.axis('off')

    def node(x, y, w, h, title, detail, bg, fg='white'):
        rect = FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.1,rounding_size=0.2',
                               facecolor=bg, edgecolor='white', linewidth=2, zorder=3)
        ax.add_patch(rect)
        ax.text(x + w/2, y + h/2 + 0.15, title, ha='center', va='center',
                color=fg, fontsize=10, fontweight='bold', zorder=4)
        ax.text(x + w/2, y + h/2 - 0.18, detail, ha='center', va='center',
                color=fg, fontsize=7.5, alpha=0.85, zorder=4)

    def line(x1, y1, x2, y2):
        ax.plot([x1, x2], [y1, y2], color='#1E3A5F', linewidth=1.8,
                linestyle='--', zorder=2)
        ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle='->', color='#1E3A5F', lw=1.5), zorder=5)

    # Org
    node(3.5, 4.8, 4, 0.9, 'ORGANIZATION', 'org_id  |  plan_type  |  budget_limit', '#1E3A5F')

    # Projects
    node(0.3, 3.1, 3.2, 0.9, 'PROJECT A', 'project_id, org_id, environment', '#2E75B6')
    node(3.9, 3.1, 3.2, 0.9, 'PROJECT B', 'project_id, org_id, environment', '#2E75B6')
    node(7.5, 3.1, 3.2, 0.9, 'PROJECT C', 'project_id, org_id, environment', '#2E75B6')
    line(5.5, 4.8, 1.9, 4.0)
    line(5.5, 4.8, 5.5, 4.0)
    line(5.5, 4.8, 9.1, 4.0)

    # API Keys
    node(0.3, 1.5, 3.2, 0.9, 'API KEYS', 'org-level or project-scoped\nHMAC auth for SDK/webhooks', '#375623')
    node(3.9, 1.5, 3.2, 0.9, 'USERS', 'email, role\n(RBAC — Phase 1 target)', '#BF9000')
    node(7.5, 1.5, 3.2, 0.9, 'BUDGETS', 'limit_amount\nalert thresholds 80/90/100%', '#C55A11')
    for ox, nx in [(1.9, 1.9), (5.5, 5.5), (9.1, 9.1)]:
        line(ox, 3.1, nx, 2.4)

    # Data events
    node(3.5, 0.1, 4, 0.9, 'TELEMETRY EVENTS', 'org_id (required) + project_id (optional)', '#5A5A5A')
    line(5.5, 1.5, 5.5, 1.0)

    ax.set_title('Multi-Tenancy Model — Organisation Hierarchy',
                 fontsize=11, fontweight='bold', color='#1E3A5F', pad=8)
    return fig


def make_target_arch_diagram():
    """Target (future state) architecture"""
    fig, ax = plt.subplots(figsize=(14, 11))
    fig.patch.set_facecolor('#F0F4F8')
    ax.set_facecolor('#F0F4F8')
    ax.set_xlim(0, 14)
    ax.set_ylim(0, 11)
    ax.axis('off')

    def layer(x, y, w, h, label, bg, fg='#1E3A5F', lw=1.5):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.1',
                                     facecolor=bg, edgecolor='#1E3A5F', lw=lw, zorder=1))
        ax.text(x + 0.15, y + h - 0.22, label, fontsize=8.5, fontweight='bold',
                color=fg, zorder=2, va='top')

    def comp(x, y, w, h, title, sub='', bg='#1E3A5F', fg='white', fs=8):
        rect = FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.06,rounding_size=0.2',
                               facecolor=bg, edgecolor='white', linewidth=1.5, zorder=3)
        ax.add_patch(rect)
        cy = y + h/2 + (0.1 if sub else 0)
        ax.text(x + w/2, cy, title, ha='center', va='center',
                color=fg, fontsize=fs, fontweight='bold', zorder=4, multialignment='center')
        if sub:
            ax.text(x + w/2, y + h/2 - 0.18, sub, ha='center', va='center',
                    color=fg, fontsize=6.5, alpha=0.85, zorder=4, multialignment='center')

    def arw(x1, y1, x2, y2):
        ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle='->', color='#1E3A5F', lw=1.6), zorder=5)

    # Layer 0 — Producers
    layer(0.2, 9.7, 13.6, 1.1, 'PRODUCERS', '#BDD7EE')
    for xi, (t, s) in enumerate([('SDK\n(GovernanceDecorator)', 'Python · HMAC'),
                                   ('Direct REST API', 'JWT · API Key'),
                                   ('Webhooks', 'OpenAI/Anthropic/\nGoogle'),
                                   ('File Upload', 'JSON·JSONL\nCSV·Excel')]):
        comp(0.35 + xi*3.4, 9.75, 3.1, 0.9, t, s, bg='#1E3A5F', fs=7.5)

    # Layer 1 — Auth
    layer(0.2, 8.4, 13.6, 1.0, 'AUTH & SECURITY LAYER  (Phase 1)', '#F2DCDB')
    comp(0.35, 8.5, 3.0, 0.75, 'JWT Auth (RS256)', '15min access\n+ refresh tokens', bg='#A81C1C', fs=8)
    comp(3.55, 8.5, 3.0, 0.75, 'RBAC Middleware', 'super_admin/org_admin\nproject_admin/viewer', bg='#A81C1C', fs=8)
    comp(6.75, 8.5, 3.0, 0.75, 'Rate Limiter', 'per org_id + per IP\nvia Redis', bg='#A81C1C', fs=8)
    comp(9.95, 8.5, 3.6, 0.75, 'API Key Validator', 'HMAC-signed\norg or project scoped', bg='#A81C1C', fs=8)
    arw(7, 9.7, 7, 9.4)

    # Layer 2 — Ingestion
    layer(0.2, 6.8, 13.6, 1.35, 'INGESTION LAYER  (Async Background Tasks)', '#E2EFDA')
    comp(0.35, 6.9, 3.0, 1.0, 'IngestionNormalizer', 'Vendor adapter dispatch\nOpenAI·Anthropic·Google', bg='#375623', fs=8)
    comp(3.55, 6.9, 3.0, 1.0, 'CostEngine', '6 models\n100+ LLM prices', bg='#375623', fs=8)
    comp(6.75, 6.9, 3.0, 1.0, 'SecurityEngine', 'PII · Risk score\nAll env-driven', bg='#375623', fs=8)
    comp(9.95, 6.9, 3.6, 1.0, 'AlertEngine +\nEnforcer', '7 alert types\nadvisory/soft/hard block', bg='#375623', fs=8)
    arw(7, 8.4, 7, 8.15)

    # Layer 3 — API
    layer(0.2, 5.3, 13.6, 1.25, 'API LAYER  (FastAPI · 20 Routers · OTel Tracing)', '#DEEAF1')
    routers = ['telemetry\ncontrol', 'costs\nsummary', 'security\nalerts', 'governance\ntools',
               'orgs/projects\nbudgets', '/ws Events\n(WebSocket)']
    for xi, r in enumerate(routers):
        comp(0.35 + xi*2.27, 5.4, 2.1, 1.0, r, bg='#2E75B6', fs=8)
    arw(7, 6.8, 7, 6.55)

    # Layer 4 — Message Queue (future)
    layer(0.2, 4.1, 13.6, 0.95, 'MESSAGE QUEUE  (Redis Streams → Kafka at scale)', '#FFF2CC')
    comp(0.35, 4.18, 4.2, 0.72, 'Redis Streams  (Phase 2)', 'In-process fan-out\nlow latency', bg='#BF9000', fs=8)
    comp(4.75, 4.18, 4.2, 0.72, 'Kafka / Redpanda  (Phase 3)', 'High-throughput\n>5M events/day', bg='#BF9000', fs=8)
    comp(9.15, 4.18, 4.4, 0.72, 'Consumer Groups', 'CostWorker · SecurityWorker\nAlertWorker · AggregatorWorker', bg='#BF9000', fs=8)
    arw(7, 5.3, 7, 5.05)

    # Layer 5 — Data
    layer(0.2, 2.5, 13.6, 1.35, 'DATA LAYER', '#FCE4D6')
    comp(0.35, 2.6, 3.1, 1.0, 'PostgreSQL\nPrimary', 'Writes · Migrations\nAll transactional data', bg='#C55A11', fs=8)
    comp(3.65, 2.6, 3.1, 1.0, 'PostgreSQL\nRead Replica', 'Dashboard queries\nAggregation reads', bg='#C55A11', fs=8)
    comp(6.95, 2.6, 3.1, 1.0, 'Redis', 'Sessions · Cache\nRate limits · WS pubsub', bg='#C55A11', fs=8)
    comp(10.25, 2.6, 3.3, 1.0, 'Object Store\n(S3/GCS)', 'Cold archive (Parquet)\nData retention policy', bg='#C55A11', fs=8)
    arw(7, 4.1, 7, 3.85)

    # Layer 6 — Observability
    layer(0.2, 1.0, 13.6, 1.25, 'OBSERVABILITY STACK', '#E8F4FF')
    comp(0.35, 1.08, 2.9, 0.9, 'Prometheus\n+ Grafana', 'Metrics\nCustom panels', bg='#1E3A5F', fs=8)
    comp(3.45, 1.08, 2.9, 0.9, 'Jaeger / Tempo', 'Distributed tracing\nOTel SDK', bg='#1E3A5F', fs=8)
    comp(6.55, 1.08, 2.9, 0.9, 'ELK / Loki', 'Structured logs\nJSON lines', bg='#1E3A5F', fs=8)
    comp(9.65, 1.08, 4.0, 0.9, 'PagerDuty / OpsGenie\n+ Slack', 'Alert routing\nOn-call escalation', bg='#1E3A5F', fs=8)
    arw(7, 2.5, 7, 2.25)

    ax.set_title('AI Governance Platform — Target (Future State) Architecture',
                 fontsize=12, fontweight='bold', color='#1E3A5F', pad=10)
    return fig


def make_gap_radar():
    """Radar / spider chart of current vs target maturity"""
    categories = ['Authentication\n& RBAC', 'Data\nRetention', 'Policy\nEnforcement',
                  'Observability', 'Scalability', 'Testing\nCoverage', 'Frontend\nUX', 'Security\nHardening']
    N = len(categories)
    current  = [2, 1, 2, 2, 3, 2, 3, 3]
    target   = [5, 5, 4, 5, 5, 5, 5, 5]
    angles   = np.linspace(0, 2*np.pi, N, endpoint=False).tolist()
    angles  += angles[:1]
    current += current[:1]
    target  += target[:1]

    fig, ax = plt.subplots(figsize=(7, 7), subplot_kw=dict(polar=True))
    fig.patch.set_facecolor('#FAFAFA')
    ax.set_facecolor('#F0F4F8')
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(categories, size=9, color='#1E3A5F', fontweight='bold')
    ax.set_yticks([1, 2, 3, 4, 5])
    ax.set_yticklabels(['1', '2', '3', '4', '5'], size=7, color='#888888')
    ax.set_ylim(0, 5)
    ax.plot(angles, current, 'o-', linewidth=2, color='#C55A11', label='Current State')
    ax.fill(angles, current, alpha=0.2, color='#C55A11')
    ax.plot(angles, target, 'o-', linewidth=2, color='#1E3A5F', label='Target State')
    ax.fill(angles, target, alpha=0.15, color='#1E3A5F')
    ax.legend(loc='upper right', bbox_to_anchor=(1.3, 1.15), fontsize=10)
    ax.set_title('Architecture Maturity — Current vs Target', size=11,
                 fontweight='bold', color='#1E3A5F', pad=20)
    return fig


def make_roadmap_gantt():
    """Phased roadmap Gantt chart"""
    fig, ax = plt.subplots(figsize=(13, 6))
    fig.patch.set_facecolor('#FAFAFA')
    ax.set_facecolor('#FAFAFA')

    phases = [
        ('Phase 0 — Hardening',       0,  2, '#5A5A5A'),
        ('Phase 1 — Auth & RBAC',      1,  3, '#A81C1C'),
        ('Phase 2 — Data Retention',   3,  2, '#BF9000'),
        ('Phase 3 — Policy Enforce',   4,  3, '#375623'),
        ('Phase 4 — Frontend Upgrade', 5,  3, '#2E75B6'),
        ('Phase 5 — Scale Prep',       7,  4, '#1E3A5F'),
    ]
    tasks = [
        ('DB Indexes (9)',                        0, 0.5, '#5A5A5A'),
        ('Connection Pool Tuning',                0, 0.5, '#5A5A5A'),
        ('Structured Logging',                    0, 1.0, '#5A5A5A'),
        ('BackgroundTask Decoupling',             0.5, 1.0, '#5A5A5A'),
        ('Startup Config Validation',             1.0, 0.5, '#5A5A5A'),
        ('JWT Auth + Refresh Tokens',             1, 1.5, '#A81C1C'),
        ('RBAC Middleware',                       1.5, 1.5, '#A81C1C'),
        ('Frontend Login + Route Guard',          2, 1.5, '#A81C1C'),
        ('Data Retention Policies Table',         3, 1.0, '#BF9000'),
        ('Archival Background Task',              3.5, 1.5, '#BF9000'),
        ('Rate Limiting Middleware',              4, 1.0, '#BF9000'),
        ('GovernanceEnforcer Service',            4, 1.5, '#375623'),
        ('Hard/Soft Block Logic',                 4.5, 1.5, '#375623'),
        ('SDK Enforcement Handling',              5.5, 1.0, '#375623'),
        ('React Query Migration',                 5, 1.5, '#2E75B6'),
        ('WebSocket Real-Time Alerts',            5.5, 1.5, '#2E75B6'),
        ('CSV Export + Error Boundaries',         6, 1.5, '#2E75B6'),
        ('Redis (Cache + Sessions)',               7, 1.5, '#1E3A5F'),
        ('Read Replica Routing',                  7.5, 1.5, '#1E3A5F'),
        ('OpenTelemetry SDK',                     8, 2.0, '#1E3A5F'),
        ('Kubernetes Manifests',                  9, 2.0, '#1E3A5F'),
    ]

    months = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11']
    n = len(tasks)
    ax.set_xlim(-0.2, 11)
    ax.set_ylim(-0.5, n + 0.5)
    ax.set_yticks(range(n))
    ax.set_yticklabels([t[0] for t in reversed(tasks)], fontsize=8, color='#2D2D2D')
    ax.set_xticks(range(11))
    ax.set_xticklabels(months, fontsize=9, color='#1E3A5F', fontweight='bold')
    ax.grid(axis='x', color='#CCCCCC', linestyle='--', alpha=0.6)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    for i, (name, start, dur, color) in enumerate(reversed(tasks)):
        bar = ax.barh(i, dur, left=start, height=0.55, color=color, alpha=0.85,
                      edgecolor='white', linewidth=1.2)
        ax.text(start + dur/2, i, f'{dur*4:.0f}w', ha='center', va='center',
                color='white', fontsize=7.5, fontweight='bold')

    ax.set_title('Implementation Roadmap — Phased Delivery (11 months)',
                 fontsize=11, fontweight='bold', color='#1E3A5F', pad=8)

    legend_patches = [mpatches.Patch(color=c, label=n) for n, _, _, c in phases]
    ax.legend(handles=legend_patches, loc='lower right', fontsize=8, ncol=2)
    fig.tight_layout()
    return fig


# ═══════════════════════════════════════════════════════════════════════════════
# DOCUMENT SECTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def section_toc(doc):
    h1(doc, '1. Table of Contents')
    toc_items = [
        ('1.', 'Table of Contents', '3'),
        ('2.', 'Executive Summary', '4'),
        ('3.', 'Business Context & Objectives', '5'),
        ('4.', 'System Overview', '6'),
        ('5.', 'Current Architecture (AS-IS)', '7'),
        ('5.1', 'High-Level Architecture', '7'),
        ('5.2', 'Event Ingestion Pipeline', '8'),
        ('5.3', 'Cost Engine', '9'),
        ('5.4', 'Security & Alert Engine', '10'),
        ('5.5', 'Database Schema', '11'),
        ('5.6', 'API Surface (20 Routers)', '13'),
        ('5.7', 'Background Tasks', '14'),
        ('5.8', 'Multi-Tenancy Model', '15'),
        ('5.9', 'Frontend Architecture', '15'),
        ('6.', 'Non-Functional Requirements', '16'),
        ('7.', 'Gap Analysis', '17'),
        ('8.', 'Architecture Maturity Assessment', '18'),
        ('9.', 'Target Architecture (TO-BE)', '19'),
        ('9.1', 'Authentication & RBAC', '20'),
        ('9.2', 'Real-Time Event Bus', '21'),
        ('9.3', 'Scalable Ingestion Layer', '22'),
        ('9.4', 'Observability Stack', '23'),
        ('9.5', 'Policy Enforcement Engine', '24'),
        ('9.6', 'Data Retention & Archival', '24'),
        ('9.7', 'Frontend Improvements', '25'),
        ('9.8', 'Deployment & Scaling Strategy', '26'),
        ('10.', 'Architecture Decision Records (ADRs)', '27'),
        ('11.', 'Risk Register', '28'),
        ('12.', 'Implementation Roadmap', '29'),
        ('13.', 'Appendix — Environment Variables', '30'),
    ]
    tbl = doc.add_table(rows=len(toc_items), cols=3)
    tbl.style = 'Table Grid'
    for i, (num, title, pg) in enumerate(toc_items):
        cells = tbl.rows[i].cells
        bg = 'FFFFFF' if i % 2 == 0 else 'F5F5F5'
        for c in cells:
            set_cell_bg(c, bg)
            set_cell_borders(c, border_color='EEEEEE', size=2)
        add_run(cells[0].paragraphs[0], num, bold=True, size=9, color=ACCENT)
        add_run(cells[1].paragraphs[0], title, size=9, color=DARKGRAY)
        cells[2].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
        add_run(cells[2].paragraphs[0], pg, size=9, color=MIDGRAY)
        cells[0].width = Inches(0.5)
        cells[1].width = Inches(5.2)
        cells[2].width = Inches(0.6)
    doc.add_page_break()


def section_exec_summary(doc):
    h1(doc, '2. Executive Summary')
    body(doc,
         'This document presents a comprehensive Architecture Review Board (ARB) submission '
         'for the AI Governance & Observability Platform developed by Ampera Technology. '
         'The platform addresses a critical enterprise need: gaining full visibility and '
         'control over AI tooling expenditure, security posture, and policy compliance across '
         'an organisation\'s entire AI ecosystem.')
    body(doc,
         'The platform ingests telemetry events from any AI tool or LLM provider, computes '
         'costs in real-time using six configurable cost models, detects personally identifiable '
         'information (PII), evaluates governance rules, and surfaces everything through an '
         'interactive React dashboard. It is built on a zero-hardcode philosophy: all thresholds, '
         'risk weights, and enumerated values are configurable via environment variables or '
         'database tables, ensuring flexibility without code changes.')

    h2(doc, 'Key Platform Capabilities')
    caps = [
        ('Multi-Vendor Telemetry Ingestion',
         'Accepts events from any LLM provider (OpenAI, Anthropic, Google, Meta, Mistral, '
         'Cohere, DeepSeek, Perplexity, xAI) via REST API, webhook, or file upload.'),
        ('Real-Time Cost Intelligence',
         'Computes LLM token costs, infrastructure costs, and external tool costs per event '
         'using a six-level cost model hierarchy against a pricing catalogue of 100+ models.'),
        ('Security & PII Governance',
         'Detects PII in AI interactions, scores data security risk using configurable '
         'weighted factors, and flags data-exfiltration and misuse patterns.'),
        ('Policy-Driven Alerting',
         'Evaluates dynamic governance rules against live metrics and fires seven types of '
         'alerts with deduplication, covering budgets, token quotas, anomalies, and custom thresholds.'),
        ('Multi-Tenant Architecture',
         'Full organisation → project → user → API key hierarchy with cascade deletes and '
         'referential integrity enforced at database level.'),
        ('Extensible Decorator SDK',
         'A Python SDK that monkey-patches OpenAI and Anthropic clients at runtime, groups '
         'multi-step LLM calls into sessions, and streams governance telemetry automatically.'),
    ]
    for title, desc in caps:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.25)
        p.paragraph_format.space_after = Pt(5)
        add_run(p, f'{title}: ', bold=True, size=10, color=PRIMARY)
        add_run(p, desc, size=10, color=DARKGRAY)

    h2(doc, 'ARB Submission Scope')
    body(doc,
         'This submission covers the current AS-IS architecture, a structured gap analysis, '
         'a target TO-BE architecture with specific improvement proposals, architecture decision '
         'records for key technology choices, a risk register, and a phased implementation roadmap '
         'spanning eleven months.')
    doc.add_page_break()


def section_business_context(doc):
    h1(doc, '3. Business Context & Objectives')

    h2(doc, '3.1 Problem Statement')
    body(doc,
         'As organisations accelerate AI adoption, they face compounding governance challenges: '
         'unpredictable LLM API costs, undiscovered PII leakage in prompt/response data, absence '
         'of policy guardrails, and lack of cross-tool observability. Existing monitoring solutions '
         'are vendor-specific and fail to provide a unified governance layer across heterogeneous '
         'AI tooling stacks.')

    h2(doc, '3.2 Strategic Objectives')
    objectives = [
        'Provide real-time cost visibility and budget enforcement across all AI tools and vendors',
        'Detect and alert on security risks (PII leakage, data exfiltration, misuse patterns)',
        'Enable policy-as-code governance with configurable rules and automated alerting',
        'Support multi-tenant isolation for enterprises with multiple teams and projects',
        'Deliver a vendor-agnostic ingestion layer compatible with any AI provider or framework',
        'Offer an SDK that instruments existing AI applications with zero code changes',
    ]
    for obj in objectives:
        bullet(doc, obj)

    h2(doc, '3.3 Success Metrics')
    add_styled_table(doc,
        ['Metric', 'Current Baseline', 'Target'],
        [
            ('Mean time to detect cost overrun', 'Next day (manual review)', '< 5 minutes (alert-driven)'),
            ('PII detection coverage', 'Pattern-matched types only', '100% of defined PII categories'),
            ('API response time (P99) — ingest', 'Unmeasured', '< 300ms'),
            ('Dashboard load time (P90)', 'Unmeasured', '< 2 seconds'),
            ('Test coverage', '< 15%', '> 70% (unit + integration)'),
            ('Time to onboard new AI vendor', 'Manual code change', '< 30 min (connector config)'),
        ],
        col_widths=[2.5, 2.0, 2.0]
    )
    doc.add_page_break()


def section_system_overview(doc):
    h1(doc, '4. System Overview')

    h2(doc, '4.1 Technology Stack')
    add_styled_table(doc,
        ['Layer', 'Technology', 'Version', 'Rationale'],
        [
            ('Backend API', 'FastAPI (Python)', '0.115+', 'Async-native, OpenAPI auto-generation, type-safe'),
            ('Database', 'PostgreSQL', '15', 'ACID, JSON columns, window functions for aggregations'),
            ('ORM', 'SQLAlchemy', '2.x', 'Declarative models, connection pool management'),
            ('Task Scheduler', 'APScheduler', '3.x', 'In-process scheduler, no broker required'),
            ('Frontend', 'React', '18', 'Component model, rich ecosystem, Recharts for charts'),
            ('HTTP Client (FE)', 'Axios', 'latest', 'Interceptors for auth, request/response transform'),
            ('Visualisation', 'Recharts', 'latest', 'SVG-based, composable, React-native'),
            ('ORM Migrations', 'SQLAlchemy + ALTER', 'n/a', 'Auto-create at startup, safe ALTER scripts'),
            ('Deployment', 'Render / Docker', 'latest', 'Simple PaaS deployment, Docker Compose for local'),
            ('Notifications', 'SMTP / Teams / WA', 'env-driven', 'Multi-channel, zero-code channel config'),
        ],
        col_widths=[1.5, 1.8, 0.8, 2.4]
    )

    h2(doc, '4.2 Deployment Topology (Current)')
    body(doc,
         'The platform currently runs as a single FastAPI process on Render PaaS, connected to a '
         'managed PostgreSQL instance. APScheduler runs in-process within the same FastAPI worker. '
         'The React frontend is served as a static build from a separate Render static site deployment. '
         'No message queue, caching layer, or read replica is currently in use.')
    doc.add_page_break()


def section_current_arch(doc):
    h1(doc, '5. Current Architecture (AS-IS)')

    h2(doc, '5.1 High-Level Architecture')
    body(doc,
         'The platform follows a layered architecture: producers at the top send telemetry events '
         'through a FastAPI router layer, which passes them to a central processing kernel that '
         'invokes three synchronous engines (cost, security, alert). Results are persisted to '
         'PostgreSQL and surfaced via a React dashboard.')

    fig = make_hld_diagram()
    insert_image(doc, fig_to_docx_image(fig), width=Inches(6.3))
    add_caption(doc, 'High-Level Architecture — Current State')
    doc.add_paragraph()

    h2(doc, '5.2 Event Ingestion Pipeline')
    body(doc,
         'Every event entering the system — regardless of entry point — is normalised by the '
         'IngestionNormalizer and vendor-specific adapters, then processed synchronously through '
         '_ingest_event(). The pipeline is atomic per-event: if any engine raises an unhandled '
         'exception, the event insert is rolled back.')

    fig2 = make_pipeline_diagram()
    insert_image(doc, fig_to_docx_image(fig2), width=Inches(6.3))
    add_caption(doc, 'Event Ingestion Pipeline — End-to-End Flow')
    doc.add_paragraph()

    h3(doc, 'Pipeline Stages')
    stages = [
        ('Stage 0', 'IngestionNormalizer', 'Dispatches to vendor adapter (OpenAI, Anthropic, Google, Generic) and produces TelemetryEventCreate schema'),
        ('Stage 1', 'INSERT telemetry_events', 'Append-only write to the source-of-truth table. Generates unique event_id (UUID). Returns immediately if downstream engines are decoupled (target state).'),
        ('Stage 2', 'CostEngine.compute()', 'Resolves cost using 3-level fallback: pre-computed → model_pricing table → tool_registry fallback. Upserts cost_breakdown row.'),
        ('Stage 3', 'SecurityEngine.analyze()', 'PII regex matching, data-out violation check, misuse tag detection. Computes risk score as weighted sum of 7 configurable factors. Inserts data_security_logs.'),
        ('Stage 4', 'AlertEngine.evaluate()', 'Evaluates 7 alert trigger types with deduplication. Inserts alerts. Calls NotificationService for high-severity items.'),
        ('Stage 5', 'UPSERT daily_org_summary', 'Incremental update of pre-aggregated daily rollup for fast dashboard queries.'),
        ('Stage 6', 'NotificationService', 'Sends email (SMTP), MS Teams webhook, or WhatsApp notification for critical alerts.'),
        ('Stage 7', 'Langfuse Bridge', 'Optional mirror of event to Langfuse observability platform. Gracefully no-ops if package absent.'),
    ]
    add_styled_table(doc, ['Stage', 'Name', 'Description'], stages, col_widths=[0.7, 1.8, 4.0])

    h2(doc, '5.3 Cost Engine')
    body(doc,
         'The CostEngine implements a three-level fallback hierarchy to determine the cost of any '
         'AI interaction. Six cost model types are supported, all stored in the tool_registry table. '
         'Infrastructure costs are computed separately from LLM token costs using configurable '
         'per-millisecond and per-megabyte rates.')

    fig3 = make_cost_engine_diagram()
    insert_image(doc, fig_to_docx_image(fig3), width=Inches(6.3))
    add_caption(doc, 'CostEngine — Model Selection & Cost Type Decision Tree')
    doc.add_paragraph()

    add_styled_table(doc,
        ['Cost Model Type', 'Formula', 'Use Case'],
        [
            ('per_token', '(total_tokens / 1000) × base_cost', 'LLM APIs billed by token count'),
            ('per_request', 'flat base_cost per call', 'APIs with flat per-call pricing'),
            ('per_second', '(latency_ms / 1000) × rate_per_second', 'Streaming or time-billed APIs'),
            ('fixed', 'constant base_cost', 'Fixed-fee tool subscriptions'),
            ('custom', 'multiplier × (base + per_mb_in × MB_in + per_mb_out × MB_out)', 'Complex tiered pricing from metadata_json'),
            ('pre_computed', 'caller-supplied value passed through', 'When the producer already knows exact cost'),
        ],
        col_widths=[1.5, 2.8, 2.2]
    )

    h2(doc, '5.4 Security Engine & Alert Engine')

    h3(doc, 'SecurityEngine Risk Scoring')
    body(doc,
         'Risk score is computed as the sum of seven weighted factors, all configurable via '
         'environment variables (RISK_WEIGHT_* and RISK_CAP_*). No risk weights are hardcoded '
         'in the application code.')
    add_styled_table(doc,
        ['Factor', 'Env Variable', 'Default Weight', 'Cap'],
        [
            ('Input data volume', 'RISK_WEIGHT_INPUT_MB', '8 per MB', 'RISK_CAP_INPUT_MB = 25'),
            ('Output data volume', 'RISK_WEIGHT_OUTPUT_MB', '12 per MB', 'RISK_CAP_OUTPUT_MB = 25'),
            ('Token count', 'RISK_WEIGHT_TOKEN_PER_500', '4 per 500 tokens', 'RISK_CAP_TOKEN = 20'),
            ('PII detected', 'RISK_WEIGHT_PII', '+20 flat', '—'),
            ('Data-out violation', 'RISK_WEIGHT_DATA_OUT', '+15 flat', '—'),
            ('Misuse tag present', 'RISK_WEIGHT_MISUSE', '+20 flat', '—'),
            ('Non-success status', 'RISK_WEIGHT_ERROR', '+5 flat', '—'),
        ],
        col_widths=[2.0, 2.2, 1.5, 1.8]
    )

    h3(doc, 'AlertEngine — Seven Alert Trigger Types')
    add_styled_table(doc,
        ['Alert Type', 'Trigger Condition', 'Severity', 'Dedup Window'],
        [
            ('pii_detected', 'pii_detected = true on event', 'HIGH', 'ALERT_DEDUP_DAYS (default: 1 day)'),
            ('data_out_violation', 'data_out_violation = true on event', 'HIGH', '1 day per scope'),
            ('misuse_detected', 'misuse tag found in event.tags', 'CRITICAL', '1 day per scope'),
            ('budget_warning', 'cumulative cost ≥ threshold_pct % of budget limit', 'MEDIUM', '1 day per budget'),
            ('budget_mid', 'cumulative cost ≥ 90% of budget limit', 'HIGH', '1 day per budget'),
            ('budget_exhausted', 'cumulative cost ≥ 100% of budget limit', 'CRITICAL', '1 day per budget'),
            ('token_quota_warning', 'token usage ≥ ALERT_TOKEN_QUOTA_WARNING_PCT% of rate_limit', 'MEDIUM', '1 day per limit'),
            ('governance_rule', 'Custom metric threshold from governance_rules table', 'Configurable', 'Configurable'),
            ('anomaly_escalated', 'usage_anomaly converted to alert by alert-scan task', 'Configurable', '1 day per anomaly'),
        ],
        col_widths=[1.6, 2.6, 0.8, 1.5]
    )

    h2(doc, '5.5 Database Schema')
    body(doc,
         'The database consists of 30+ tables organised across six logical domains. All models '
         'use extend_existing=True to survive schema drift between deployments. Schema is '
         'created at startup via Base.metadata.create_all() supplemented by safe ALTER TABLE '
         'statements for columns added post-initial-deployment.')

    domains = [
        ('Events Domain', [
            ('telemetry_events', 'Append-only event log — primary source of truth for all downstream processing'),
            ('cost_breakdown', 'Per-event cost split: LLM cost, infrastructure cost, external tool cost'),
            ('execution_pipeline', 'Multi-step trace stages within a single unified event (stage order, latency, status)'),
            ('trace_model_usage', 'Per-model row within unified trace for drill-down queries'),
            ('trace_tool_usage', 'Per-tool row within unified trace'),
        ]),
        ('Security Domain', [
            ('data_security_logs', 'PII detection results, data-in/out volumes, risk scores per event'),
            ('alerts', 'Triggered alerts — immutable, status-tracked (active / resolved)'),
            ('usage_anomalies', 'Usage spike detections separate from rule-based alerts (open / acknowledged)'),
        ]),
        ('Governance & Config Domain', [
            ('governance_rules', 'Custom metric thresholds per org/project with operator and severity'),
            ('budgets', 'Cost caps with configurable alert percentages (default 80%, 90%, 100%)'),
            ('rate_limits', 'Token quota configuration per org and tool'),
        ]),
        ('Registry Domain', [
            ('tool_registry', 'Tool/vendor catalogue with cost model type and base cost'),
            ('tool_connectors', 'Webhook and API-pull source configurations with auth and sync state'),
            ('connector_sync_logs', 'Audit trail of all connector sync attempts (success, failure, no_data)'),
            ('model_registry', 'LLM model catalogue — fallback when model_pricing has no entry'),
            ('model_pricing', 'Per-million-token pricing for 100+ models across 10+ vendors'),
        ]),
        ('Multi-Tenancy Domain', [
            ('organizations', 'Top-level tenant — all data scoped by org_id'),
            ('projects', 'Optional sub-tenant within organisation for team isolation'),
            ('users', 'User records with email and role (RBAC enforcement pending — Phase 1)'),
            ('api_keys', 'SDK and webhook authentication keys, scoped to org or project'),
        ]),
        ('Aggregation Domain', [
            ('daily_org_summary', 'Pre-aggregated daily rollup rebuilt hourly — powers dashboard queries'),
            ('monthly_org_summary', 'Monthly rollup rebuilt daily at midnight'),
            ('decorator_registrations', 'Registry of all functions decorated by the GovernanceSDK'),
            ('tool_api_inventory', 'Tool-level function catalogue with call count, success rate, avg latency'),
            ('request_response_logs', 'Per-call input/output audit trail for decorator-instrumented code'),
            ('project_model_usage', 'Daily model usage rollup per project (call count, tokens, cost)'),
        ]),
    ]

    for domain_name, tables in domains:
        h3(doc, domain_name)
        add_styled_table(doc,
            ['Table', 'Purpose'],
            tables,
            col_widths=[2.0, 4.5]
        )

    h2(doc, '5.6 API Surface')
    body(doc,
         'The backend exposes 20 routers, all registered twice — unversioned (/x) and versioned '
         '(/api/v1/x) — for backwards compatibility. Key routers are summarised below.')
    add_styled_table(doc,
        ['Router', 'Key Endpoints', 'Purpose'],
        [
            ('telemetry', 'POST /event, GET /logs, GET /traces/{id}', 'Core event ingestion and retrieval'),
            ('control', 'POST /ingest, /ingest/trace, GET /quota, /cost-breakdown', 'Vendor-agnostic unified trace ingestion'),
            ('summary', 'GET /today, /daily, /monthly, /overview', 'Pre-aggregated rollup endpoints'),
            ('costs', 'GET /by-model, /by-project, /daily, /project-breakdown', 'Cost drill-down queries'),
            ('security', 'GET /logs, /anomalies, /summary', 'PII and risk data endpoints'),
            ('alerts', 'GET /, PATCH /{id}/resolve', 'Alert management'),
            ('alerts_security', 'GET /alerts, /logs, /anomalies, /summary', 'Combined hydrated alert + security view'),
            ('governance', 'GET /rules, POST /rules', 'Dynamic governance rule CRUD'),
            ('tools', 'GET /, POST /register, GET /connectors, POST /connectors', 'Tool registry and connector management'),
            ('decorator', 'GET /registrations, /inventory, /usage, /logs, /stats', 'GovernanceSDK function registry'),
            ('ingestion', 'POST /webhook/{name}, POST /upload/{name}, POST /pull', 'External data ingestion'),
            ('organizations', 'Full CRUD + cascade delete', 'Tenant management'),
            ('projects', 'Full CRUD + cascade delete', 'Sub-tenant management'),
            ('budgets', 'Full CRUD', 'Spend cap management'),
            ('pricing', 'GET /, POST /, PUT /{provider}/{model}', 'LLM pricing catalogue management'),
            ('lookups', 'GET /auth-types, /ingestion-modes, /event-statuses, …', 'Env-driven dropdown values for frontend'),
            ('auth', 'POST /login (STUB)', 'Authentication — not yet implemented'),
            ('workers', 'POST /daily-aggregation, /anomaly-detection, /alert-scan', 'Manual scheduler job triggers'),
            ('health', 'GET /health', 'Liveness check'),
        ],
        col_widths=[1.3, 2.5, 2.7]
    )

    h2(doc, '5.7 Background Tasks (APScheduler)')
    add_styled_table(doc,
        ['Task ID', 'Schedule', 'Function', 'Target Table'],
        [
            ('daily-aggregation', 'Every hour', 'Rebuild daily_org_summary for today using window aggregates', 'daily_org_summary'),
            ('monthly-aggregation', 'Daily at midnight', 'Rebuild monthly_org_summary for current month', 'monthly_org_summary'),
            ('anomaly-detection', 'Every 30 minutes', 'Detect usage spikes vs. 7-day rolling baseline (ratio: ANOMALY_SPIKE_RATIO)', 'usage_anomalies'),
            ('alert-scan', 'Every 30 minutes', 'Re-evaluate governance rules, escalate open anomalies to alerts', 'alerts'),
        ],
        col_widths=[1.5, 1.3, 3.0, 1.7]
    )

    h2(doc, '5.8 Multi-Tenancy Model')
    body(doc,
         'All data is scoped by a mandatory org_id, with an optional project_id for team isolation. '
         'The hierarchy is enforced via database foreign keys with cascade deletes.')

    fig4 = make_multitenancy_diagram()
    insert_image(doc, fig_to_docx_image(fig4), width=Inches(5.8))
    add_caption(doc, 'Multi-Tenancy Hierarchy — Organisation → Project → API Key')
    doc.add_paragraph()

    h2(doc, '5.9 Frontend Architecture')
    body(doc,
         'The React frontend consists of seven pages served via React Router. All backend '
         'communication is centralised in a single api.js Axios client that exports 50+ '
         'endpoint functions. State management is local (useState + useEffect) with no global '
         'state library. Charts are rendered with Recharts.')
    add_styled_table(doc,
        ['Page', 'Route', 'Key Data Displayed'],
        [
            ('Dashboard', '/', 'Cost today, events, active alerts, anomalies, usage trends, decorator stats'),
            ('Alerts & Security', '/alerts-security', 'Alerts table with resolve, security logs, anomalies, PII modal, quota'),
            ('Cost Module', '/cost', 'Cost by model/project/org, daily chart, budget management, decorator audit'),
            ('Tools', '/tools', 'Connector list + CRUD, sync logs, manual trigger'),
            ('Decorator', '/decorator', 'Function registry, inventory, daily usage, per-call audit log'),
            ('Security', '/security', 'PII logs, anomaly dashboard, risk scoring view'),
            ('Test Event', '/test', 'Manual telemetry event injection — for development and testing'),
        ],
        col_widths=[1.3, 1.2, 4.0]
    )
    doc.add_page_break()


def section_nfr(doc):
    h1(doc, '6. Non-Functional Requirements')
    add_styled_table(doc,
        ['Category', 'Requirement', 'Current State', 'Target'],
        [
            ('Performance', 'Event ingestion P99 latency', 'Unmeasured', '< 300ms'),
            ('Performance', 'Dashboard page load P90', 'Unmeasured', '< 2 seconds'),
            ('Performance', 'Cost engine computation time', 'Synchronous (< 50ms estimated)', '< 20ms (async)'),
            ('Scalability', 'Events per day', '< 50k (current deployment)', '> 1M (target)'),
            ('Scalability', 'Concurrent API connections', '20 (pool_size=3 × 7 workers)', '200 (pool_size=10 × 4 pods)'),
            ('Availability', 'Uptime SLA', 'Best-effort (single process)', '99.9% (multi-pod, health checks)'),
            ('Reliability', 'Event loss on process crash', 'Possible (in-memory pipeline)', '0 (queue-backed)'),
            ('Security', 'Auth method for UI users', 'None (no login)', 'JWT RS256 + RBAC'),
            ('Security', 'API key scope', 'Full access', 'Role-scoped per endpoint'),
            ('Data Retention', 'telemetry_events growth', 'Unbounded', '90-day hot + S3 cold archive'),
            ('Observability', 'Distributed tracing', 'None', 'OTel + Jaeger'),
            ('Observability', 'Metrics endpoint', 'None', 'Prometheus /metrics'),
            ('Compliance', 'PII handling', 'Detection only (no masking enforcement)', 'Detection + masking + right-to-delete API'),
            ('Testability', 'Unit test coverage', '< 15%', '> 70%'),
            ('Testability', 'Integration test coverage', '0%', '> 50% of critical paths'),
        ],
        col_widths=[1.3, 2.3, 1.9, 1.9]
    )
    doc.add_page_break()


def section_gap_analysis(doc):
    h1(doc, '7. Gap Analysis')
    body(doc,
         'Gaps are classified into three priority tiers: Critical (production blockers that create '
         'security or data integrity risk), Significant (quality and operational gaps), and '
         'Enhancements (features that add measurable business value).')

    h2(doc, '7.1 Critical Gaps — Production Blockers')
    add_styled_table(doc,
        ['Gap', 'Impact', 'Effort', 'Phase'],
        [
            ('No user authentication (auth router is a stub)', 'Any actor can access any organisation\'s data via the UI', 'Medium', 'Phase 1'),
            ('No RBAC enforcement', 'All callers have identical, unrestricted access to all endpoints', 'Medium', 'Phase 1'),
            ('No API rate limiting', 'Malicious or misconfigured clients can flood events, fill database', 'Low', 'Phase 2'),
            ('No data retention / TTL policy', 'telemetry_events grows unbounded, degrading query performance over time', 'Low', 'Phase 2'),
            ('No database indexes on hot columns', 'Dashboard queries will slow logarithmically as event volume grows', 'Low', 'Phase 0'),
            ('Connection pool too small (pool_size=3)', 'Under moderate concurrency, requests queue and timeout', 'Low', 'Phase 0'),
        ],
        col_widths=[2.5, 2.5, 0.6, 0.7]
    )

    h2(doc, '7.2 Significant Gaps — Production Quality')
    add_styled_table(doc,
        ['Gap', 'Impact', 'Effort', 'Phase'],
        [
            ('No structured logging (unstructured print/log)', 'Cannot search logs in production; no correlation with event_id', 'Low', 'Phase 0'),
            ('No OpenTelemetry instrumentation', 'No distributed tracing; latency breakdowns invisible', 'Medium', 'Phase 5'),
            ('No integration tests', 'Regressions in the core event pipeline go undetected until production', 'Medium', 'Phase 0'),
            ('No startup config validation', 'Misconfigured env vars fail silently or produce wrong results', 'Low', 'Phase 0'),
            ('APScheduler in-process', 'Background tasks contend with API requests for CPU/DB connections; drops tasks on restart', 'High', 'Phase 5'),
            ('No caching layer (Redis)', 'Identical dashboard queries hit PostgreSQL on every page load', 'Medium', 'Phase 5'),
            ('Policy enforcement — alerting only, no blocking', 'Governance violations are detected post-fact; no prevention capability', 'High', 'Phase 3'),
            ('Synchronous event processing pipeline', 'Slow engines delay HTTP response; burst traffic degrades P99 latency', 'High', 'Phase 0'),
        ],
        col_widths=[2.5, 2.3, 0.6, 0.7]
    )

    h2(doc, '7.3 Enhancement Opportunities')
    add_styled_table(doc,
        ['Enhancement', 'Business Value', 'Effort', 'Phase'],
        [
            ('ML-based anomaly detection (ARIMA / Isolation Forest)', 'Fewer false positives; seasonal pattern awareness', 'High', 'Future'),
            ('Scheduled report emails (daily/weekly digest)', 'Reduces need for humans to open dashboard; executive visibility', 'Medium', 'Future'),
            ('PDF / CSV export from all dashboard tables', 'Enterprise compliance and audit requirements', 'Low', 'Phase 4'),
            ('Slack / PagerDuty / OpsGenie alert channels', 'Meets enterprise alert routing expectations', 'Medium', 'Future'),
            ('Real-time WebSocket updates for dashboard', 'Live governance view; alerts appear without page refresh', 'Medium', 'Phase 4'),
            ('LLM prompt content storage and replay', 'Debug governance violations at the prompt level', 'High', 'Future'),
            ('GDPR right-to-delete API', 'Regulatory compliance for EU deployments', 'Medium', 'Phase 2'),
            ('Dark mode + mobile responsive UI', 'Improves accessibility and UX quality', 'Medium', 'Phase 4'),
        ],
        col_widths=[2.5, 2.3, 0.6, 0.7]
    )
    doc.add_page_break()


def section_maturity(doc):
    h1(doc, '8. Architecture Maturity Assessment')
    body(doc,
         'The radar chart below plots current architecture maturity (scored 1–5) against the '
         'target state across eight architectural dimensions. A score of 3 indicates a functioning '
         'but unoptimised capability; 5 indicates production-grade with monitoring and automation.')

    fig = make_gap_radar()
    insert_image(doc, fig_to_docx_image(fig), width=Inches(4.5))
    add_caption(doc, 'Architecture Maturity — Current vs. Target State (1=Basic, 5=Production-Grade)')
    doc.add_paragraph()

    add_styled_table(doc,
        ['Dimension', 'Current Score', 'Target Score', 'Key Gap'],
        [
            ('Authentication & RBAC', '2 / 5', '5 / 5', 'Auth router is a stub; no user sessions, no role enforcement'),
            ('Data Retention', '1 / 5', '5 / 5', 'No TTL, archival, or cold storage strategy'),
            ('Policy Enforcement', '2 / 5', '4 / 5', 'Advisory alerts only; no soft-block or hard-block capability'),
            ('Observability', '2 / 5', '5 / 5', 'Unstructured logging only; no metrics, no distributed tracing'),
            ('Scalability', '3 / 5', '5 / 5', 'Single process; no caching, no read replica, small connection pool'),
            ('Testing Coverage', '2 / 5', '5 / 5', '< 15% coverage; no integration or E2E tests'),
            ('Frontend UX', '3 / 5', '5 / 5', 'No real-time updates, no export, no error boundaries, no dark mode'),
            ('Security Hardening', '3 / 5', '5 / 5', 'API key auth only; no rate limiting, no audit log, no encryption at rest'),
        ],
        col_widths=[1.9, 1.1, 1.1, 3.4]
    )
    doc.add_page_break()


def section_target_arch(doc):
    h1(doc, '9. Target Architecture (TO-BE)')
    body(doc,
         'The target architecture introduces six major improvements while preserving the '
         'zero-hardcode philosophy and vendor-agnostic design that are core strengths of '
         'the current implementation. Changes are additive and backward-compatible.')

    fig = make_target_arch_diagram()
    insert_image(doc, fig_to_docx_image(fig), width=Inches(6.5))
    add_caption(doc, 'Target Architecture — Future State (all layers)')
    doc.add_paragraph()

    h2(doc, '9.1 Authentication & RBAC (Phase 1)')
    body(doc,
         'Replace the stub auth router with a full JWT RS256 authentication system. '
         'Introduce four roles enforced via a FastAPI dependency injected into every route.')
    add_styled_table(doc,
        ['Role', 'Scope', 'Allowed Operations'],
        [
            ('super_admin', 'All organisations', 'Full CRUD on all resources; can create/delete orgs'),
            ('org_admin', 'Own organisation', 'Full CRUD on own org, all projects, users, budgets, rules'),
            ('project_admin', 'Assigned projects', 'Full CRUD within assigned projects; read-only on org'),
            ('viewer', 'Own org / assigned projects', 'Read-only access to dashboards, alerts, costs'),
        ],
        col_widths=[1.3, 1.7, 3.5]
    )
    bullet(doc, 'New endpoints: POST /auth/login → {access_token, refresh_token}; POST /auth/refresh')
    bullet(doc, 'get_current_user() FastAPI dependency injected into all 20 routers')
    bullet(doc, 'All queries automatically scoped to current_user.org_id and project_ids')
    bullet(doc, 'Frontend: login page, httpOnly JWT cookie, <PrivateRoute> wrapper, token refresh interceptor')

    h2(doc, '9.2 Real-Time Event Bus (Phase 0 → Phase 2 → Phase 3)')
    body(doc,
         'Decouple the synchronous engine pipeline from the HTTP request path to improve '
         'ingestion latency and resilience. The approach is progressive:')
    add_styled_table(doc,
        ['Phase', 'Mechanism', 'Infrastructure Added', 'Events/Day Capacity'],
        [
            ('Phase 0', 'FastAPI BackgroundTasks (immediate)', 'None — zero infrastructure', '< 200k'),
            ('Phase 2', 'Redis Streams consumer groups', 'Redis instance', '< 2M'),
            ('Phase 3', 'Kafka / Redpanda topic', 'Kafka cluster', '> 5M'),
        ],
        col_widths=[0.8, 2.5, 2.2, 1.9]
    )
    body(doc,
         'Phase 0 change: extract engine calls from the HTTP handler into background_tasks.add_task(). '
         'Add processing_status column to telemetry_events. Return 202 Accepted with event_id immediately.')

    h2(doc, '9.3 Scalable Ingestion Layer (Phase 0)')
    body(doc, 'Nine targeted database indexes and connection pool tuning address the most immediate scalability risks:')
    add_styled_table(doc,
        ['Index', 'SQL', 'Rationale'],
        [
            ('Events by org + date', 'CREATE INDEX idx_te_org_created ON telemetry_events(org_id, created_at DESC)', 'Primary filter for all dashboard queries'),
            ('Events by project', 'CREATE INDEX idx_te_project ON telemetry_events(project_id, created_at DESC)', 'Project drill-down queries'),
            ('Events by tool', 'CREATE INDEX idx_te_tool ON telemetry_events(tool_name, created_at DESC)', 'Tool usage analytics'),
            ('Cost breakdown by event', 'CREATE INDEX idx_cb_event ON cost_breakdown(event_id)', 'Trace detail joins'),
            ('Security logs by org', 'CREATE INDEX idx_dsl_org ON data_security_logs(org_id, created_at DESC)', 'Security dashboard'),
            ('Alerts by org + status', 'CREATE INDEX idx_alerts_org ON alerts(org_id, status, created_at DESC)', 'Alert table queries'),
            ('Anomalies by org', 'CREATE INDEX idx_anom_org ON usage_anomalies(org_id, status, created_at DESC)', 'Anomaly dashboard'),
            ('Daily summary by date', 'CREATE INDEX idx_dos_org_date ON daily_org_summary(org_id, date DESC)', 'Summary endpoint'),
            ('Governance rules by org', 'CREATE INDEX idx_gr_active ON governance_rules(org_id, is_active)', 'Alert scan task'),
        ],
        col_widths=[1.5, 3.0, 2.0]
    )

    h2(doc, '9.4 Observability Stack (Phase 5)')
    body(doc,
         'Instrument the backend with OpenTelemetry SDK for distributed tracing and Prometheus '
         'for metrics. Add structlog for structured JSON logging.')
    add_styled_table(doc,
        ['Component', 'Technology', 'Purpose'],
        [
            ('Distributed Tracing', 'OpenTelemetry SDK + Jaeger / Tempo', 'Trace per-request latency across all services'),
            ('Metrics', 'prometheus_fastapi_instrumentator + Prometheus', 'request_count, p99 latency, error_rate, events_ingested/min'),
            ('Structured Logging', 'structlog (JSON lines to stdout)', 'Searchable logs with event_id, org_id, trace correlation'),
            ('Log Aggregation', 'ELK Stack / Grafana Loki', 'Centralised log storage and search'),
            ('Dashboards', 'Grafana', 'Ingestion rate, cost engine errors, alert fire rate, DB pool utilisation'),
            ('Alert Routing', 'Alertmanager → PagerDuty / Slack', 'On-call escalation for infrastructure alerts'),
        ],
        col_widths=[1.6, 2.2, 2.7]
    )

    h2(doc, '9.5 Policy Enforcement Engine (Phase 3)')
    body(doc,
         'Upgrade governance from advisory-only to a three-tier enforcement model. '
         'A new GovernanceEnforcer service is called before inserting each event.')
    add_styled_table(doc,
        ['Enforcement Level', 'Behaviour', 'HTTP Status', 'New governance_rules Column'],
        [
            ('advisory', 'Alert created; event accepted normally (current behaviour)', '200 OK', 'enforcement_level = advisory'),
            ('soft_block', 'Event accepted; response includes governance.warnings array for SDK display', '200 OK + warnings', 'enforcement_level = soft_block'),
            ('hard_block', 'Event rejected; caller receives structured governance_violation error', '429 / 403', 'enforcement_level = hard_block'),
        ],
        col_widths=[1.5, 2.5, 1.3, 2.2]
    )

    h2(doc, '9.6 Data Retention & Archival (Phase 2)')
    body(doc,
         'Introduce a data_retention_policies table and a daily APScheduler job that archives '
         'old events to S3 as Parquet files and deletes them from PostgreSQL.')
    add_styled_table(doc,
        ['Table', 'Hot Retention', 'Cold Archive', 'Never Delete'],
        [
            ('telemetry_events', '90 days', 'S3 Parquet (partitioned by org_id/date)', '—'),
            ('data_security_logs', '180 days', 'S3 Parquet', '—'),
            ('alerts', '365 days', 'S3 Parquet', 'Keep active alerts indefinitely'),
            ('cost_breakdown', '90 days', 'S3 Parquet', '—'),
            ('daily_org_summary', 'Indefinite', '—', 'Keep forever (small, pre-aggregated)'),
            ('connector_sync_logs', '30 days', '—', '—'),
        ],
        col_widths=[2.0, 1.3, 2.5, 1.7]
    )

    h2(doc, '9.7 Frontend Improvements (Phase 4)')
    improvements = [
        ('React Query (@tanstack/react-query)', 'Replace all useEffect + useState data fetching with useQuery hooks. Benefits: automatic background refresh, request deduplication, cache management, and clean loading/error states.'),
        ('WebSocket Real-Time Alerts', 'Add a /ws/events/{org_id} FastAPI WebSocket endpoint publishing new alerts and anomalies. React useWebSocket hook updates dashboard in real time without polling.'),
        ('CSV / PDF Export', 'Add exportToCSV utility callable from all data tables. Export triggers client-side with no new backend endpoints.'),
        ('Error Boundaries', 'Wrap each page in React ErrorBoundary with a PageError fallback. Prevents full-app white screen on partial data failures.'),
        ('shadcn/ui + Tailwind CSS', 'Incrementally replace custom CSS with accessible, composable components. Add dark mode toggle via class="dark" on the root element.'),
    ]
    for title, desc in improvements:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.25)
        p.paragraph_format.space_after = Pt(5)
        add_run(p, f'{title}: ', bold=True, size=10, color=ACCENT)
        add_run(p, desc, size=10, color=DARKGRAY)

    h2(doc, '9.8 Deployment & Scaling Strategy')
    body(doc, 'Three deployment phases aligned with event volume growth:')
    add_styled_table(doc,
        ['Phase', 'Event Volume', 'Infrastructure', 'Key Change'],
        [
            ('Phase 1 — Optimised Single-Server', '< 500k/day', 'Docker Compose (2 API replicas + managed PG)', 'DB indexes, pool tuning, health checks, structured logging'),
            ('Phase 2 — Kubernetes', '500k – 5M/day', 'K8s: API Deployment (×3) + Worker Deployment (×2) + PG primary + read replica + Redis', 'Separate API and worker pods; read replica routing; Redis cache'),
            ('Phase 3 — Event Streaming', '> 5M/day', 'Kafka / Redpanda topic + Consumer groups (auto-scale on lag) + TimescaleDB', 'Async event pipeline; streaming aggregations; hypertable partitioning'),
        ],
        col_widths=[2.0, 1.3, 2.2, 2.0]
    )
    doc.add_page_break()


def section_adrs(doc):
    h1(doc, '10. Architecture Decision Records (ADRs)')

    adrs = [
        ('ADR-001', 'Zero-hardcode philosophy for all configurable values',
         'All enumerated values (dropdown options, risk weights, alert thresholds) must come from environment variables or database tables — never hardcoded in Python or SQL.',
         'Avoids code deployments for operational tuning. Enables per-org or per-project customisation without branching. Risk: misconfigured env vars can produce incorrect results silently (mitigated by startup validation in Phase 0).'),
        ('ADR-002', 'APScheduler over Celery for background tasks',
         'Use APScheduler running in-process within FastAPI rather than Celery with Redis/RabbitMQ.',
         'Zero infrastructure overhead for current scale (< 500k events/day). Simple deployment. Accepted risk: tasks share CPU and DB connections with API requests. Migration path to Celery is defined for Phase 5 when scale demands it.'),
        ('ADR-003', 'Dual-path API registration (/x and /api/v1/x)',
         'Register all routes twice — unversioned and versioned — in main.py to support legacy integrations while enabling versioned clients.',
         'Enables incremental migration of SDK clients to versioned endpoints without breaking existing integrations. Cost: doubled route registration code, small memory overhead.'),
        ('ADR-004', 'Single api.js as the sole frontend-backend interface',
         'All Axios calls are centralised in one file that exports named functions. No component makes direct Axios calls.',
         'Single point for adding auth headers, request logging, and error normalisation. Easy to mock in tests. Trade-off: file grows large (50+ functions); recommend splitting by domain (costs.api.js, security.api.js) in Phase 4.'),
        ('ADR-005', 'SQLAlchemy auto-create + safe ALTER over Alembic',
         'Tables are created at startup via Base.metadata.create_all(). Column additions use ALTER TABLE ... ADD COLUMN IF NOT EXISTS in _SAFE_ALTERS list.',
         'Simplifies development and deployment — no migration script management. Accepted risk: schema drift between environments is possible. For Phase 1+, introduce Alembic for tracked migrations to support multi-pod deployments safely.'),
        ('ADR-006', 'PostgreSQL as the sole data store (no time-series DB)',
         'Use PostgreSQL with pre-aggregated summary tables rather than a dedicated time-series database (InfluxDB, TimescaleDB).',
         'Reduces operational complexity. Pre-aggregated daily/monthly summaries provide fast dashboard queries at current scale. Migration path to TimescaleDB hypertables is defined for Phase 3 (> 5M events/day).'),
        ('ADR-007', 'Vendor adapters as pluggable normalizers',
         'Each vendor integration is a standalone adapter class implementing normalize() and optional pull() methods, loaded by provider name.',
         'New vendor support requires only a new adapter file with no changes to the core pipeline. Tested independently. Current adapters: OpenAI, Anthropic, Google, Generic fallback.'),
    ]

    for adr_id, title, decision, rationale in adrs:
        h3(doc, f'{adr_id}: {title}')
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.2)
        add_run(p, 'Decision: ', bold=True, size=10, color=PRIMARY)
        add_run(p, decision, size=10, color=DARKGRAY)
        p2 = doc.add_paragraph()
        p2.paragraph_format.left_indent = Inches(0.2)
        p2.paragraph_format.space_after = Pt(8)
        add_run(p2, 'Rationale & Trade-offs: ', bold=True, size=10, color=PRIMARY)
        add_run(p2, rationale, size=10, color=DARKGRAY)

    doc.add_page_break()


def section_risks(doc):
    h1(doc, '11. Risk Register')
    body(doc,
         'The following risks are identified across security, operational, and data domains. '
         'Each risk includes likelihood, impact, and the mitigating phase from the roadmap.')
    add_styled_table(doc,
        ['Risk ID', 'Risk Description', 'Likelihood', 'Impact', 'Severity', 'Mitigation', 'Phase'],
        [
            ('R-001', 'Unauthorised access to all org data via UI (no auth)', 'HIGH', 'CRITICAL', 'CRITICAL', 'Implement JWT auth + RBAC', 'P1'),
            ('R-002', 'Database growth degrades query performance over time', 'HIGH', 'HIGH', 'HIGH', 'DB indexes + data retention policy', 'P0/P2'),
            ('R-003', 'Event loss on FastAPI process crash (in-memory pipeline)', 'MEDIUM', 'HIGH', 'HIGH', 'BackgroundTasks → Redis Streams queue', 'P0/P2'),
            ('R-004', 'APScheduler tasks starved under API burst load', 'MEDIUM', 'MEDIUM', 'MEDIUM', 'Separate worker pods (Celery)', 'P5'),
            ('R-005', 'Misconfigured RISK_WEIGHT_* env vars produce wrong risk scores', 'MEDIUM', 'HIGH', 'HIGH', 'Startup config validation with range checks', 'P0'),
            ('R-006', 'PII leakage in LLM interactions goes undetected for new PII types', 'MEDIUM', 'CRITICAL', 'HIGH', 'Expand PII pattern library; add ML-based detection', 'Future'),
            ('R-007', 'Cost overrun from unbounded infra cost accumulation', 'LOW', 'HIGH', 'MEDIUM', 'Budget alerts already implemented; add hard-block enforcement', 'P3'),
            ('R-008', 'Single PostgreSQL instance becomes SPOF under load', 'LOW', 'CRITICAL', 'HIGH', 'Add read replica; implement connection pooler (PgBouncer)', 'P5'),
            ('R-009', 'API key compromised (no rotation, no scope restriction)', 'MEDIUM', 'HIGH', 'HIGH', 'Add key rotation API; scope keys to endpoint groups', 'P1'),
            ('R-010', 'Frontend builds against production API URL (hardcoded in api.js)', 'HIGH', 'LOW', 'MEDIUM', 'Move base URL to REACT_APP_API_URL env var exclusively', 'P0'),
        ],
        col_widths=[0.6, 2.6, 0.8, 0.7, 0.7, 1.9, 0.5]
    )
    doc.add_page_break()


def section_roadmap(doc):
    h1(doc, '12. Implementation Roadmap')
    body(doc,
         'The roadmap is organised into five phases spanning eleven months. Phases 0 and 1 '
         'address critical production risks. Later phases add scale and advanced capabilities.')

    fig = make_roadmap_gantt()
    insert_image(doc, fig_to_docx_image(fig), width=Inches(6.5))
    add_caption(doc, 'Implementation Roadmap — Phased Delivery (11 months)')
    doc.add_paragraph()

    phases = [
        ('Phase 0 — Hardening', 'Weeks 1–8', '#5A5A5A',
         'Zero new features. Maximum risk reduction per engineering hour.',
         [
             ('DB indexes — 9 targeted indexes on all hot query columns', 'Phase 0'),
             ('Connection pool: pool_size 3 → 10, max_overflow=20, pool_recycle=300', 'Phase 0'),
             ('Structured logging via structlog (JSON lines to stdout)', 'Phase 0'),
             ('Decouple engine calls from HTTP path via FastAPI BackgroundTasks', 'Phase 0'),
             ('Startup env var validation with range and type checks', 'Phase 0'),
             ('Prometheus metrics endpoint via prometheus_fastapi_instrumentator', 'Phase 0'),
             ('Priority integration tests: pipeline, cost accuracy, alert fire', 'Phase 0'),
         ]),
        ('Phase 1 — Authentication & RBAC', 'Months 2–4', '#A81C1C',
         'Closes the most critical security gap — no authentication for UI users.',
         [
             ('Add password_hash, role columns to users table (migration)', 'Phase 1'),
             ('Implement /auth/login (JWT RS256) and /auth/refresh', 'Phase 1'),
             ('Create get_current_user() FastAPI dependency, inject into all 20 routers', 'Phase 1'),
             ('Add require_role() decorator to all write endpoints', 'Phase 1'),
             ('Scope all queries to current_user.org_id and project_ids', 'Phase 1'),
             ('Frontend: login page, httpOnly JWT cookie, PrivateRoute, refresh interceptor', 'Phase 1'),
             ('Add API key rotation endpoint and scope restriction', 'Phase 1'),
         ]),
        ('Phase 2 — Data Quality & Retention', 'Months 4–5', '#BF9000',
         'Prevents database bloat and adds operational rate limiting.',
         [
             ('Create data_retention_policies table', 'Phase 2'),
             ('Implement archival APScheduler task (export to S3 Parquet, delete from PG)', 'Phase 2'),
             ('Add per-org rate limiting middleware using Redis token bucket', 'Phase 2'),
             ('Implement config audit log table for budget/rule/org changes', 'Phase 2'),
             ('GDPR right-to-delete API endpoint', 'Phase 2'),
         ]),
        ('Phase 3 — Policy Enforcement', 'Months 5–7', '#375623',
         'Upgrades governance from reactive alerting to proactive enforcement.',
         [
             ('Add enforcement_level column to governance_rules', 'Phase 3'),
             ('Implement GovernanceEnforcer service (advisory / soft_block / hard_block)', 'Phase 3'),
             ('Hook GovernanceEnforcer into _ingest_event() pre-insert', 'Phase 3'),
             ('Return enforcement context in ingest response schema', 'Phase 3'),
             ('Update GovernanceSDK to handle governance_violation errors gracefully', 'Phase 3'),
         ]),
        ('Phase 4 — Frontend Upgrade', 'Months 6–8', '#2E75B6',
         'Modernises the frontend for real-time visibility and enterprise UX.',
         [
             ('Migrate all useEffect data fetching to React Query useQuery hooks', 'Phase 4'),
             ('Add WebSocket endpoint and useWebSocket React hook for live alerts', 'Phase 4'),
             ('Add CSV export to all data tables (client-side, no new endpoints)', 'Phase 4'),
             ('Add ErrorBoundary around each page with PageError fallback component', 'Phase 4'),
             ('Introduce shadcn/ui + Tailwind CSS incrementally alongside existing CSS', 'Phase 4'),
             ('Add dark mode toggle via Tailwind dark: class on root element', 'Phase 4'),
         ]),
        ('Phase 5 — Scale Preparation', 'Months 8–11', '#1E3A5F',
         'Prepares the platform for high-volume enterprise deployments.',
         [
             ('Add Redis for session storage, cache, rate limiting, and WS pubsub', 'Phase 5'),
             ('Add PostgreSQL read replica and route dashboard queries to it', 'Phase 5'),
             ('Add PgBouncer connection pooler in front of primary database', 'Phase 5'),
             ('Migrate APScheduler background tasks to Celery + Redis broker', 'Phase 5'),
             ('Instrument with OpenTelemetry SDK (FastAPI + SQLAlchemy auto-instrumentation)', 'Phase 5'),
             ('Write Kubernetes Deployment, Service, HPA, and ConfigMap manifests', 'Phase 5'),
             ('Evaluate Kafka / Redpanda for event bus at > 2M events/day', 'Phase 5'),
         ]),
    ]

    for phase_name, timeline, color, description, tasks in phases:
        h2(doc, f'{phase_name}  [{timeline}]')
        body(doc, description)
        for task, _ in tasks:
            bullet(doc, task)
        doc.add_paragraph()

    doc.add_page_break()


def section_appendix(doc):
    h1(doc, '13. Appendix — Key Environment Variables')
    body(doc,
         'All operational parameters are configurable via environment variables. '
         'Copy backend/.env.example to backend/.env and set values before deployment.')
    add_styled_table(doc,
        ['Variable', 'Default', 'Purpose'],
        [
            ('DATABASE_URL', '(required)', 'PostgreSQL connection string'),
            ('CORS_ORIGINS', '*', 'Comma-separated allowed CORS origins'),
            ('GOVERNANCE_MASTER_KEY', '(required)', 'Bootstrap API key for first org creation'),
            ('COST_DEFAULT_RATE_PER_1K', '0.0025', 'Fallback LLM token rate ($ per 1k tokens)'),
            ('COST_INFRA_RATE_PER_MS', '0.00008', 'Infrastructure cost per millisecond of latency'),
            ('COST_INFRA_RATE_PER_MB', '0.00001', 'Infrastructure cost per MB data transferred'),
            ('RISK_WEIGHT_PII', '20', 'Risk score added when PII is detected'),
            ('RISK_WEIGHT_DATA_OUT', '15', 'Risk score added for data-out violation'),
            ('RISK_WEIGHT_MISUSE', '20', 'Risk score added when misuse tag is present'),
            ('RISK_WEIGHT_INPUT_MB', '8', 'Risk score per MB of input data'),
            ('RISK_WEIGHT_OUTPUT_MB', '12', 'Risk score per MB of output data'),
            ('RISK_WEIGHT_TOKEN_PER_500', '4', 'Risk score per 500 tokens'),
            ('RISK_WEIGHT_ERROR', '5', 'Risk score for non-success event status'),
            ('RISK_CAP_INPUT_MB', '25', 'Maximum risk contribution from input volume'),
            ('RISK_CAP_OUTPUT_MB', '25', 'Maximum risk contribution from output volume'),
            ('RISK_CAP_TOKEN', '20', 'Maximum risk contribution from token count'),
            ('ALERT_BUDGET_DEFAULT_THRESHOLD_PCT', '80', 'Budget alert fires at this % of limit'),
            ('ALERT_BUDGET_MID_PCT', '90', 'Mid-level budget alert threshold'),
            ('ALERT_TOKEN_QUOTA_WARNING_PCT', '80', 'Token quota alert fires at this % of limit'),
            ('ALERT_DEDUP_DAYS', '1', 'Suppress duplicate alerts within N days'),
            ('ANOMALY_SPIKE_RATIO', '1.8', 'Multiplier over 7-day baseline to flag as anomaly'),
            ('ANOMALY_BASELINE_DAYS', '7', 'Days of history used to compute baseline'),
            ('LOOKUP_AUTH_TYPES', 'API Key,OAuth,…', 'Dropdown values for auth type selector'),
            ('LOOKUP_INGESTION_MODES', 'API,Webhook,File', 'Dropdown values for ingestion mode selector'),
            ('SMTP_HOST / SMTP_PORT', '—', 'Email notification SMTP server config'),
            ('SMTP_USER / SMTP_PASSWORD', '—', 'SMTP credentials'),
            ('NOTIFICATION_EMAIL', '—', 'Target email address for alert notifications'),
            ('LANGFUSE_HOST / LANGFUSE_PUBLIC_KEY', '—', 'Optional Langfuse observability integration'),
        ],
        col_widths=[2.5, 1.3, 2.7]
    )


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def build_document():
    doc = Document()

    # Page margins
    for section in doc.sections:
        section.top_margin    = Cm(2.0)
        section.bottom_margin = Cm(2.0)
        section.left_margin   = Cm(2.5)
        section.right_margin  = Cm(2.5)

    # Default paragraph style
    style = doc.styles['Normal']
    style.font.name = 'Calibri'
    style.font.size = Pt(10)

    build_cover(doc)
    section_toc(doc)
    section_exec_summary(doc)
    section_business_context(doc)
    section_system_overview(doc)
    section_current_arch(doc)
    section_nfr(doc)
    section_gap_analysis(doc)
    section_maturity(doc)
    section_target_arch(doc)
    section_adrs(doc)
    section_risks(doc)
    section_roadmap(doc)
    section_appendix(doc)

    out_path = '/home/ampara/Documents/ai_governance/AI_Governance_ARB_Document.docx'
    doc.save(out_path)
    print(f'✅  ARB document saved → {out_path}')
    return out_path


if __name__ == '__main__':
    build_document()
