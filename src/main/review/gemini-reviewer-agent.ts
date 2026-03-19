import { spawn } from 'child_process';
import type {
  ReviewSession,
  ReviewerConfig,
  ReviewEvent,
  Finding,
} from '../../shared/types';
import {
  getTimeoutMs,
  now,
  buildPrompt,
  extractFindings,
  processStreamEvent,
  emitFindingsAndDone,
} from './cli-shared';

export async function runGeminiReviewerAgent(
  session: ReviewSession,
  reviewer: ReviewerConfig,
  onEvent: (event: ReviewEvent) => Promise<void>,
  signal?: AbortSignal,
): Promise<Finding[]> {
  await onEvent({
    type: 'agent.status',
    agentId: reviewer.id,
    at: now(),
    state: 'planning',
    label: 'Starting Gemini review',
  });

  const prompt = await buildPrompt(session, reviewer);
  const model = reviewer.model || 'gemini-2.5-flash';

  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '-m', model,
    '--sandbox',
  ];

  await onEvent({
    type: 'agent.status',
    agentId: reviewer.id,
    at: now(),
    state: 'reading',
    label: `gemini ${model} analyzing…`,
  });

  return new Promise<Finding[]>((resolve, reject) => {
    const proc = spawn('gemini', args, {
      cwd: session.repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const findings: Finding[] = [];
    let buffer = '';
    let resultText = '';
    let allAssistantText = '';
    let seconds = 0;

    const heartbeat = setInterval(() => {
      seconds += 15;
      void onEvent({ type: 'agent.note', agentId: reviewer.id, at: now(), note: `Gemini working… (${seconds}s)` });
    }, 15_000);

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Gemini timed out'));
    }, getTimeoutMs(session));

    if (signal) {
      signal.addEventListener('abort', () => proc.kill('SIGTERM'), { once: true });
    }

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          processStreamEvent(evt, reviewer.id, onEvent);
          if (evt.type === 'result') {
            resultText = typeof evt.result === 'string' ? evt.result : JSON.stringify(evt.result);
          }
          if ((evt.type === 'assistant' || evt.type === 'message') && evt.message) {
            const c = (evt.message as { content?: string }).content;
            if (typeof c === 'string') allAssistantText += c + '\n';
          }
        } catch { /* partial line */ }
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text && !text.startsWith('Warning:')) {
        void onEvent({ type: 'agent.note', agentId: reviewer.id, at: now(), note: text.slice(0, 200) });
      }
    });

    proc.on('close', (code) => {
      clearInterval(heartbeat);
      clearTimeout(timeout);

      if (buffer.trim()) {
        try {
          const evt = JSON.parse(buffer);
          if (evt.type === 'result') {
            resultText = typeof evt.result === 'string' ? evt.result : JSON.stringify(evt.result);
          }
        } catch { /* ignore */ }
      }

      const textToParse = resultText || allAssistantText;

      if (code !== 0 && !textToParse.trim()) {
        reject(new Error(`Gemini exited with code ${code}`));
        return;
      }

      const extracted = extractFindings(textToParse, 'Gemini text output');
      emitFindingsAndDone(extracted, findings, reviewer.id, onEvent);
      resolve(findings);
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
