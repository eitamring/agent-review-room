import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function tokenOverlap(a, b) {
  const normalize = (s) =>
    new Set(s.toLowerCase().split(/\W+/).filter((t) => t.length > 3));
  const ta = normalize(a);
  const tb = normalize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  return intersection / Math.max(ta.size, tb.size);
}

function isSameCluster(cluster, candidate, allFindings) {
  const clusterMembers = allFindings.filter((f) => cluster.findingIds.includes(f.id));
  if (clusterMembers.length === 0) return false;

  const hasOverlap = clusterMembers.some(
    (member) => tokenOverlap(member.title, candidate.title) >= 0.5,
  );
  if (!hasOverlap) return false;

  const clusterPaths = new Set(
    clusterMembers.flatMap((m) => m.evidence.filter((e) => e.path).map((e) => e.path)),
  );
  return candidate.evidence.some((e) => e.path && clusterPaths.has(e.path));
}

function clusterFindings(findings) {
  const clusters = [];

  for (const finding of findings) {
    const existing = clusters.find((c) => isSameCluster(c, finding, findings));
    if (existing) {
      existing.findingIds.push(finding.id);
      existing.isConsensus = existing.findingIds.length >= 2;
    } else {
      clusters.push({
        id: crypto.randomUUID(),
        title: finding.title,
        findingIds: [finding.id],
        isConsensus: false,
      });
    }
  }

  return clusters;
}

function makeFinding(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    severity: 'medium',
    title: 'Default title',
    summary: 'summary',
    confidence: 'high',
    evidence: [{ kind: 'file', path: 'src/index.ts', line: 1, excerpt: 'x' }],
    recommendation: 'fix it',
    ...overrides,
  };
}

describe('clustering', () => {
  it('returns empty clusters for empty findings', () => {
    assert.deepEqual(clusterFindings([]), []);
  });

  it('creates one cluster for a single finding', () => {
    const f = makeFinding();
    const clusters = clusterFindings([f]);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].isConsensus, false);
    assert.deepEqual(clusters[0].findingIds, [f.id]);
  });

  it('merges two identical-title findings into one cluster with isConsensus=true', () => {
    const f1 = makeFinding({ title: 'Missing error handling in database module' });
    const f2 = makeFinding({ title: 'Missing error handling in database module' });
    const clusters = clusterFindings([f1, f2]);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].isConsensus, true);
    assert.deepEqual(clusters[0].findingIds, [f1.id, f2.id]);
  });

  it('keeps two completely different findings separate', () => {
    const f1 = makeFinding({
      title: 'SQL injection vulnerability detected',
      evidence: [{ kind: 'file', path: 'src/db.ts', line: 10, excerpt: 'x' }],
    });
    const f2 = makeFinding({
      title: 'Missing TypeScript strict mode',
      evidence: [{ kind: 'file', path: 'tsconfig.json', line: 1, excerpt: 'y' }],
    });
    const clusters = clusterFindings([f1, f2]);
    assert.equal(clusters.length, 2);
    assert.equal(clusters[0].isConsensus, false);
    assert.equal(clusters[1].isConsensus, false);
  });

  it('keeps findings with same file but different titles separate', () => {
    const f1 = makeFinding({
      title: 'SQL injection vulnerability',
      evidence: [{ kind: 'file', path: 'src/index.ts', line: 10, excerpt: 'x' }],
    });
    const f2 = makeFinding({
      title: 'Unused import statements',
      evidence: [{ kind: 'file', path: 'src/index.ts', line: 1, excerpt: 'y' }],
    });
    const clusters = clusterFindings([f1, f2]);
    assert.equal(clusters.length, 2);
  });

  it('ignores short words (<=3 chars) in token overlap', () => {
    assert.equal(tokenOverlap('a is the bug', 'a is the fix'), 0);
  });
});
