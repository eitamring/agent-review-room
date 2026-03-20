import { spawn } from 'child_process';
import type { ReviewSession, ReviewEvent, Finding } from '../../shared/types';
import type { FindingCluster } from './clustering';
import { buildManagerSystemPrompt } from './prompts';

const MAX_BUFFER = 10 * 1024 * 1024;
const CLI_TIMEOUT_MS = 3 * 60 * 1000;

export async function runManagerAgent(
  session: ReviewSession,
  clusters: FindingCluster[],
  allFindings: Finding[],
  findingOwners: Map<string, string>,
  onEvent: (event: ReviewEvent) => Promise<void>,
  agentResponses?: string,
  signal?: AbortSignal,
): Promise<string> {
  const hasFindings = allFindings.length > 0;
  const findingsText = hasFindings
    ? formatFindings(clusters, allFindings, findingOwners, session.reviewers.length)
    : '';
  const reviewerList = session.reviewers
    .map((r) => `- ${r.role}: ${r.provider} (model: ${r.model})`)
    .join('\n');
  const teamContext = `You are a manager consolidating responses from ${session.reviewers.length} DIFFERENT AI agents. Each agent is a separate model from a different provider. Their answers are their own — do NOT override or "correct" what they said about themselves.\n\nAgents in this session:\n${reviewerList}\n\n`;
  const taskContext = session.customPrompt
    ? `The user asked: "${session.customPrompt}"\n\n`
    : '';
  const responsesText = agentResponses
    ? `Agent responses:\n${agentResponses}\n\n`
    : '';

  await onEvent({
    type: 'agent.status',
    agentId: 'manager',
    at: new Date().toISOString(),
    state: 'drafting',
    label: 'Synthesising',
  });

  const summaryText = await runViaCli(session, teamContext + (findingsText || responsesText), taskContext, hasFindings, signal);

  await onEvent({
    type: 'agent.status',
    agentId: 'manager',
    at: new Date().toISOString(),
    state: 'done',
    label: 'Summary complete',
  });

  return summaryText;
}

async function runViaCli(session: ReviewSession, findingsText: string, taskContext: string, hasFindings: boolean, signal?: AbortSignal): Promise<string> {
  const systemPrompt = 'You are in READ-ONLY mode. Do NOT write or modify files.\n\n' + buildManagerSystemPrompt(hasFindings, session.customPrompt);
  const prompt = [
    systemPrompt,
    '',
    taskContext,
    findingsText,
    '',
    hasFindings
      ? 'Consolidate all agent findings and produce a final summary.'
      : 'Combine all agent responses and directly answer the original question.',
  ].join('\n');

  const provider = session.manager.provider;
  const model = session.manager.model;
  let executable: string;
  let cliArgs: string[];

  if (provider === 'codex-cli') {
    executable = 'codex';
    cliArgs = ['exec', prompt, ...(model && model !== 'default' ? ['-m', model] : []), '--sandbox', 'read-only', '--json'];
  } else if (provider === 'gemini-cli') {
    executable = 'gemini';
    cliArgs = ['-p', prompt, '--output-format', 'json', '-m', model || 'gemini-2.5-flash', '--sandbox'];
  } else {
    executable = 'claude';
    cliArgs = ['-p', prompt, '--output-format', 'json', '--no-session-persistence', '--model', model || 'sonnet', '--allowedTools', ''];
  }

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(executable, cliArgs, {
      cwd: session.repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let collected = 0;

    if (signal) {
      signal.addEventListener('abort', () => proc.kill('SIGTERM'), { once: true });
    }

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('CLI manager timed out'));
    }, CLI_TIMEOUT_MS);

    proc.stdout.on('data', (chunk: Buffer) => {
      collected += chunk.length;
      if (collected > MAX_BUFFER) {
        proc.kill('SIGTERM');
        reject(new Error('CLI manager output exceeded buffer limit'));
        return;
      }
      stdout += chunk.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      const raw = stdout.trim();
      if (code !== 0 && !raw) {
        reject(new Error(`CLI manager exited with code ${code}`));
        return;
      }

      // Try JSON envelope (Claude/Gemini --output-format json)
      try {
        const envelope = JSON.parse(raw);
        if (envelope.is_error) {
          reject(new Error(`CLI manager error: ${String(envelope.result ?? envelope.response).slice(0, 500)}`));
          return;
        }
        // Claude uses "result", Gemini uses "response"
        const text = envelope.result ?? envelope.response;
        if (text != null) {
          resolve(typeof text === 'string' ? text : JSON.stringify(text));
          return;
        }
        if (typeof envelope === 'string') {
          resolve(envelope);
          return;
        }
      } catch { /* not a single JSON object */ }

      // Try JSONL: extract last assistant message (Codex --json)
      const lines = raw.split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const evt = JSON.parse(lines[i]);
          if (evt.result != null) {
            resolve(typeof evt.result === 'string' ? evt.result : JSON.stringify(evt.result));
            return;
          }
          if (evt.item?.text) {
            resolve(evt.item.text);
            return;
          }
          if (evt.message?.content && typeof evt.message.content === 'string') {
            resolve(evt.message.content);
            return;
          }
        } catch { /* skip */ }
      }

      // Fallback: use raw output as summary
      resolve(raw || 'No summary produced.');
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}


function formatFindings(
  clusters: FindingCluster[],
  allFindings: Finding[],
  findingOwners: Map<string, string>,
  reviewerCount: number,
): string {
  const findingMap = new Map(allFindings.map((f) => [f.id, f]));

  const clusterText = clusters
    .map((cluster) => {
      const items = cluster.findingIds
        .map((id) => findingMap.get(id))
        .filter(Boolean)
        .map((f) => {
          const reviewer = findingOwners.get(f!.id) ?? 'unknown';
          return `  - [${reviewer}] [${f!.severity}/${f!.confidence}] ${f!.title}\n    ${f!.summary}\n    Evidence: ${f!.evidence.map((e) => `${e.path ?? ''}:${e.line ?? ''}`).join(', ')}`;
        })
        .join('\n');
      return `### ${cluster.title}${cluster.isConsensus ? ' (consensus)' : ''}\n${items}`;
    })
    .join('\n\n');

  return [
    `${allFindings.length} findings from ${reviewerCount} reviewers, grouped into ${clusters.length} clusters:`,
    '',
    clusterText,
  ].join('\n');
}
