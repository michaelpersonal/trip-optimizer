import fs from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';

export interface TripFiles {
  constraints: string;  // YAML content
  rubrics: string;      // YAML content
  plan: string;         // Markdown content
  program: string;      // Markdown content
}

const GITIGNORE = `results.tsv
score_history.jsonl
node_modules/
`;

export async function scaffoldTrip(tripDir: string, files: TripFiles): Promise<void> {
  // Create directory
  fs.mkdirSync(tripDir, { recursive: true });

  // Write files
  fs.writeFileSync(path.join(tripDir, 'constraints.yaml'), files.constraints);
  fs.writeFileSync(path.join(tripDir, 'rubrics.yaml'), files.rubrics);
  fs.writeFileSync(path.join(tripDir, 'plan.md'), files.plan);
  fs.writeFileSync(path.join(tripDir, 'program.md'), files.program);
  fs.writeFileSync(path.join(tripDir, 'activities_db.json'), '{}');
  fs.writeFileSync(path.join(tripDir, '.gitignore'), GITIGNORE);
  fs.mkdirSync(path.join(tripDir, 'proposals'), { recursive: true });

  // Initialize git and commit
  const git = simpleGit(tripDir);
  await git.init();
  await git.add('-A');
  await git.commit('Initial trip scaffold');
}
