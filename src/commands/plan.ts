import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import PDFDocument from 'pdfkit';
import yaml from 'js-yaml';

interface PlanOptions {
  pdf?: boolean;
  output?: string;
}

interface Frontmatter {
  trip_name?: string;
  total_days?: number;
  start_date?: string;
  end_date?: string;
  total_budget?: number;
  currency?: string;
  travelers?: number;
  origin?: string;
  loyalty_program?: string;
}

export function planCommand(options: PlanOptions = {}): void {
  const cwd = process.cwd();
  const planPath = path.join(cwd, 'plan.md');

  if (!fs.existsSync(planPath)) {
    console.log(chalk.red('\n  No plan.md found in current directory.\n'));
    process.exit(1);
  }

  const content = fs.readFileSync(planPath, 'utf-8');

  if (options.pdf) {
    const outputPath = options.output || path.join(cwd, 'plan.pdf');
    generatePdf(content, outputPath);
    console.log(chalk.green(`\n  PDF saved to ${outputPath}\n`));
    return;
  }

  // Terminal pretty-print
  const lines = content.split('\n');
  console.log();
  for (const line of lines) {
    console.log(formatLine(line));
  }
  console.log();
}

// --- PDF Generation ---

const MARGIN = 54; // 0.75 inches
const PAGE_W = 612; // Letter width
const PAGE_H = 792; // Letter height
const CONTENT_W = PAGE_W - MARGIN * 2; // usable width
const PAGE_BOTTOM = PAGE_H - MARGIN - 20; // leave room at bottom

function parseFrontmatter(markdown: string): { frontmatter: Frontmatter; body: string } {
  if (markdown.startsWith('---')) {
    const end = markdown.indexOf('---', 3);
    if (end !== -1) {
      const fmText = markdown.slice(3, end).trim();
      const fm = yaml.load(fmText) as Frontmatter;
      return { frontmatter: fm, body: markdown.slice(end + 3).trimStart() };
    }
  }
  return { frontmatter: {}, body: markdown };
}

