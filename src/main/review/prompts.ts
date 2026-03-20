import type { ReviewerConfig, ReviewSession } from '../../shared/types';
import type { ToolDefinition } from '../providers/gateway';

export function buildReviewerSystemPrompt(
  session: ReviewSession,
  reviewer: ReviewerConfig,
): string {
  const roleLabel = reviewer.role === 'custom' && reviewer.customRoleTitle
    ? reviewer.customRoleTitle
    : reviewer.role;
  const roleDesc = reviewer.role === 'custom' && reviewer.customRoleDesc
    ? `\nFocus: ${reviewer.customRoleDesc}`
    : '';
  return [
    `You are a ${roleLabel} code reviewer examining a local repository.${roleDesc}`,
    `Repository: ${session.repoPath}`,
    '',
    'Rules:',
    '- Use the provided tools to inspect files, diffs, and search code.',
    '- Every finding MUST include at least one evidence entry with a file path, line number, and excerpt.',
    '- Emit short work notes via add_note to show progress. One sentence max.',
    '- Do not emit raw chain-of-thought or internal reasoning as notes.',
    '- Call complete_review when done.',
  ].join('\n');
}

export function buildReviewerUserMessage(
  session: ReviewSession,
  reviewer: ReviewerConfig,
): string {
  let target: string;
  const rt = session.reviewTarget;
  switch (rt.kind) {
    case 'working-tree':
      target = 'Review the uncommitted working tree changes. Call read_diff with no arguments to see the current diff.';
      break;
    case 'git-range':
      target = `Review changes between ${rt.baseRef} and ${rt.headRef}. Call read_diff with baseRef="${rt.baseRef}" and headRef="${rt.headRef}".`;
      break;
    case 'patch-file':
      target = `Review the patch file at ${rt.patchPath}.`;
      break;
  }
  const userRoleLabel = reviewer.role === 'custom' && reviewer.customRoleTitle
    ? reviewer.customRoleTitle
    : reviewer.role;
  const lines = [
    target,
    '',
    `Your role: ${userRoleLabel} reviewer.`,
  ];
  if (session.customPrompt) {
    lines.push('', 'User instructions:', session.customPrompt);
  }
  lines.push('', 'Start by listing files, then inspect the diff and relevant source. Submit findings, then call complete_review.');
  return lines.join('\n');
}

export function buildManagerSystemPrompt(hasFindings: boolean, customPrompt?: string): string {
  if (!hasFindings && customPrompt) {
    return [
      'You are a meeting manager consolidating responses from multiple agents.',
      '',
      'Combine all agent responses into one clear, direct answer.',
      'Do not add review structure (Top Issues, Consensus, etc.) unless the task is a code review.',
      'Just answer the question or summarize the responses naturally.',
    ].join('\n');
  }

  return [
    'You are the meeting manager for a multi-reviewer session.',
    '',
    'Responsibilities:',
    '- Merge findings that describe the same root cause.',
    '- Separate consensus (multiple reviewers agree) from disputed findings.',
    '- Preserve minority findings when evidence is meaningful.',
    '- Rank by severity then confidence.',
    customPrompt?.includes('PR review') || customPrompt?.includes('pr format')
      ? '- Produce a markdown summary formatted as a PR review: list issues, suggested fixes, and an overall verdict.'
      : '- Produce a concise markdown summary consolidating all agent perspectives.',
    '',
    'Every claim must reference at least one finding. Do not introduce new issues.',
    '',
    'End your output with a section titled "## Recommended PR Description" containing a ready-to-paste',
    'GitHub PR body (one-paragraph summary, bullet list of changes, review notes).',
  ].join('\n');
}

export const REVIEWER_TOOLS: ToolDefinition[] = [
  {
    name: 'list_files',
    description: 'List files in a directory of the repository. Returns relative paths.',
    parameters: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Relative directory path. Omit for repository root.',
        },
      },
    },
  },
  {
    name: 'search_text',
    description: 'Search for a text pattern across repository files.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (regex unless literal is true).' },
        literal: { type: 'boolean', description: 'Treat pattern as literal text, not regex.' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'read_file',
    description: 'Read a file, optionally a specific line range.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Relative file path.' },
        startLine: { type: 'number', description: 'First line (1-based).' },
        endLine: { type: 'number', description: 'Last line (inclusive).' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'read_diff',
    description: 'Read git diff output. No arguments = working tree diff.',
    parameters: {
      type: 'object',
      properties: {
        baseRef: { type: 'string' },
        headRef: { type: 'string' },
        filePath: { type: 'string', description: 'Limit diff to this file.' },
      },
    },
  },
  {
    name: 'read_git_metadata',
    description: 'Get current branch, HEAD commit, remotes, and tags.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'add_note',
    description: 'Record a short work note visible to the user in real-time.',
    parameters: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'One-sentence progress note.' },
      },
      required: ['note'],
    },
  },
  {
    name: 'add_finding',
    description: 'Submit a review finding with evidence.',
    parameters: {
      type: 'object',
      properties: {
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        title: { type: 'string' },
        summary: { type: 'string' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        evidence: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['file', 'diff', 'command'] },
              path: { type: 'string' },
              line: { type: 'number' },
              excerpt: { type: 'string' },
            },
            required: ['kind'],
          },
        },
        recommendation: { type: 'string' },
      },
      required: ['severity', 'title', 'summary', 'confidence', 'evidence', 'recommendation'],
    },
  },
  {
    name: 'complete_review',
    description: 'Signal that your review is finished.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One-sentence summary of your review.' },
      },
      required: ['summary'],
    },
  },
];
