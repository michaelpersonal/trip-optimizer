import yaml from 'js-yaml';
import type { TripConstraints } from '../data/schemas.js';

export interface InitAnswers {
  name: string;
  start_date: string;
  end_date: string;
  travelers: number;
  origin: string;
  cities: Array<{ name: string; key: string }>;
  budget_total: number;
  budget_currency: string;
  vibes: string[];
  anti_patterns: string[];
  dietary: string[];
  loyalty_program: string;
}

export function generateConstraints(answers: InitAnswers): string {
  const startDate = new Date(answers.start_date);
  const endDate = new Date(answers.end_date);
  const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysPerCity = Math.max(1, Math.floor(totalDays / answers.cities.length));

  const constraints: TripConstraints = {
    trip: {
      name: answers.name,
      start_date: answers.start_date,
      end_date: answers.end_date,
      total_days: totalDays,
      travelers: answers.travelers,
      origin: answers.origin,
    },
    cities: answers.cities.map(c => ({
      name: c.name,
      key: c.key,
      min_days: 1,
      max_days: Math.min(daysPerCity + 2, totalDays),
    })),
    hard_requirements: ['City ordering cannot change'],
    preferences: {
      priority_order: answers.vibes,
      anti_patterns: answers.anti_patterns.length > 0 ? answers.anti_patterns : ['tourist traps', 'long queues'],
      pro_patterns: [
        'back-alley local spots',
        'neighborhood wandering with no fixed destination',
        'things you can only do in this specific place',
        'seasonal specialties',
      ],
    },
    dietary: answers.dietary,
    loyalty_program: answers.loyalty_program,
    budget: {
      total: answers.budget_total,
      currency: answers.budget_currency,
    },
  };

  return yaml.dump(constraints, { lineWidth: 120, noRefs: true });
}