function stripEmoji(text: string): string {
  // Remove emoji but keep common symbols; replace → with --
  return text
    .replace(/[\u{1F600}-\u{1F9FF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{FE00}-\u{FE0F}\u{1FA00}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '')
    .replace(/\u2192/g, ' -- ')  // → to --
    .replace(/[\u25C6\u2764\u2B50\u2728\u26A0\u2705\u274C\u{1F3D4}]/gu, '') // misc symbols
    .trim();
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > PAGE_BOTTOM) {
    doc.addPage();
  }
}

function generatePdf(markdown: string, outputPath: string): void {
  const { frontmatter, body } = parseFrontmatter(markdown);

  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  // --- Cover Page ---
  renderCoverPage(doc, frontmatter);

  // --- Body ---
  const lines = body.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      doc.moveDown(0.25);
      i++;
      continue;
    }

    // Horizontal rule — just spacing
    if (/^---+$/.test(trimmed)) {
      doc.moveDown(0.3);
      i++;
      continue;
    }

    // Day header (# Day N or ## Day N) — new page
    if (/^#{1,2}\s+Day\s+\d+/i.test(trimmed)) {
      doc.addPage();
      const headerText = stripEmoji(trimmed.replace(/^#{1,2}\s+/, ''));
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#1a1a2e')
        .text(headerText, MARGIN, MARGIN, { width: CONTENT_W });
      // Blue underline
      const y = doc.y + 2;
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y)
        .strokeColor('#0984e3').lineWidth(1.5).stroke();
      doc.lineWidth(1);
      doc.moveDown(0.4);
      i++;
      // Check for theme line (next line starting with *)
      if (i < lines.length && /^\s*\*[^*]+\*\s*$/.test(lines[i].trim())) {
        const theme = lines[i].trim().replace(/^\*|\*$/g, '');
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#636e72')
          .text(theme, MARGIN, undefined, { width: CONTENT_W });
        doc.moveDown(0.5);
        i++;
      }
      continue;
    }

    // Top-level title: # Title (not Day)
    if (/^# [^#]/.test(trimmed)) {
      ensureSpace(doc, 40);
      doc.moveDown(0.5);
      const title = stripEmoji(trimmed.replace(/^# /, ''));
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a1a2e')
        .text(title, MARGIN, undefined, { width: CONTENT_W });
      const y = doc.y + 1;
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y)
        .strokeColor('#cccccc').lineWidth(0.5).stroke();
      doc.lineWidth(1);
      doc.moveDown(0.4);
      i++;
      continue;
    }

    // Section headers: ## Morning, ## Lunch, etc.
    if (/^#{2,3}\s+/.test(trimmed)) {
      ensureSpace(doc, 30);
      doc.moveDown(0.4);
      const heading = stripEmoji(trimmed.replace(/^#{2,3}\s+/, ''));
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#2d3436')
        .text(heading, MARGIN, undefined, { width: CONTENT_W });
      doc.moveDown(0.2);
      i++;
      continue;
    }

    // Table
    if (trimmed.startsWith('|')) {
      i = renderTable(doc, lines, i);
      continue;
    }

    // Italic standalone line
    if (/^\*[^*]+\*$/.test(trimmed)) {
      ensureSpace(doc, 16);
      const text = stripEmoji(trimmed.replace(/^\*|\*$/g, ''));
      doc.font('Helvetica-Oblique').fontSize(10).fillColor('#636e72')
        .text(text, MARGIN, undefined, { width: CONTENT_W });
      doc.moveDown(0.2);
      i++;
      continue;
    }

    // Hotel/Transit footer lines
    if (/^\*\*(?:Hotel|Transit|Reality check)[:.]/.test(trimmed)) {
      ensureSpace(doc, 20);
      doc.moveDown(0.15);
      renderRichText(doc, stripEmoji(trimmed), MARGIN, CONTENT_W, 9.5, '#555555');
      doc.moveDown(0.15);
      i++;
      continue;
    }

    // Sub-bullet (indented)
    if (/^\s{2,}[-*]\s+/.test(line)) {
      ensureSpace(doc, 16);
      const text = stripEmoji(trimmed.replace(/^[-*]\s+/, ''));
      renderBullet(doc, text, 80, CONTENT_W - 26, '-');
      i++;
      continue;
    }

    // Bullet point
    if (/^[-*]\s+/.test(trimmed)) {
      ensureSpace(doc, 16);
      const text = stripEmoji(trimmed.replace(/^[-*]\s+/, ''));
      renderBullet(doc, text, MARGIN + 8, CONTENT_W - 8, '\u2022'); // •
      i++;
      continue;
    }

    // Regular text
    ensureSpace(doc, 16);
    renderRichText(doc, stripEmoji(trimmed), MARGIN, CONTENT_W, 10, '#333333');
    doc.moveDown(0.15);
    i++;
  }

  doc.end();
}

function renderCoverPage(doc: PDFKit.PDFDocument, fm: Frontmatter): void {
  const centerX = PAGE_W / 2;

  // Trip name — large centered
  const name = (fm.trip_name || 'Travel Plan').toUpperCase();
  doc.font('Helvetica-Bold').fontSize(32).fillColor('#1a1a2e');
  doc.text(name, MARGIN, 220, { width: CONTENT_W, align: 'center' });

  // Decorative line
  doc.moveDown(0.5);
  const lineY = doc.y;
  const lineW = 200;
  doc.moveTo(centerX - lineW / 2, lineY).lineTo(centerX + lineW / 2, lineY)
    .strokeColor('#0984e3').lineWidth(2).stroke();
  doc.lineWidth(1);
  doc.moveDown(1);

  // Details
  doc.font('Helvetica').fontSize(13).fillColor('#555555');
  const details: string[] = [];
  if (fm.start_date && fm.end_date) {
    const fmtDate = (d: string | Date) => {
      const date = d instanceof Date ? d : new Date(d);
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    };
    details.push(`${fmtDate(fm.start_date)} to ${fmtDate(fm.end_date)}`);
  }
  if (fm.total_days) {
    details.push(`${fm.total_days} days`);
  }
  if (fm.origin) {
    details.push(`From ${fm.origin}`);
  }
  if (fm.total_budget && fm.currency) {
    details.push(`Budget: ${fm.currency} ${fm.total_budget.toLocaleString()}`);
  } else if (fm.total_budget) {
    details.push(`Budget: $${fm.total_budget.toLocaleString()}`);
  }
  if (fm.travelers) {
    details.push(`${fm.travelers} traveler${fm.travelers > 1 ? 's' : ''}`);
  }

  for (const detail of details) {
    doc.text(detail, MARGIN, undefined, { width: CONTENT_W, align: 'center' });
    doc.moveDown(0.3);
  }

  // Footer
  doc.font('Helvetica-Oblique').fontSize(9).fillColor('#999999');
  doc.text('Generated by trip-optimizer', MARGIN, PAGE_H - MARGIN - 30, {
    width: CONTENT_W,
    align: 'center',
  });

  doc.addPage();
}

function renderTable(doc: PDFKit.PDFDocument, lines: string[], startIdx: number): number {
  const rows: string[][] = [];
  let i = startIdx;
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    const row = lines[i].trim();
    // Skip separator rows
    if (/^\|[\s-:|]+\|$/.test(row)) {
      i++;
      continue;
    }
    const cells = row.split('|')
      .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
      .map(c => stripEmoji(c.trim().replace(/\*\*/g, '')));
    rows.push(cells);
    i++;
  }

  if (rows.length === 0) return i;

  const colCount = rows[0].length;
  let colWidths: number[];
  if (colCount === 2) {
    colWidths = [CONTENT_W * 0.62, CONTENT_W * 0.38];
  } else if (colCount === 7) {
    // Summary table: Day, Date, DoW, Location, Hotel, Flight/Train, Notes
    colWidths = [0.05, 0.08, 0.05, 0.20, 0.18, 0.16, 0.28].map(w => CONTENT_W * w);
  } else {
    colWidths = Array(colCount).fill(CONTENT_W / colCount);
  }
  const rowHeight = 20;

  ensureSpace(doc, Math.min(rows.length + 1, 6) * rowHeight);

  const startX = MARGIN;
  let y = doc.y;

  // Header row
  if (rows.length > 0) {
    doc.rect(startX, y, CONTENT_W, rowHeight).fill('#e8e8e8');
    const fontSize = colCount >= 6 ? 7.5 : 9;
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#2d3436');
    let x = startX;
    for (let c = 0; c < rows[0].length && c < colWidths.length; c++) {
      doc.text(rows[0][c], x + 3, y + 5, { width: colWidths[c] - 6, lineBreak: false });
      x += colWidths[c];
    }
    y += rowHeight;
    doc.moveTo(startX, y).lineTo(startX + CONTENT_W, y)
      .strokeColor('#0984e3').lineWidth(1).stroke();
  }

  // Data rows
  for (let r = 1; r < rows.length; r++) {
    if (y + rowHeight > PAGE_BOTTOM) {
      doc.addPage();
      y = MARGIN;
    }
    // Alternate row shading
    if (r % 2 === 0) {
      doc.rect(startX, y, CONTENT_W, rowHeight).fill('#f5f5f5');
    }
    const isTotalRow = rows[r][0]?.toLowerCase().includes('total');
    const dataFontSize = colCount >= 6 ? 7.5 : 9;
    doc.font(isTotalRow ? 'Helvetica-Bold' : 'Helvetica').fontSize(dataFontSize).fillColor('#333333');
    let x = startX;
    for (let c = 0; c < rows[r].length && c < colWidths.length; c++) {
      doc.text(rows[r][c], x + 3, y + 5, { width: colWidths[c] - 6, lineBreak: false });
      x += colWidths[c];
    }
    y += rowHeight;
  }

  // Bottom border
  doc.moveTo(startX, y).lineTo(startX + CONTENT_W, y)
    .strokeColor('#cccccc').lineWidth(0.5).stroke();
  doc.lineWidth(1);
  doc.y = y + 8;

  return i;
}

function renderBullet(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  width: number,
  bulletChar: string,
): void {
  const bulletX = x - 10;
  const y = doc.y;
  doc.font('Helvetica').fontSize(10).fillColor('#333333')
    .text(bulletChar, bulletX, y, { width: 10, continued: false });
  doc.y = y; // reset y to same line
  renderRichText(doc, text, x, width, 10, '#333333');
  doc.moveDown(0.1);
}

function renderRichText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  width: number,
  fontSize: number,
  defaultColor: string,
): void {
  // Parse bold and italic segments
  const segments: Array<{ text: string; bold: boolean; italic: boolean }> = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false, italic: false });
    }
    const m = match[0];
    if (m.startsWith('**')) {
      segments.push({ text: m.slice(2, -2), bold: true, italic: false });
    } else {
      segments.push({ text: m.slice(1, -1), bold: false, italic: true });
    }
    lastIndex = match.index + m.length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false, italic: false });
  }

  if (segments.length === 0) return;

  // Single plain segment — simple render
  if (segments.length === 1 && !segments[0].bold && !segments[0].italic) {
    doc.font('Helvetica').fontSize(fontSize).fillColor(defaultColor)
      .text(segments[0].text, x, doc.y, { width, lineBreak: true });
    return;
  }

  // Mixed formatting — use continued
  const startY = doc.y;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;

    if (seg.bold) {
      doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#2d3436');
    } else if (seg.italic) {
      doc.font('Helvetica-Oblique').fontSize(fontSize).fillColor('#636e72');
    } else {
      doc.font('Helvetica').fontSize(fontSize).fillColor(defaultColor);
    }

    if (i === 0) {
      doc.text(seg.text, x, startY, { width, continued: !isLast });
    } else {
      doc.text(seg.text, { continued: !isLast });
    }
  }
}

