import { describe, it, expect } from 'vitest';
import { buildRubricText, buildDimensionPrompt, buildCriticPrompt, buildHolisticPrompt, buildComparativePrompt } from '../../src/scoring/prompts.js';
import type { Dimension, Rubrics, ActivitiesDB } from '../../src/data/schemas.js';

const sampleDim: Dimension = {
  weight: 0.25,
  sub_dimensions: {
    authenticity: {
      description: 'Are activities local-oriented vs tourist-oriented?',
      anchors: { 60: 'Tourist traps dominate', 80: 'Mostly local', 90: 'Every activity feels local' },
    },
    uniqueness: {
      description: 'Can only do this HERE experiences',
      anchors: { 60: 'Generic activities', 90: 'Unique to this place' },
    },
  },
};

describe('buildRubricText', () => {
  it('formats sub-dimensions with sorted anchors', () => {
    const text = buildRubricText(sampleDim);
    expect(text).toContain('### authenticity');
    expect(text).toContain('### uniqueness');
    expect(text).toContain('60:');
    expect(text).toContain('90:');
  });

  it('includes descriptions', () => {
    const text = buildRubricText(sampleDim);
    expect(text).toContain('Are activities local-oriented');
  });
});

describe('buildDimensionPrompt', () => {
  it('includes dimension name, plan, and rubric', () => {
    const prompt = buildDimensionPrompt('experience_quality', sampleDim, 'Day 1: Tokyo arrival');
    expect(prompt).toContain('experience_quality');
    expect(prompt).toContain('Day 1: Tokyo arrival');
    expect(prompt).toContain('authenticity');
    expect(prompt).toContain('uniqueness');
  });

  it('requests JSON with sub-dimension keys', () => {
    const prompt = buildDimensionPrompt('experience_quality', sampleDim, 'plan');
    expect(prompt).toContain('"authenticity"');
    expect(prompt).toContain('"uniqueness"');
    expect(prompt).toContain('"score"');
  });
});

describe('buildCriticPrompt', () => {
  it('includes penalty rules and plan', () => {
    const rubrics: Rubrics = {
      dimensions: {},
      adversarial_penalties: {
        logistics: [{ rule: 'No transit times', penalty: -3 }],
        max_penalty_per_dimension: -20,
      } as any,
    };
    const prompt = buildCriticPrompt('Day 1: stuff', {} as ActivitiesDB, rubrics);
    expect(prompt).toContain('No transit times');
    expect(prompt).toContain('Day 1: stuff');
    expect(prompt).toContain('LOGISTICS');
  });
});

describe('buildHolisticPrompt', () => {
  it('includes all dimension scores', () => {
    const scores = {
      food: { score: 85, weight: 0.2, sub_dimensions: { taste: { score: 85 } } },
      logistics: { score: 70, weight: 0.3, sub_dimensions: { routing: { score: 70 } } },
    };
    const prompt = buildHolisticPrompt(scores);
    expect(prompt).toContain('food: 85.0');
    expect(prompt).toContain('logistics: 70.0');
  });
});

describe('buildComparativePrompt', () => {
  it('includes both plans and mutation', () => {
    const rubrics: Rubrics = {
      dimensions: {
        food: { weight: 0.2, sub_dimensions: { taste: { description: 'test', anchors: {} } } },
      },
      adversarial_penalties: {},
    };
    const prompt = buildComparativePrompt('old plan', 'new plan', 'SWAP Day 3 restaurant', rubrics);
    expect(prompt).toContain('old plan');
    expect(prompt).toContain('new plan');
    expect(prompt).toContain('SWAP Day 3 restaurant');
    expect(prompt).toContain('food.taste');
  });
});
