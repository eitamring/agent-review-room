import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function getTimeoutMs(session) {
  return (session.timeoutMinutes ?? 10) * 60 * 1000;
}

function extractFindings(text) {
  if (!text || !text.trim()) return [];

  const clean = text.replace(/\x1b\[[0-9;]*m/g, '');

  try {
    const parsed = JSON.parse(clean);
    if (parsed.findings && Array.isArray(parsed.findings)) {
      return parsed.findings.map((f) => ({ id: 'test-id', ...f }));
    }
  } catch { /* not direct JSON */ }

  const fenceMatch = clean.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      if (parsed.findings && Array.isArray(parsed.findings)) {
        return parsed.findings.map((f) => ({ id: 'test-id', ...f }));
      }
    } catch { /* bad JSON in fence */ }
  }

  const braceStart = clean.indexOf('{"findings"');
  if (braceStart >= 0) {
    let depth = 0;
    let end = braceStart;
    for (let i = braceStart; i < clean.length; i++) {
      if (clean[i] === '{') depth++;
      if (clean[i] === '}') depth--;
      if (depth === 0) { end = i + 1; break; }
    }
    try {
      const parsed = JSON.parse(clean.slice(braceStart, end));
      if (parsed.findings && Array.isArray(parsed.findings)) {
        return parsed.findings.map((f) => ({ id: 'test-id', ...f }));
      }
    } catch { /* couldn't extract */ }
  }

  const arrayMatch = clean.match(/\[\s*\{[\s\S]*?"severity"[\s\S]*?\}\s*\]/);
  if (arrayMatch) {
    try {
      const arr = JSON.parse(arrayMatch[0]);
      if (Array.isArray(arr) && arr.length > 0 && arr[0].severity) {
        return arr.map((f) => ({ id: 'test-id', ...f }));
      }
    } catch { /* not valid */ }
  }

  if (clean.length > 50) {
    return [{
      id: 'test-id',
      severity: 'low',
      title: 'Review Summary',
      summary: clean.slice(0, 2000),
      confidence: 'medium',
      evidence: [{ kind: 'command', excerpt: 'CLI text output' }],
      recommendation: 'Review the full output in the Meeting Room.',
    }];
  }

  return [];
}

function buildPromptSync(session, reviewer, options) {
  const rt = session.reviewTarget;
  let target;
  switch (rt.kind) {
    case 'working-tree':
      target = 'Review the uncommitted working tree changes (run `git diff` and `git diff --staged`).';
      break;
    case 'git-range':
      target = `Review changes between ${rt.baseRef} and ${rt.headRef} (run \`git diff ${rt.baseRef}..${rt.headRef}\`).`;
      break;
    case 'patch-file':
      target = `Review the patch file at ${rt.patchPath}.`;
      break;
  }

  const roleLabel = (reviewer.role === 'custom' && reviewer.customRoleTitle)
    ? reviewer.customRoleTitle
    : reviewer.role;

  const lines = [];

  if (session.customPrompt) {
    lines.push(session.customPrompt);
  } else {
    lines.push(
      `You are a ${roleLabel} code reviewer.`,
      `Repository: ${session.repoPath}`,
      '',
      target,
    );
    lines.push(
      '',
      'Rules:',
      '- Explore the repository and read relevant files.',
      '- Every finding MUST include evidence with file paths, line numbers, and excerpts.',
      '- Be specific and concise.',
    );
  }

  lines.push(
    '',
    'IMPORTANT: You are in READ-ONLY mode. Do NOT attempt to write, edit, or modify any files. Only read and analyze.',
  );

  if (options?.includeJsonInstructions !== false) {
    lines.push('', 'When you are done, output ONLY a raw JSON object (no markdown, no code fences, no explanation before or after):\n{"findings":[{"severity":"critical|high|medium|low","title":"...","summary":"...","confidence":"high|medium|low","evidence":[{"kind":"file|diff","path":"...","line":0,"excerpt":"..."}],"recommendation":"..."}]}\nIf you have no findings, output: {"findings":[]}');
  }

  return lines.join('\n');
}

describe('extractFindings (extended)', () => {
  it('strips ANSI escape codes before parsing', () => {
    const ansi = '\x1b[32m{"findings":[{"severity":"high","title":"Bug","summary":"x","confidence":"high","evidence":[],"recommendation":"fix"}]}\x1b[0m';
    const result = extractFindings(ansi);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'Bug');
  });

  it('finds {"findings" embedded deep in text via brace matching', () => {
    const input = 'Here is a lot of preamble text that goes on and on. ' +
      'More text here. {"findings":[{"severity":"low","title":"Deep","summary":"found","confidence":"low","evidence":[],"recommendation":"ok"}]} and trailing text.';
    const result = extractFindings(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'Deep');
  });

  it('parses array-only format without wrapper object', () => {
    const input = '[{"severity":"medium","title":"ArrayFind","summary":"arr","confidence":"high","evidence":[],"recommendation":"do it"}]';
    const result = extractFindings(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'ArrayFind');
  });

  it('uses first valid code fence when multiple exist', () => {
    const input = 'text\n```json\n{"findings":[{"severity":"high","title":"First","summary":"a","confidence":"high","evidence":[],"recommendation":"x"}]}\n```\nmore\n```json\n{"findings":[{"severity":"low","title":"Second","summary":"b","confidence":"low","evidence":[],"recommendation":"y"}]}\n```';
    const result = extractFindings(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'First');
  });
});

describe('getTimeoutMs', () => {
  it('returns session timeout when set', () => {
    assert.equal(getTimeoutMs({ timeoutMinutes: 5 }), 5 * 60 * 1000);
  });

  it('returns default 10 minutes when not set', () => {
    assert.equal(getTimeoutMs({}), DEFAULT_TIMEOUT_MS);
  });
});

describe('buildPrompt', () => {
  const baseSession = {
    repoPath: '/repo',
    reviewTarget: { kind: 'working-tree' },
  };
  const reviewer = { role: 'security' };

  it('includes custom prompt when set', () => {
    const session = { ...baseSession, customPrompt: 'Focus on SQL injection only.' };
    const prompt = buildPromptSync(session, reviewer);
    assert.ok(prompt.includes('Focus on SQL injection only.'));
  });

  it('includes READ-ONLY instruction', () => {
    const prompt = buildPromptSync(baseSession, reviewer);
    assert.ok(prompt.includes('READ-ONLY'));
  });

  it('includes repo path in default prompt', () => {
    const prompt = buildPromptSync(baseSession, reviewer);
    assert.ok(prompt.includes('/repo'));
  });
});
