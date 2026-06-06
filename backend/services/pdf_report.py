"""Server-side PDF report generation for statistics."""
import io
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.lib.enums import TA_CENTER


# Dark theme colors
BG_DARK = colors.Color(9/255, 9/255, 11/255)       # #09090b
BG_CARD = colors.Color(24/255, 24/255, 27/255)      # #18181b
BORDER = colors.Color(39/255, 39/255, 42/255)        # #27272a
TEXT_WHITE = colors.Color(1, 1, 1)
TEXT_MUTED = colors.Color(113/255, 113/255, 122/255)  # #71717a
TEXT_LIGHT = colors.Color(212/255, 212/255, 216/255)   # #d4d4d8
GREEN = colors.Color(34/255, 197/255, 94/255)        # #22c55e
AMBER = colors.Color(245/255, 158/255, 11/255)       # #f59e0b
RED = colors.Color(239/255, 68/255, 68/255)          # #ef4444
BLUE = colors.Color(59/255, 130/255, 246/255)        # #3b82f6
PURPLE = colors.Color(139/255, 92/255, 246/255)      # #8b5cf6
ORANGE = colors.Color(249/255, 115/255, 22/255)      # #f97316
CYAN = colors.Color(6/255, 182/255, 212/255)         # #06b6d4
PINK = colors.Color(236/255, 72/255, 153/255)        # #ec4899

CHART_COLORS = [GREEN, AMBER, BLUE, PURPLE, ORANGE, CYAN, PINK, RED]


class DarkBackground:
    """Canvas callback to draw dark background on every page."""
    def __init__(self, page_size):
        self.width, self.height = page_size

    def __call__(self, canvas, doc):
        canvas.saveState()
        canvas.setFillColor(BG_DARK)
        canvas.rect(0, 0, self.width, self.height, fill=True, stroke=False)
        # Page number
        canvas.setFillColor(TEXT_MUTED)
        canvas.setFont('Helvetica', 8)
        canvas.drawRightString(self.width - 15*mm, 10*mm, f"Page {doc.page}")
        canvas.restoreState()


def build_styles():
    """Create paragraph styles for the dark theme."""
    styles = {}
    styles['title'] = ParagraphStyle(
        'Title', fontName='Helvetica-Bold', fontSize=22,
        textColor=TEXT_WHITE, spaceAfter=1*mm,
    )
    styles['subtitle'] = ParagraphStyle(
        'Subtitle', fontName='Helvetica', fontSize=10,
        textColor=TEXT_MUTED, spaceAfter=10*mm,
    )
    styles['h2'] = ParagraphStyle(
        'H2', fontName='Helvetica-Bold', fontSize=13,
        textColor=TEXT_WHITE, spaceBefore=6*mm, spaceAfter=4*mm,
    )
    styles['body'] = ParagraphStyle(
        'Body', fontName='Helvetica', fontSize=10,
        textColor=TEXT_LIGHT,
    )
    styles['small'] = ParagraphStyle(
        'Small', fontName='Helvetica', fontSize=8,
        textColor=TEXT_MUTED,
    )
    styles['kpi_value'] = ParagraphStyle(
        'KPIValue', fontName='Helvetica-Bold', fontSize=28,
        textColor=TEXT_WHITE, alignment=TA_CENTER,
    )
    styles['kpi_label'] = ParagraphStyle(
        'KPILabel', fontName='Helvetica', fontSize=9,
        textColor=TEXT_MUTED, alignment=TA_CENTER,
    )
    return styles


def make_kpi_table(overview, page_width):
    """Build the KPI cards row."""
    total = overview.get('total_content_items', 0)
    pub = overview.get('publishing', {})
    published = pub.get('published', 0)
    scheduled = pub.get('scheduled', 0)
    failed = pub.get('failed', 0)

    data = [
        ['Total Articles', 'Published', 'Scheduled', 'Failed'],
        [str(total), str(published), str(scheduled), str(failed)],
    ]

    col_w = (page_width - 12*mm) / 4
    t = Table(data, colWidths=[col_w]*4, rowHeights=[7*mm, 16*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BG_CARD),
        ('TEXTCOLOR', (0, 0), (-1, 0), TEXT_MUTED),
        ('TEXTCOLOR', (0, 1), (-1, 1), TEXT_WHITE),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTNAME', (0, 1), (-1, 1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 1), (-1, 1), 28),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, 0), 'BOTTOM'),
        ('VALIGN', (0, 1), (-1, 1), 'MIDDLE'),
        ('BOX', (0, 0), (0, -1), 0.5, BORDER),
        ('BOX', (1, 0), (1, -1), 0.5, BORDER),
        ('BOX', (2, 0), (2, -1), 0.5, BORDER),
        ('BOX', (3, 0), (3, -1), 0.5, BORDER),
        ('TOPPADDING', (0, 0), (-1, 0), 3*mm),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 4*mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 3*mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3*mm),
    ]))
    return t


