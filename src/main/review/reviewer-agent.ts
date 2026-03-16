import type {
  ReviewSession,
  ReviewerConfig,
  ReviewEvent,
  Finding,
} from '../../shared/types';
import { getProvider } from '../providers/gateway';
import type { ContentBlock, Message, ToolCall } from '../providers/gateway';
import {
  buildReviewerSystemPrompt,
  buildReviewerUserMessage,
  REVIEWER_TOOLS,
} from './prompts';
import { listFiles } from '../tools/list-files';
import { searchText } from '../tools/search-text';
import { readFile } from '../tools/read-file';
import { readDiff } from '../tools/read-diff';
import { readGitMetadata } from '../tools/git-metadata';

const MAX_TURNS = 30;
const now = () => new Date().toISOString();

export async function runReviewerAgent(
  session: ReviewSession,
  reviewer: ReviewerConfig,
  onEvent: (event: ReviewEvent) => Promise<void>,
  signal?: AbortSignal,
): Promise<Finding[]> {
  const { resolveApiKey } = await import('../providers/api-keys');
  const apiKey = resolveApiKey(reviewer.provider);
  const provider = getProvider(reviewer.provider);
  const findings: Finding[] = [];

  await onEvent({
    type: 'agent.status',
    agentId: reviewer.id,
    at: now(),
    state: 'planning',
    label: 'Starting review',
  });

  const messages: Message[] = [
    { role: 'user', content: buildReviewerUserMessage(session, reviewer) },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (signal?.aborted) throw new Error('Review aborted');

    const response = await provider.complete(
      {
        model: reviewer.model,
        system: buildReviewerSystemPrompt(session, reviewer),
        messages,
        tools: REVIEWER_TOOLS,
        maxTokens: 4096,
      },
      apiKey,
    );

    messages.push({ role: 'assistant', content: response.content });

    if (response.stopReason !== 'tool_use') break;

    const toolResults: ContentBlock[] = [];
    let reviewComplete = false;

    for (const call of response.toolCalls) {
      if (signal?.aborted) throw new Error('Review aborted');

      const result = await executeTool(call, session, reviewer, findings, onEvent);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
        is_error: result.isError,
      });

      if (call.name === 'complete_review') reviewComplete = true;
    }

    messages.push({ role: 'user', content: toolResults });

    if (reviewComplete) break;
  }

  await onEvent({
    type: 'agent.status',
    agentId: reviewer.id,
    at: now(),
    state: 'done',
    label: `${findings.length} finding(s)`,
  });

  return findings;
}

type ToolResult = { data: unknown; isError: boolean };

async function executeTool(
  call: ToolCall,
  session: ReviewSession,
  reviewer: ReviewerConfig,
  findings: Finding[],
  onEvent: (event: ReviewEvent) => Promise<void>,
): Promise<ToolResult> {
  try {
    switch (call.name) {
      case 'list_files': {
        const input = call.arguments as { directory?: string };
        await onEvent({ type: 'agent.status', agentId: reviewer.id, at: now(), state: 'reading', label: `ls ${input.directory || '/'}` });
        return { data: await listFiles({ repoPath: session.repoPath, directory: input.directory }), isError: false };
      }

      case 'search_text': {
        const input = call.arguments as { pattern: string; literal?: boolean };
        await onEvent({ type: 'agent.status', agentId: reviewer.id, at: now(), state: 'searching', label: input.pattern });
        return { data: await searchText({ repoPath: session.repoPath, ...input }), isError: false };
      }

      case 'read_file': {
        const input = call.arguments as { filePath: string; startLine?: number; endLine?: number };
        await onEvent({ type: 'agent.status', agentId: reviewer.id, at: now(), state: 'reading', label: input.filePath });
        await onEvent({ type: 'agent.focus', agentId: reviewer.id, at: now(), filePaths: [input.filePath] });
        return { data: await readFile({ repoPath: session.repoPath, ...input }), isError: false };
      }

      case 'read_diff': {
        const input = call.arguments as { baseRef?: string; headRef?: string; filePath?: string };
        await onEvent({ type: 'agent.status', agentId: reviewer.id, at: now(), state: 'comparing', label: 'diff' });
        return { data: await readDiff({ repoPath: session.repoPath, ...input }), isError: false };
      }

      case 'read_git_metadata': {
        await onEvent({ type: 'agent.status', agentId: reviewer.id, at: now(), state: 'reading', label: 'git metadata' });
        return { data: await readGitMetadata(session.repoPath), isError: false };
      }

      case 'add_note': {
        const input = call.arguments as { note: string };
        await onEvent({ type: 'agent.note', agentId: reviewer.id, at: now(), note: input.note });
        return { data: { ok: true }, isError: false };
      }

      case 'add_finding': {
        const input = call.arguments as Omit<Finding, 'id'>;
        if (!input.evidence?.length) {
          return { data: { error: 'Findings must include at least one evidence entry.' }, isError: true };
        }
        const finding: Finding = { id: crypto.randomUUID(), ...input };
        findings.push(finding);
        await onEvent({ type: 'finding.draft', agentId: reviewer.id, at: now(), finding });
        return { data: { ok: true, findingId: finding.id }, isError: false };
      }

      case 'complete_review': {
        const input = call.arguments as { summary: string };
        await onEvent({ type: 'agent.status', agentId: reviewer.id, at: now(), state: 'done', label: input.summary });
        return { data: { ok: true }, isError: false };
      }

      default:
        return { data: { error: `Unknown tool: ${call.name}` }, isError: true };
    }
  } catch (err) {
    return { data: { error: (err as Error).message }, isError: true };
  }
}
