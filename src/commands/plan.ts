import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import PDFDocument from 'pdfkit';

interface PlanOptions {
  pdf?: boolean;
  output?: string;
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

function generatePdf(markdown: string, outputPath: string): void {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  const lines = markdown.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      doc.moveDown(0.3);
      continue;
    }

    // Title: # heading
    if (/^# [^#]/.test(trimmed)) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#1a1a2e')
        .text(trimmed.replace(/^# /, ''));
      doc.moveDown(0.3);
      // Underline
      const y = doc.y;
      doc.moveTo(50, y).lineTo(545, y).strokeColor('#cccccc').stroke();
      doc.moveDown(0.5);
      continue;
    }

    // Day headers: ## Day N
    if (/^## Day\s+\d+/i.test(trimmed)) {
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#2d3436')
        .text(trimmed.replace(/^## /, ''));
      const y = doc.y;
      doc.moveTo(50, y).lineTo(545, y).strokeColor('#0984e3').lineWidth(1).stroke();
      doc.lineWidth(1);
      doc.moveDown(0.4);
      continue;
    }

    // Sub-headers: ## or ###
    if (/^#{2,3}\s+/.test(trimmed)) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#2d3436')
        .text(trimmed.replace(/^#{2,3}\s+/, ''));
      doc.moveDown(0.2);
      continue;
    }

    // Bullet points
    if (/^[-*]\s+/.test(trimmed)) {
      const text = trimmed.replace(/^[-*]\s+/, '');
      renderStyledLine(doc, text, { indent: 15, bullet: true });
      continue;
    }

    // Regular text
    renderStyledLine(doc, trimmed, {});
  }

  doc.end();
}

function renderStyledLine(
  doc: PDFKit.PDFDocument,
  text: string,
  opts: { indent?: number; bullet?: boolean },
): void {
  const indent = opts.indent || 0;
  const x = 50 + indent;

  // Check for page overflow
  if (doc.y > 750) {
    doc.addPage();
  }

  if (opts.bullet) {
    doc.font('Helvetica').fontSize(10).fillColor('#333333')
      .text('•', x - 10, doc.y, { continued: true, width: 10 });
  }

  // Parse bold markers **text** and render with font switching
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  const y = doc.y;
  let first = true;

  for (const part of parts) {
    if (/^\*\*(.+)\*\*$/.test(part)) {
      const boldText = part.replace(/\*\*/g, '');
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#2d3436')
        .text(boldText, first ? x : undefined, first ? y : undefined, { continued: true });
    } else if (part) {
      // Color times
      let colored = part;
      const hasTime = /\d{1,2}:\d{2}/.test(part);
      const fillColor = hasTime ? '#0984e3' : '#333333';
      doc.font('Helvetica').fontSize(10).fillColor(fillColor)
        .text(colored, first ? x : undefined, first ? y : undefined, { continued: true });
    }
    if (first && part) first = false;
  }

  // End the line
  doc.text('', { continued: false });
}

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
