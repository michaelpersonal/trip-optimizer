import { describe, it, expect } from 'vitest';
import { renderPlanMarkdown } from '../../src/data/plan-renderer.js';
import type { Plan } from '../../src/data/plan-schema.js';

const samplePlan: Plan = {
  version_id: 'v_001',
  parent_version_id: null,
  created_at: '2026-05-28T10:00:00Z',
  created_by: 'agent',
  score: { composite: 82, components: {} },
  days: [
    {
      day_index: 1,
      date: '2026-05-28',
      city: 'Shanghai',
      hotel: 'Le Meridien',
      transit: { mode: 'flight', detail: 'NH919 14:00' },
      segments: [
        {
          id: 'seg_001',
          type: 'activity',
          period: 'morning',
          title: 'The Bund Walk',
          details: 'Walk along the waterfront promenade with views of Pudong skyline',
          location: 'The Bund, Huangpu District',
          start_time: '09:00',
          end_time: '10:30',
          tags: ['sightseeing', 'walking'],
        },
        {
          id: 'seg_002',
          type: 'meal',
          period: 'lunch',
          title: 'Nanxiang Steamed Buns',
          details: 'Famous xiaolongbao at the original Nanxiang location',
          location: 'Yu Garden, Old City',
          start_time: '12:00',
          end_time: '13:00',
          tags: ['food', 'local'],
        },
        {
          id: 'seg_003',
          type: 'activity',
          period: 'afternoon',
          title: 'Yu Garden',
          details: 'Classical Chinese garden with pavilions and ponds',
          location: 'Old City',
          start_time: '14:00',
          end_time: '16:00',
          tags: ['culture'],
        },
      ],
      notes: 'Arrive early to beat the crowds at The Bund',
    },
    {
      day_index: 2,
      date: '2026-05-29',
      city: 'Shanghai',
      hotel: 'Le Meridien',
      transit: null,
      segments: [
        {
          id: 'seg_004',
          type: 'activity',
          period: 'morning',
          title: 'French Concession Walk',
          details: 'Stroll through tree-lined streets with art deco architecture',
          location: 'Former French Concession',
          start_time: '09:30',
          end_time: '11:30',
          tags: ['walking', 'architecture'],
        },
        {
          id: 'seg_005',
          type: 'meal',
          period: 'dinner',
          title: 'Lost Heaven',
          details: 'Yunnan cuisine in a beautiful heritage building',
          location: 'Gaoyou Road',
          start_time: '18:30',
          end_time: '20:00',
          tags: ['food', 'upscale'],
        },
      ],
      notes: '',
    },
  ],
};

describe('renderPlanMarkdown', () => {
  const md = renderPlanMarkdown(samplePlan, 'Shanghai Adventure', 2, '2026-05-28', '2026-05-29');

  it('includes YAML frontmatter with trip_name and total_days', () => {
    expect(md).toContain('---');
    expect(md).toContain('trip_name: Shanghai Adventure');
    expect(md).toContain('total_days: 2');
    expect(md).toContain('start_date: "2026-05-28"');
    expect(md).toContain('end_date: "2026-05-29"');
  });

  it('includes schedule overview table with | Day | header and data rows', () => {
    expect(md).toContain('| Day | Date | DoW | Location | Hotel | Flight/Train | Notes |');
    expect(md).toMatch(/\|\s*1\s*\|/);
    expect(md).toMatch(/\|\s*2\s*\|/);
  });

  it('includes # Day 1: Shanghai headers', () => {
    expect(md).toContain('# Day 1: Shanghai');
    expect(md).toContain('# Day 2: Shanghai');
  });

  it('includes ## Morning and ## Lunch sections with segment titles', () => {
    expect(md).toContain('## Morning');
    expect(md).toContain('## Lunch');
    expect(md).toContain('**The Bund Walk**');
    expect(md).toContain('**Nanxiang Steamed Buns**');
  });

  it('includes segment time ranges and details', () => {
    expect(md).toContain('(09:00\u201310:30)');
    expect(md).toContain('Walk along the waterfront promenade');
    expect(md).toContain('*The Bund, Huangpu District*');
  });

  it('includes **Hotel:** lines', () => {
    expect(md).toContain('**Hotel:** Le Meridien');
  });

  it('includes **Transit:** lines', () => {
    expect(md).toContain('**Transit:** flight \u2014 NH919 14:00');
  });

  it('includes day notes in italics when present', () => {
    expect(md).toContain('*Arrive early to beat the crowds at The Bund*');
  });

  it('omits notes line when notes are empty', () => {
    // Day 2 has empty notes; the output for Day 2 should not contain an italic notes line
    const day2Section = md.split('# Day 2: Shanghai')[1];
    // Should not have an italic line that is just empty
    expect(day2Section).not.toMatch(/^\*\s*\*$/m);
  });

  it('only renders period sections that have segments', () => {
    // Day 2 has morning and dinner only — no lunch, afternoon, or evening
    const day2Section = md.split('# Day 2: Shanghai')[1];
    expect(day2Section).toContain('## Morning');
    expect(day2Section).toContain('## Dinner');
    expect(day2Section).not.toContain('## Lunch');
    expect(day2Section).not.toContain('## Afternoon');
    expect(day2Section).not.toContain('## Evening');
  });

  it('does not include Transit line when transit is null', () => {
    const day2Section = md.split('# Day 2: Shanghai')[1];
    expect(day2Section).not.toContain('**Transit:**');
  });

  it('formats dates correctly in the overview table', () => {
    expect(md).toContain('May 28');
    expect(md).toContain('May 29');
  });

  it('includes correct day of week abbreviations', () => {
    // 2026-05-28 is a Thursday, 2026-05-29 is a Friday
    expect(md).toContain('Thu');
    expect(md).toContain('Fri');
  });
});
