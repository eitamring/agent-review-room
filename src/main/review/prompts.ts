import type { ReviewerConfig, ReviewSession } from '../../shared/types';

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
  const rt = session.reviewTarget;
  let target: string;
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
