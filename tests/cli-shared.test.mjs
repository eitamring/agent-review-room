import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('extractFindings', () => {
  // The actual extractFindings lives in TypeScript (src/main/review/cli-shared.ts).
  // Until a TS test runner is configured, these tests validate the parsing logic
  // inline using the same algorithm.

  function extractFindings(text) {
    if (!text.trim()) return [];

    try {
      const parsed = JSON.parse(text);
      if (parsed.findings && Array.isArray(parsed.findings)) {
        return parsed.findings.map((f) => ({ id: 'test-id', ...f }));
      }
    } catch { /* not direct JSON */ }

    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      try {
        const parsed = JSON.parse(fenceMatch[1]);
        if (parsed.findings && Array.isArray(parsed.findings)) {
          return parsed.findings.map((f) => ({ id: 'test-id', ...f }));
        }
      } catch { /* bad JSON in fence */ }
    }

    const braceStart = text.indexOf('{"findings"');
    if (braceStart >= 0) {
      let depth = 0;
      let end = braceStart;
      for (let i = braceStart; i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}') depth--;
        if (depth === 0) { end = i + 1; break; }
      }
      try {
        const parsed = JSON.parse(text.slice(braceStart, end));
        if (parsed.findings && Array.isArray(parsed.findings)) {
          return parsed.findings.map((f) => ({ id: 'test-id', ...f }));
        }
      } catch { /* couldn't extract */ }
    }

    if (text.length > 50) {
      return [{
        id: 'test-id',
        severity: 'low',
        title: 'Review Summary',
        summary: text.slice(0, 2000),
        confidence: 'medium',
        evidence: [{ kind: 'command', excerpt: 'CLI text output' }],
        recommendation: 'Review the full output in the Meeting Room.',
      }];
    }

    return [];
  }

  it('parses direct JSON with findings array', () => {
    const input = JSON.stringify({
      findings: [{ severity: 'high', title: 'Bug', summary: 'A bug', confidence: 'high', evidence: [], recommendation: 'Fix it' }],
    });
    const result = extractFindings(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'Bug');
  });

  it('parses JSON inside a code fence', () => {
    const input = 'Here are findings:\n```json\n{"findings":[{"severity":"medium","title":"Issue","summary":"desc","confidence":"low","evidence":[],"recommendation":"none"}]}\n```';
    const result = extractFindings(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].severity, 'medium');
  });

  it('finds {"findings" embedded in surrounding text', () => {
    const input = 'Some preamble text {"findings":[{"severity":"low","title":"Minor","summary":"x","confidence":"low","evidence":[],"recommendation":"y"}]} trailing';
    const result = extractFindings(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'Minor');
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(extractFindings(''), []);
    assert.deepEqual(extractFindings('   '), []);
  });

  it('returns fallback finding for long non-JSON text', () => {
    const input = 'A'.repeat(100);
    const result = extractFindings(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].severity, 'low');
    assert.equal(result[0].title, 'Review Summary');
  });

  it('returns empty for short non-JSON text', () => {
    assert.deepEqual(extractFindings('short'), []);
  });
});