def make_wp_sites_table(wp_sites, page_width):
    """Build the per-WP-site stats row."""
    if not wp_sites:
        return None
    
    header = ['WordPress Site', 'Published', 'Scheduled']
    rows = [header]
    for site in wp_sites:
        rows.append([site['site_name'], str(site['published']), str(site['scheduled'])])

    col_widths = [page_width * 0.5, page_width * 0.25, page_width * 0.25]
    t = Table(rows, colWidths=col_widths, rowHeights=[8*mm] + [7*mm]*len(wp_sites))
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BORDER),
        ('BACKGROUND', (0, 1), (-1, -1), BG_CARD),
        ('TEXTCOLOR', (0, 0), (-1, 0), TEXT_MUTED),
        ('TEXTCOLOR', (0, 1), (0, -1), TEXT_WHITE),
        ('TEXTCOLOR', (1, 1), (1, -1), GREEN),
        ('TEXTCOLOR', (2, 1), (2, -1), AMBER),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 11),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOX', (0, 0), (-1, -1), 0.5, BORDER),
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 2*mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2*mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 4*mm),
    ]))
    return t


def make_monthly_chart(monthly_data, page_width):
    """Build a bar chart for monthly content trends."""
    months = monthly_data.get('months', [])
    if not months:
        return None

    drawing = Drawing(page_width, 160)
    
    # Dark background for chart area
    drawing.add(Rect(0, 0, page_width, 160, fillColor=BG_CARD, strokeColor=BORDER, strokeWidth=0.5, rx=3, ry=3))

    chart = VerticalBarChart()
    chart.x = 50
    chart.y = 30
    chart.width = page_width - 80
    chart.height = 110

    created_data = [m.get('created', 0) for m in months]
    published_data = [m.get('published', 0) for m in months]
    chart.data = [created_data, published_data]
    chart.categoryAxis.categoryNames = [m.get('label', '') for m in months]

    chart.bars[0].fillColor = BLUE
    chart.bars[1].fillColor = GREEN
    chart.bars.strokeWidth = 0
    chart.barWidth = 3*mm
    chart.groupSpacing = 5*mm

    chart.categoryAxis.labels.fontName = 'Helvetica'
    chart.categoryAxis.labels.fontSize = 7
    chart.categoryAxis.labels.fillColor = TEXT_MUTED
    chart.categoryAxis.labels.angle = 30
    chart.categoryAxis.labels.dy = -5
    chart.categoryAxis.strokeColor = BORDER
    chart.categoryAxis.visibleTicks = False

    chart.valueAxis.labels.fontName = 'Helvetica'
    chart.valueAxis.labels.fontSize = 7
    chart.valueAxis.labels.fillColor = TEXT_MUTED
    chart.valueAxis.strokeColor = BORDER
    chart.valueAxis.visibleGrid = True
    chart.valueAxis.gridStrokeColor = BORDER
    chart.valueAxis.gridStrokeWidth = 0.3
    chart.valueAxis.valueMin = 0

    drawing.add(chart)

    # Legend
    lx = 60
    ly = 148
    drawing.add(Rect(lx, ly, 8, 8, fillColor=BLUE, strokeWidth=0))
    drawing.add(String(lx + 12, ly + 1, 'Created', fontName='Helvetica', fontSize=8, fillColor=TEXT_MUTED))
    drawing.add(Rect(lx + 60, ly, 8, 8, fillColor=GREEN, strokeWidth=0))
    drawing.add(String(lx + 72, ly + 1, 'Published', fontName='Helvetica', fontSize=8, fillColor=TEXT_MUTED))

    return drawing


