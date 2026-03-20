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
  getTimeoutMs,
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
    let seconds = 0;

    const heartbeat = setInterval(() => {
      seconds += 15;
      void onEvent({ type: 'agent.note', agentId: reviewer.id, at: now(), note: `Codex working… (${seconds}s)` });
    }, 15_000);

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Codex timed out'));
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
          processCodexEvent(evt, reviewer.id, onEvent);
          const item = evt.item as { type?: string; text?: string } | undefined;
          if (evt.type === 'item.completed' && item?.type === 'agent_message' && item.text) {
            lastAssistantText = item.text;
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
      clearInterval(heartbeat);
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
  const type = String(evt.type ?? '');
  if (!type) return;

  const item = evt.item as { type?: string; text?: string; command?: string; status?: string } | undefined;

  if (type === 'item.completed' && item?.type === 'agent_message' && item.text) {
    const short = item.text.replace(/\s+/g, ' ').trim().slice(0, 150);
    if (short && !short.startsWith('{')) {
      void onEvent({ type: 'agent.note', agentId, at: now(), note: short });
    }
  }

  if ((type === 'item.started' || type === 'item.completed') && item?.type === 'command_execution' && item.command) {
    const cmd = item.command.replace(/^\/bin\/bash -lc "/, '').replace(/"$/, '').slice(0, 100);
    const state = cmd.includes('grep') || cmd.includes('find') || cmd.includes('rg') ? 'searching' : 'reading';
    void onEvent({
      type: 'agent.status',
      agentId,
      at: now(),
      state: state as 'searching' | 'reading',
      label: `$ ${cmd}`,
    });
  }
}
