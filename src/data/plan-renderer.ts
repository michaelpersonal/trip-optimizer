// Deterministic Plan JSON → Markdown renderer.
// Produces output matching the plan.md format consumed by the PDF pipeline,
// terminal pretty-printer, and `plan --pdf` command.

import type { Plan, Day, Segment, Period } from './plan-schema.js';
import { PERIODS } from './plan-schema.js';

// ── Helpers ───────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Returns 3-letter day name (Sun, Mon, …) from a YYYY-MM-DD string. */
export function getDayOfWeek(dateStr: string): string {
  // Parse as UTC to avoid timezone shifts
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return DAY_NAMES[date.getUTCDay()];
}

/** Returns "May 28" style from a YYYY-MM-DD string. */
export function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Capitalise first letter of a period name for section headers. */
function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Period ordering matches the PERIODS constant. */
const PERIOD_ORDER: Period[] = [...PERIODS];

// ── Main renderer ─────────────────────────────────────────────────────

export function renderPlanMarkdown(
  plan: Plan,
  tripName: string,
  totalDays: number,
  startDate: string,
  endDate: string,
): string {
  const lines: string[] = [];

  // ── YAML frontmatter ──
  lines.push('---');
  lines.push(`trip_name: ${tripName}`);
  lines.push(`total_days: ${totalDays}`);
  lines.push(`start_date: "${startDate}"`);
  lines.push(`end_date: "${endDate}"`);
  lines.push('---');
  lines.push('');

  // ── Schedule overview table ──
  lines.push('| Day | Date | DoW | Location | Hotel | Flight/Train | Notes |');
  lines.push('|-----|------|-----|----------|-------|--------------|-------|');

  for (const day of plan.days) {
    const dow = getDayOfWeek(day.date);
    const fmtd = formatDate(day.date);
    const hotel = day.hotel ?? '';
    const transit = day.transit ? `${day.transit.mode} — ${day.transit.detail}` : '';
    const notes = day.notes || '';
    lines.push(`| ${day.day_index} | ${fmtd} | ${dow} | ${day.city} | ${hotel} | ${transit} | ${notes} |`);
  }

  lines.push('');

  // ── Day sections ──
  for (const day of plan.days) {
    lines.push(`# Day ${day.day_index}: ${day.city}`);
    lines.push('');

    // Group segments by period
    const byPeriod = new Map<Period, Segment[]>();
    for (const seg of day.segments) {
      const list = byPeriod.get(seg.period) ?? [];
      list.push(seg);
      byPeriod.set(seg.period, list);
    }

    // Render periods in canonical order
    for (const period of PERIOD_ORDER) {
      const segs = byPeriod.get(period);
      if (!segs || segs.length === 0) continue;

      lines.push(`## ${capitalise(period)}`);
      lines.push('');

      for (const seg of segs) {
        lines.push(`**${seg.title}** (${seg.start_time}\u2013${seg.end_time})`);
        lines.push(seg.details);
        lines.push(`*${seg.location}*`);
        lines.push('');
      }
    }

    // Footer: Hotel
    if (day.hotel) {
      lines.push(`**Hotel:** ${day.hotel}`);
    }

    // Footer: Transit
    if (day.transit) {
      lines.push(`**Transit:** ${day.transit.mode} \u2014 ${day.transit.detail}`);
    }

    // Day notes
    if (day.notes) {
      lines.push('');
      lines.push(`*${day.notes}*`);
    }

    lines.push('');
  }

  return lines.join('\n');
}