def make_per_site_chart(per_site_data, page_width):
    """Build stacked bar chart for per-WP-site monthly publishing."""
    months = per_site_data.get('months', [])
    site_names = per_site_data.get('site_names', [])
    if not months or not site_names:
        return None

    drawing = Drawing(page_width, 160)
    drawing.add(Rect(0, 0, page_width, 160, fillColor=BG_CARD, strokeColor=BORDER, strokeWidth=0.5, rx=3, ry=3))

    chart = VerticalBarChart()
    chart.x = 50
    chart.y = 30
    chart.width = page_width - 80
    chart.height = 110

    chart_data = []
    for name in site_names:
        chart_data.append([m.get(name, 0) for m in months])
    chart.data = chart_data
    chart.categoryAxis.categoryNames = [m.get('label', '') for m in months]

    for i, name in enumerate(site_names):
        chart.bars[i].fillColor = CHART_COLORS[i % len(CHART_COLORS)]
    chart.bars.strokeWidth = 0
    chart.barWidth = 4*mm
    chart.groupSpacing = 4*mm

    chart.categoryAxis.labels.fontName = 'Helvetica'
    chart.categoryAxis.labels.fontSize = 7
    chart.categoryAxis.labels.fillColor = TEXT_MUTED
    chart.categoryAxis.labels.angle = 30
    chart.categoryAxis.labels.dy = -5
    chart.categoryAxis.strokeColor = BORDER
    chart.categoryAxis.visibleTicks = False

    chart.valueAxis.labels.fontName = 'Helvetica'
    chart.valueAxis.labels.fontSize = 7
    chart.valueAxis.labels.fillColor = TEXT_MUTED
    chart.valueAxis.strokeColor = BORDER
    chart.valueAxis.visibleGrid = True
    chart.valueAxis.gridStrokeColor = BORDER
    chart.valueAxis.gridStrokeWidth = 0.3
    chart.valueAxis.valueMin = 0

    drawing.add(chart)

    # Legend
    lx = 60
    ly = 148
    for i, name in enumerate(site_names):
        drawing.add(Rect(lx + i*80, ly, 8, 8, fillColor=CHART_COLORS[i % len(CHART_COLORS)], strokeWidth=0))
        drawing.add(String(lx + i*80 + 12, ly + 1, name, fontName='Helvetica', fontSize=8, fillColor=TEXT_MUTED))

    return drawing


def make_category_table(categories, page_width):
    """Build a horizontal bar chart for categories."""
    if not categories:
        return None

    max_count = categories[0]['count'] if categories else 1
    bar_max_width = page_width * 0.55

    rows = []
    for i, cat in enumerate(categories):
        pct = cat['count'] / max_count
        bar_width = max(4, pct * bar_max_width)
        color = CHART_COLORS[i % len(CHART_COLORS)]

        d = Drawing(bar_max_width, 12)
        d.add(Rect(0, 1, bar_width, 10, fillColor=color, strokeWidth=0, rx=2, ry=2))
        rows.append([cat['name'].title(), d, str(cat['count'])])

    col_widths = [page_width * 0.22, page_width * 0.60, page_width * 0.18]
    t = Table(rows, colWidths=col_widths, rowHeights=[8*mm]*len(rows))

    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, -1), BG_CARD),
        ('TEXTCOLOR', (0, 0), (0, -1), TEXT_WHITE),
        ('TEXTCOLOR', (2, 0), (2, -1), TEXT_LIGHT),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (0, -1), 10),
        ('FONTSIZE', (2, 0), (2, -1), 11),
        ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4*mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4*mm),
        ('BOX', (0, 0), (-1, -1), 0.5, BORDER),
    ]
    t.setStyle(TableStyle(style_cmds))
    return t


def make_authors_table(authors_data, page_width):
    """Build the top authors ranking table."""
    authors = authors_data.get('authors', [])
    if not authors:
        return None

    header = ['#', 'Author', 'Total', 'Approved', 'Published (WP)', 'Pending']
    rows = [header]
    for i, a in enumerate(authors):
        rows.append([
            str(i + 1),
            f"{a['name']}\n{a['email']}",
            str(a['total_items']),
            str(a['approved']),
            str(a['published_to_wp']),
            str(a['pending']),
        ])

    col_widths = [
        page_width * 0.06,
        page_width * 0.34,
        page_width * 0.12,
        page_width * 0.14,
        page_width * 0.20,
        page_width * 0.14,
    ]
    row_heights = [8*mm] + [10*mm] * len(authors)
    t = Table(rows, colWidths=col_widths, rowHeights=row_heights)

    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), BORDER),
        ('BACKGROUND', (0, 1), (-1, -1), BG_CARD),
        ('TEXTCOLOR', (0, 0), (-1, 0), TEXT_MUTED),
        ('TEXTCOLOR', (0, 1), (0, -1), AMBER),
        ('TEXTCOLOR', (1, 1), (1, -1), TEXT_WHITE),
        ('TEXTCOLOR', (2, 1), (2, -1), TEXT_WHITE),
        ('TEXTCOLOR', (3, 1), (3, -1), GREEN),
        ('TEXTCOLOR', (4, 1), (4, -1), BLUE),
        ('TEXTCOLOR', (5, 1), (5, -1), AMBER),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (0, -1), 12),
        ('FONTSIZE', (1, 1), (1, -1), 10),
        ('FONTSIZE', (2, 1), (-1, -1), 12),
        ('FONTNAME', (2, 1), (2, -1), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOX', (0, 0), (-1, -1), 0.5, BORDER),
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 2*mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2*mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 3*mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3*mm),
    ]

    # Highlight top 3
    for i in range(min(3, len(authors))):
        row = i + 1
        medal_colors = [AMBER, TEXT_LIGHT, ORANGE]
        style_cmds.append(('TEXTCOLOR', (0, row), (0, row), medal_colors[i]))
        style_cmds.append(('FONTNAME', (0, row), (0, row), 'Helvetica-Bold'))

    t.setStyle(TableStyle(style_cmds))
    return t


