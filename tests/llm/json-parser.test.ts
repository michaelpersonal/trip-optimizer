import { describe, it, expect } from 'vitest';
import { parseJsonResponse } from '../../src/llm/json-parser.js';

describe('parseJsonResponse', () => {
  it('parses clean JSON object', () => {
    expect(parseJsonResponse('{"a": 1}')).toEqual({ a: 1 });
  });

  it('parses clean JSON array', () => {
    expect(parseJsonResponse('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('extracts JSON from markdown code block', () => {
    expect(parseJsonResponse('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('handles +N values in JSON', () => {
    expect(parseJsonResponse('{"delta": +3}')).toEqual({ delta: 3 });
  });

  it('extracts JSON object from surrounding text', () => {
    expect(parseJsonResponse('Here is the result: {"a": 1} done.')).toEqual({ a: 1 });
  });

  it('extracts JSON array from surrounding text', () => {
    expect(parseJsonResponse('Results: [{"a": 1}, {"b": 2}] end')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('handles nested objects', () => {
    const input = '{"outer": {"inner": 42}}';
    expect(parseJsonResponse(input)).toEqual({ outer: { inner: 42 } });
  });

  it('throws on completely unparseable input', () => {
    expect(() => parseJsonResponse('not json at all')).toThrow();
  });

  it('handles empty object', () => {
    expect(parseJsonResponse('{}')).toEqual({});
  });

  it('handles empty array', () => {
    expect(parseJsonResponse('[]')).toEqual([]);
  });
});
