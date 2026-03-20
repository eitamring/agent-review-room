import type { Finding } from '../../shared/types';

export type FindingCluster = {
  id: string;
  title: string;
  findingIds: string[];
  isConsensus: boolean;
};

/**
 * Deterministic, heuristic-only clustering — no embeddings or network calls.
 *
 * Two findings are candidates for the same cluster if they share a significant
 * word overlap in their titles and at least one common file path in evidence.
 * The threshold is intentionally conservative to avoid false merges.
 *
 * This is a placeholder implementation. A real version may use TF-IDF or a
 * small Jaccard coefficient on normalized title tokens.
 */
export function clusterFindings(findings: Finding[]): FindingCluster[] {
  const clusters: FindingCluster[] = [];

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

function isSameCluster(
  cluster: FindingCluster,
  candidate: Finding,
  allFindings: Finding[],
): boolean {
  const idSet = new Set(cluster.findingIds);
  const clusterMembers = allFindings.filter((f) => idSet.has(f.id));
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

function tokenOverlap(a: string, b: string): number {
  const normalize = (s: string) =>
    new Set(s.toLowerCase().split(/\W+/).filter((t) => t.length > 3));
  const ta = normalize(a);
  const tb = normalize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  return intersection / Math.max(ta.size, tb.size);
}
