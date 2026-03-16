import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type {
  ReviewSession,
  ReviewerConfig,
  ReviewEvent,
  Finding,
} from '../../shared/types';
import {
  CLI_TIMEOUT_MS,
  now,
  buildPrompt,
  extractFindings,
  emitFindingsAndDone,
} from './cli-shared';

export async function runCodexReviewerAgent(
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
    label: 'Starting Codex review',
  });

  const prompt = await buildPrompt(session, reviewer);
  const model = reviewer.model || 'default';

  const safeId = crypto.randomUUID();
  const outputFile = path.join(os.tmpdir(), `arr-output-${safeId}.txt`);

  const args = [
    'exec',
    prompt,
    ...(model !== 'default' ? ['-m', model] : []),
    '--sandbox', 'read-only',
    '--json',
    '-o', outputFile,
  ];

  await onEvent({
    type: 'agent.status',
    agentId: reviewer.id,
    at: now(),
    state: 'reading',
    label: `codex ${model} analyzing…`,
  });

  return new Promise<Finding[]>((resolve, reject) => {
    const proc = spawn('codex', args, {
      cwd: session.repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const findings: Finding[] = [];
    let buffer = '';
    let lastAssistantText = '';

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Codex timed out'));
    }, CLI_TIMEOUT_MS);

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
          processCodexEvent(evt, reviewer.id, onEvent);
          if (evt.type === 'message' && evt.role === 'assistant' && typeof evt.content === 'string') {
            lastAssistantText = evt.content;
          }
        } catch { /* partial line */ }
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        void onEvent({ type: 'agent.note', agentId: reviewer.id, at: now(), note: text.slice(0, 200) });
      }
    });

    proc.on('close', async (code) => {
      clearTimeout(timeout);

      let outputText = '';
      try {
        outputText = await fs.readFile(outputFile, 'utf-8');
      } catch { /* file may not exist */ }

      if (!outputText.trim()) outputText = lastAssistantText;

      if (outputText.trim()) {
        const extracted = extractFindings(outputText, 'Codex text output');
        emitFindingsAndDone(extracted, findings, reviewer.id, onEvent);
      } else if (code !== 0) {
        reject(new Error(`Codex exited with code ${code}`));
        return;
      }

      fs.unlink(outputFile).catch(() => {});

      resolve(findings);
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function processCodexEvent(
  evt: Record<string, unknown>,
  agentId: string,
  onEvent: (event: ReviewEvent) => Promise<void>,
): void {
  const type = evt.type as string;

  if (type === 'message' && evt.role === 'assistant') {
    const content = evt.content as string | undefined;
    if (content) {
      const short = content.replace(/\s+/g, ' ').trim().slice(0, 150);
      if (short && !short.startsWith('{')) {
        void onEvent({ type: 'agent.note', agentId, at: now(), note: short });
      }
    }
  }

  if (type === 'function_call' || type === 'tool_call') {
    const name = (evt.name ?? evt.function ?? 'tool') as string;
    void onEvent({
      type: 'agent.status',
      agentId,
      at: now(),
      state: 'reading',
      label: name.slice(0, 80),
    });
  }

  if (type === 'exec' || type === 'shell') {
    const cmd = (evt.command ?? evt.cmd ?? '') as string;
    void onEvent({
      type: 'agent.status',
      agentId,
      at: now(),
      state: cmd.includes('grep') || cmd.includes('find') ? 'searching' : 'reading',
      label: cmd.slice(0, 80),
    });
  }
}
