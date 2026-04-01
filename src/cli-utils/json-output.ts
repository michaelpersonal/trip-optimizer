export interface SuccessEnvelope<T> {
  ok: true;
  command: string;
  trip_id?: string;
  data: T;
}

export interface ErrorEnvelope {
  ok: false;
  command: string;
  trip_id?: string;
  error: {
    code: string;
    message: string;
    hint: string;
  };
}

export const ERROR_CODES: Record<string, { message: string; hint: string }> = {
  NO_TRIP_CONTEXT: {
    message: 'No trip context available',
    hint: "Provide --trip <id> flag, or run 'trip-optimizer trip set-default <id>' to set a default, or run from a trip directory",
  },
  TRIP_NOT_FOUND: {
    message: 'Trip ID not in registry',
    hint: "Run 'trip-optimizer trip list --json' to see registered trips, or 'trip-optimizer migrate <path>' to register an existing trip",
  },
  TRIP_ID_CONFLICT: {
    message: 'Trip ID already registered',
    hint: "Run 'trip-optimizer migrate <path> --id <new-id>' to use a different trip ID",
  },
  PROPOSAL_NOT_FOUND: {
    message: 'Proposal ID does not exist',
    hint: "Run 'trip-optimizer proposals --trip <id> --json' to see available proposals",
  },
  PROPOSAL_CONFLICT: {
    message: "Plan has moved past this proposal's base version",
    hint: 'Plan has changed since this proposal was created. Run \'trip-optimizer propose --trip <id> --request "<original request>" --json\' to regenerate against the current plan',
  },
  NO_PLAN: {
    message: 'Trip exists but has no plan.json',
    hint: "Run 'trip-optimizer run' in the trip directory to generate an initial plan, or 'trip-optimizer migrate <path>' if a plan.md already exists",
  },
  LLM_ERROR: {
    message: 'Model call failed',
    hint: "Check API key with 'trip-optimizer config' or retry. If using Vertex AI, run 'gcloud auth application-default login'",
  },
  MIGRATION_FAILED: {
    message: 'Could not parse existing plan.md',
    hint: "Ensure the directory contains a valid plan.md. Run 'trip-optimizer migrate <path> --verbose' for details",
  },
};

export function success<T>(command: string, tripId: string | null, data: T): void {
  const envelope: SuccessEnvelope<T> = { ok: true, command, data };
  if (tripId != null) {
    envelope.trip_id = tripId;
  }
  process.stdout.write(JSON.stringify(envelope));
}

export function error(command: string, code: string, tripId?: string): void {
  const errorDef = ERROR_CODES[code];
  const envelope: ErrorEnvelope = {
    ok: false,
    command,
    error: {
      code,
      message: errorDef?.message ?? code,
      hint: errorDef?.hint ?? '',
    },
  };
  if (tripId != null) {
    envelope.trip_id = tripId;
  }
  process.stdout.write(JSON.stringify(envelope));
}

export class CLIError extends Error {
  code: string;
  hint: string;

  constructor(code: string) {
    const errorDef = ERROR_CODES[code];
    super(errorDef?.message ?? code);
    this.name = 'CLIError';
    this.code = code;
    this.hint = errorDef?.hint ?? '';
  }
}

export function stderrLog(msg: string): void {
  process.stderr.write(msg + '\n');
}