def make_approval_drawing(overview, page_width):
    """Build approval status summary."""
    approval = overview.get('approval', {})
    approved = approval.get('approved', 0)
    pending = approval.get('pending', 0)
    rejected = approval.get('rejected', 0)
    total = approved + pending + rejected
    if total == 0:
        return None

    drawing = Drawing(page_width, 50)
    drawing.add(Rect(0, 0, page_width, 50, fillColor=BG_CARD, strokeColor=BORDER, strokeWidth=0.5, rx=3, ry=3))

    items = [
        (f"Approved: {approved}", GREEN),
        (f"Pending: {pending}", AMBER),
        (f"Rejected: {rejected}", RED),
    ]
    x = 20
    for label, color in items:
        drawing.add(Rect(x, 20, 10, 10, fillColor=color, strokeWidth=0))
        drawing.add(String(x + 16, 22, label, fontName='Helvetica-Bold', fontSize=11, fillColor=TEXT_WHITE))
        x += 140

    return drawing


def generate_statistics_pdf(overview, monthly, authors_data, per_site, weekly_activity):
    """Generate the complete statistics PDF report."""
    buffer = io.BytesIO()
    page_size = landscape(A4)
    page_w, page_h = page_size
    margin = 15*mm

    doc = SimpleDocTemplate(
        buffer, pagesize=page_size,
        leftMargin=margin, rightMargin=margin,
        topMargin=margin, bottomMargin=margin,
    )

    bg_callback = DarkBackground(page_size)
    styles = build_styles()
    content_width = page_w - 2*margin
    elements = []

    # Title
    site_name = overview.get('main_site_name', 'Statistics')
    date_str = datetime.now().strftime('%d %B %Y')
    elements.append(Paragraph(f"{site_name} — Content Report", styles['title']))
    elements.append(Paragraph(f"Generated {date_str}", styles['subtitle']))

    # KPI Cards
    elements.append(make_kpi_table(overview, content_width))
    elements.append(Spacer(1, 6*mm))

    # WordPress Sites
    wp_table = make_wp_sites_table(overview.get('wordpress_sites', []), content_width)
    if wp_table:
        elements.append(Paragraph("Publishing per WordPress Site", styles['h2']))
        elements.append(wp_table)
        elements.append(Spacer(1, 4*mm))

    # Approval Status
    approval_drawing = make_approval_drawing(overview, content_width)
    if approval_drawing:
        elements.append(Paragraph("Approval Status", styles['h2']))
        elements.append(approval_drawing)
        elements.append(Spacer(1, 4*mm))

    # Monthly Trend Chart
    if monthly:
        elements.append(Paragraph("Monthly Content Trend (12 months)", styles['h2']))
        chart = make_monthly_chart(monthly, content_width)
        if chart:
            elements.append(chart)
        elements.append(Spacer(1, 4*mm))

    # Per-Site Monthly Chart
    if per_site:
        elements.append(Paragraph("Publishing per Site (Monthly)", styles['h2']))
        chart = make_per_site_chart(per_site, content_width)
        if chart:
            elements.append(chart)
        elements.append(Spacer(1, 4*mm))

    # Categories
    categories = overview.get('categories', [])
    if categories:
        elements.append(Paragraph("Content per Category", styles['h2']))
        cat_table = make_category_table(categories, content_width)
        if cat_table:
            elements.append(cat_table)
        elements.append(Spacer(1, 4*mm))

    # Top Authors
    if authors_data and authors_data.get('authors'):
        elements.append(Paragraph("Top Content Creators", styles['h2']))
        authors_table = make_authors_table(authors_data, content_width)
        if authors_table:
            elements.append(authors_table)

    doc.build(elements, onFirstPage=bg_callback, onLaterPages=bg_callback)
    buffer.seek(0)
    return buffer
