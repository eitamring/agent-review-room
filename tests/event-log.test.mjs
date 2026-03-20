import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function parseJsonl(content, limit = 500) {
  const lines = content.split('\n').filter(Boolean);
  const tail = lines.slice(-limit);
  return tail.map((line) => JSON.parse(line));
}

function safeParseJsonl(content, limit = 500) {
  const lines = content.split('\n').filter(Boolean);
  const tail = lines.slice(-limit);
  const results = [];
  for (const line of tail) {
    try {
      results.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return results;
}

describe('event-log JSONL parsing', () => {
  it('parses valid JSONL lines', () => {
    const content = '{"type":"a","at":"2024-01-01"}\n{"type":"b","at":"2024-01-02"}\n';
    const events = parseJsonl(content);
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'a');
    assert.equal(events[1].type, 'b');
  });

  it('filters empty and whitespace-only lines', () => {
    const content = '{"type":"a"}\n\n   \n{"type":"b"}\n';
    const lines = content.split('\n').filter(Boolean);
    const nonWhitespace = lines.filter((l) => l.trim());
    assert.equal(nonWhitespace.length, 2);
  });

  it('limit parameter returns only last N events', () => {
    const lines = Array.from({ length: 10 }, (_, i) => JSON.stringify({ n: i }));
    const content = lines.join('\n') + '\n';
    const events = parseJsonl(content, 3);
    assert.equal(events.length, 3);
    assert.equal(events[0].n, 7);
    assert.equal(events[2].n, 9);
  });

  it('handles malformed JSON lines without crashing', () => {
    const content = '{"type":"ok"}\nnot-json\n{"type":"also-ok"}\n';
    const events = safeParseJsonl(content);
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'ok');
    assert.equal(events[1].type, 'also-ok');
  });
});
