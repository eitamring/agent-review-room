import fs from 'fs/promises';
import type {
  ReviewSession,
  ReviewerConfig,
  ReviewEvent,
  Finding,
} from '../../shared/types';

export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
export const CLI_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;

export function getTimeoutMs(session: { timeoutMinutes?: number }): number {
  return (session.timeoutMinutes ?? 10) * 60 * 1000;
}
export const now = () => new Date().toISOString();

export const FINDINGS_JSON_INSTRUCTIONS = `
When you are done, output ONLY a raw JSON object (no markdown, no code fences, no explanation before or after):
{"findings":[{"severity":"critical|high|medium|low","title":"...","summary":"...","confidence":"high|medium|low","evidence":[{"kind":"file|diff","path":"...","line":0,"excerpt":"..."}],"recommendation":"..."}]}
If you have no findings, output: {"findings":[]}`.trim();

export function roleLabel(reviewer: ReviewerConfig): string {
  if (reviewer.role === 'custom' && reviewer.customRoleTitle) {
    return reviewer.customRoleTitle;
  }
  return reviewer.role;
}

export function extractFindings(text: string | undefined | null, fallbackSource?: string): Finding[] {
  if (!text || !text.trim()) return [];

  try {
    const parsed = JSON.parse(text);
    if (parsed.findings && Array.isArray(parsed.findings)) {
      return parsed.findings.map((f: Omit<Finding, 'id'>) => ({ id: crypto.randomUUID(), ...f }));
    }
  } catch { /* not direct JSON */ }

  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      if (parsed.findings && Array.isArray(parsed.findings)) {
        return parsed.findings.map((f: Omit<Finding, 'id'>) => ({ id: crypto.randomUUID(), ...f }));
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
        return parsed.findings.map((f: Omit<Finding, 'id'>) => ({ id: crypto.randomUUID(), ...f }));
      }
    } catch { /* couldn't extract */ }
  }

  if (text.length > 50) {
    return [{
      id: crypto.randomUUID(),
      severity: 'low',
      title: 'Review Summary',
      summary: text.slice(0, 2000),
      confidence: 'medium',
      evidence: [{ kind: 'command', excerpt: fallbackSource ?? 'CLI text output (structured parsing failed)' }],
      recommendation: 'Review the full output in the Meeting Room.',
    }];
  }

  return [];
}

export async function buildPrompt(
  session: ReviewSession,
  reviewer: ReviewerConfig,
  options?: { includeJsonInstructions?: boolean },
): Promise<string> {
  const rt = session.reviewTarget;
  let target: string;
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

  const role = roleLabel(reviewer);
  const lines: string[] = [];

  if (reviewer.role === 'custom' && reviewer.customRoleDesc) {
    lines.push(`You are: ${reviewer.customRoleTitle ?? 'custom analyst'}`, '', reviewer.customRoleDesc, '');
  }

  if (reviewer.skillFilePath) {
    try {
      const skill = await fs.readFile(reviewer.skillFilePath, 'utf-8');
      lines.push('Skill instructions:', skill, '');
    } catch { /* skill file not found, skip */ }
  }

  if (session.customPrompt) {
    lines.push(session.customPrompt);
  } else {
    lines.push(
      `You are a ${role} code reviewer.`,
      `Repository: ${session.repoPath}`,
      '',
      target,
    );
  }

  if (!session.customPrompt) {
    lines.push(
      '',
      'Rules:',
      '- Explore the repository and read relevant files.',
      '- Every finding MUST include evidence with file paths, line numbers, and excerpts.',
      '- Be specific and concise.',
    );
  }

  if (options?.includeJsonInstructions !== false) {
    lines.push('', FINDINGS_JSON_INSTRUCTIONS);
  }

  return lines.join('\n');
}

export function processStreamEvent(
  evt: Record<string, unknown>,
  agentId: string,
  onEvent: (event: ReviewEvent) => Promise<void>,
): void {
  const type = String(evt.type ?? '');
  if (!type) return;

  if (type === 'assistant' || type === 'message') {
    const msg = (evt.message ?? evt) as {
      content?: string | Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
    };
    if (!msg.content) return;

    if (typeof msg.content === 'string') {
      const short = msg.content.replace(/\s+/g, ' ').trim().slice(0, 150);
      if (short && !short.startsWith('{')) {
        void onEvent({ type: 'agent.note', agentId, at: now(), note: short });
      }
      return;
    }

    if (!Array.isArray(msg.content)) return;
    for (const block of msg.content) {
      if (block.type === 'text' && block.text) {
        const short = block.text.replace(/\s+/g, ' ').trim().slice(0, 150);
        if (short && !short.startsWith('{')) {
          void onEvent({ type: 'agent.note', agentId, at: now(), note: short });
        }
      }
      if (block.type === 'tool_use' && block.name) {
        const detail = block.input?.file_path || block.input?.filePath || block.input?.pattern || block.input?.command || '';
        const state = block.name.includes('Grep') || block.name.includes('search') ? 'searching' : 'reading';
        void onEvent({
          type: 'agent.status',
          agentId,
          at: now(),
          state: state as 'searching' | 'reading',
          label: `${block.name}${detail ? `: ${String(detail).slice(0, 80)}` : ''}`,
        });
      }
    }
  }
}

export function emitFindingsAndDone(
  extracted: Finding[],
  findings: Finding[],
  agentId: string,
  onEvent: (event: ReviewEvent) => Promise<void>,
): void {
  for (const f of extracted) {
    findings.push(f);
    void onEvent({ type: 'finding.draft', agentId, at: now(), finding: f });
  }

  void onEvent({
    type: 'agent.status',
    agentId,
    at: now(),
    state: 'done',
    label: `${findings.length} finding(s)`,
  });
}
