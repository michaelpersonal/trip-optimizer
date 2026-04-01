import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { success, error, CLIError, stderrLog, ERROR_CODES } from '../../src/cli-utils/json-output.js';

describe('json-output', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe('success', () => {
    it('writes correct envelope to stdout with trip_id', () => {
      success('trip list', 'hawaii-2025', { trips: ['hawaii-2025'] });

      expect(stdoutSpy).toHaveBeenCalledOnce();
      const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
      expect(output).toEqual({
        ok: true,
        command: 'trip list',
        trip_id: 'hawaii-2025',
        data: { trips: ['hawaii-2025'] },
      });
    });

    it('omits trip_id when null', () => {
      success('trip list', null, { trips: [] });

      const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
      expect(output.ok).toBe(true);
      expect(output.command).toBe('trip list');
      expect(output).not.toHaveProperty('trip_id');
      expect(output.data).toEqual({ trips: [] });
    });
  });

  describe('error', () => {
    it('writes correct error envelope with code/message/hint', () => {
      error('trip show', 'TRIP_NOT_FOUND', 'missing-trip');

      expect(stdoutSpy).toHaveBeenCalledOnce();
      const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
      expect(output).toEqual({
        ok: false,
        command: 'trip show',
        trip_id: 'missing-trip',
        error: {
          code: 'TRIP_NOT_FOUND',
          message: ERROR_CODES.TRIP_NOT_FOUND.message,
          hint: ERROR_CODES.TRIP_NOT_FOUND.hint,
        },
      });
    });

    it('omits trip_id when not provided', () => {
      error('trip show', 'NO_TRIP_CONTEXT');

      const output = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
      expect(output.ok).toBe(false);
      expect(output).not.toHaveProperty('trip_id');
      expect(output.error.code).toBe('NO_TRIP_CONTEXT');
    });
  });

  describe('CLIError', () => {
    it('creates error with code, message, hint from ERROR_CODES', () => {
      const err = new CLIError('LLM_ERROR');
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('LLM_ERROR');
      expect(err.message).toBe(ERROR_CODES.LLM_ERROR.message);
      expect(err.hint).toBe(ERROR_CODES.LLM_ERROR.hint);
    });

    it('extends Error', () => {
      const err = new CLIError('NO_PLAN');
      expect(err instanceof Error).toBe(true);
      expect(err.name).toBe('CLIError');
    });
  });

  describe('stderrLog', () => {
    it('writes message to stderr', () => {
      stderrLog('Processing...');
      expect(stderrSpy).toHaveBeenCalledOnce();
      expect(stderrSpy.mock.calls[0][0]).toContain('Processing...');
    });
  });

  describe('ERROR_CODES', () => {
    it('all defined error codes have message and hint', () => {
      const expectedCodes = [
        'NO_TRIP_CONTEXT', 'TRIP_NOT_FOUND', 'TRIP_ID_CONFLICT',
        'PROPOSAL_NOT_FOUND', 'PROPOSAL_CONFLICT', 'NO_PLAN',
        'LLM_ERROR', 'MIGRATION_FAILED',
      ];

      for (const code of expectedCodes) {
        expect(ERROR_CODES[code], `Missing error code: ${code}`).toBeDefined();
        expect(ERROR_CODES[code].message, `${code} missing message`).toBeTruthy();
        expect(ERROR_CODES[code].hint, `${code} missing hint`).toBeTruthy();
      }

      expect(Object.keys(ERROR_CODES)).toHaveLength(expectedCodes.length);
    });
  });
});
