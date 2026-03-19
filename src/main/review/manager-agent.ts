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

  const summaryText = await runViaCli(session, teamContext + (findingsText || responsesText), taskContext, hasFindings);

  await onEvent({
    type: 'agent.status',
    agentId: 'manager',
    at: new Date().toISOString(),
    state: 'done',
    label: 'Summary complete',
  });

  return summaryText;
}

async function runViaCli(session: ReviewSession, findingsText: string, taskContext: string, hasFindings: boolean): Promise<string> {
  const systemPrompt = buildManagerSystemPrompt(hasFindings, session.customPrompt);
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
    cliArgs = ['exec', prompt, ...(model && model !== 'default' ? ['-m', model] : []), '--json'];
  } else if (provider === 'gemini-cli') {
    executable = 'gemini';
    cliArgs = ['-p', prompt, '--output-format', 'json', '-m', model || 'gemini-2.5-flash', '--sandbox'];
  } else {
    executable = 'claude';
    cliArgs = ['-p', prompt, '--output-format', 'json', '--no-session-persistence', '--model', model || 'sonnet'];
  }

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(executable, cliArgs, {
      cwd: session.repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let collected = 0;

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
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`CLI manager exited with code ${code}`));
        return;
      }
      try {
        const envelope = JSON.parse(stdout.trim()) as {
          type?: string;
          is_error?: boolean;
          result: unknown;
        };
        if (envelope.is_error) {
          reject(new Error(`CLI manager error: ${String(envelope.result).slice(0, 500)}`));
          return;
        }
        // result is the markdown summary text; it may be a string or (if the CLI
        // ever changes) an object — coerce to string safely.
        resolve(typeof envelope.result === 'string' ? envelope.result : JSON.stringify(envelope.result));
      } catch (err) {
        reject(new Error(`CLI manager parse error: ${(err as Error).message}`));
      }
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