// --- Terminal Pretty-Print ---

function formatLine(line: string): string {
  // Day headers
  if (/^#{1,3}\s+Day\s+\d+/i.test(line)) {
    return chalk.bold.magenta(line);
  }

  // Top-level headers
  if (/^#{1,2}\s+/.test(line)) {
    return chalk.bold.cyan(line);
  }

  // Sub-headers
  if (/^#{3,}\s+/.test(line)) {
    return chalk.bold(line);
  }

  // Format times
  let formatted = line.replace(
    /\b(\d{1,2}:\d{2}(\s*[AaPp][Mm])?)\b/g,
    (match) => chalk.bold(match)
  );

  // Highlight restaurant/food keywords
  formatted = formatted.replace(
    /(?:restaurant|cafe|bakery|noodle|dumpling|hotpot|teahouse|bistro|eatery|diner|food stall|street food)/gi,
    (match) => chalk.yellow(match)
  );

  // Highlight meal names
  formatted = formatted.replace(
    /(?:Lunch|Dinner|Breakfast|Brunch|Snack):\s*(.+?)(?:\s*[-\u2013\u2014(]|$)/gi,
    (match, name) => match.replace(name, chalk.yellow(name))
  );

  // Bold markdown items
  formatted = formatted.replace(
    /\*\*([^*]+)\*\*/g,
    (_match, name) => chalk.cyan.bold(name)
  );

  // Hotel mentions
  formatted = formatted.replace(
    /(?:hotel|hostel|guesthouse|airbnb|accommodation|check[- ]?in|check[- ]?out|Le\s+M[eé]ridien|Sheraton|Courtyard|Marriott)/gi,
    (match) => chalk.blue(match)
  );

  // Costs
  formatted = formatted.replace(
    /[¥$€£]\s?\d[\d,.]*/g,
    (match) => chalk.green(match)
  );

  return formatted;
}
