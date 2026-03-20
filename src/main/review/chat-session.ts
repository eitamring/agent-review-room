import { spawn } from 'child_process';
import type { LLMProvider } from '../../shared/types';

export type ChatHistoryEntry = { role: string; content: string };

export interface IChatSession {
  start(systemPrompt: string, firstMessage: string): Promise<string>;
  continue(message: string, history?: ChatHistoryEntry[]): Promise<string>;
}

function buildContextPrompt(systemPrompt: string, history: ChatHistoryEntry[], newMessage: string): string {
  const last5 = history.slice(-10);
  const convo = last5.map((m) => `${m.role === 'user' ? 'User' : 'Manager'}: ${m.content}`).join('\n');
  return [
    'IMPORTANT: You are in READ-ONLY mode. Do NOT write or modify files.',
    '',
    systemPrompt,
    '',
    convo ? `Recent conversation:\n${convo}\n` : '',
    `User: ${newMessage}`,
    '',
    'Respond to the user\'s latest message.',
  ].filter(Boolean).join('\n');
}

function runCli(executable: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(executable, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    const timeout = setTimeout(() => { proc.kill('SIGTERM'); reject(new Error('Chat timed out')); }, 3 * 60 * 1000);

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.on('close', (code) => {
      clearTimeout(timeout);
      const raw = stdout.trim();
      if (code !== 0 && !raw) { reject(new Error(`CLI exited with code ${code}`)); return; }

      try {
        const envelope = JSON.parse(raw);
        if (envelope.is_error) { reject(new Error(String(envelope.result ?? envelope.response).slice(0, 500))); return; }
        const text = envelope.result ?? envelope.response;
        if (text != null) { resolve(typeof text === 'string' ? text : JSON.stringify(text)); return; }
        if (envelope.session_id) resolve(JSON.stringify(envelope));
        else if (typeof envelope === 'string') { resolve(envelope); return; }
      } catch { /* not single JSON */ }

      const lines = raw.split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const e = JSON.parse(lines[i]);
          if (e.result != null) { resolve(String(e.result)); return; }
          if (e.item?.text) { resolve(e.item.text); return; }
          if (e.message?.content && typeof e.message.content === 'string') { resolve(e.message.content); return; }
        } catch { /* skip */ }
      }
      resolve(raw || 'No response.');
    });
    proc.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

class ClaudeChatSession implements IChatSession {
  private sessionId?: string;
  constructor(private model: string, private cwd: string) {}

  async start(systemPrompt: string, firstMessage: string): Promise<string> {
    const prompt = `IMPORTANT: You are in READ-ONLY mode. Do NOT write or modify files.\n\n${systemPrompt}\n\n${firstMessage}`;
    const raw = await runCli('claude', [
      '-p', '--output-format', 'json', '--model', this.model || 'sonnet', '--', prompt,
    ], this.cwd);
    try { this.sessionId = JSON.parse(raw).session_id; } catch { /* extract from response */ }
    if (!this.sessionId) {
      const result = await runCli('claude', [
        '-p', '--output-format', 'json', '--model', this.model || 'sonnet', '--', prompt,
      ], this.cwd);
      try { this.sessionId = JSON.parse(result).session_id; } catch { /* no session */ }
      return this.parseResponse(result);
    }
    return this.parseResponse(raw);
  }

  async continue(message: string, _history?: ChatHistoryEntry[]): Promise<string> {
    if (this.sessionId) {
      const raw = await runCli('claude', [
        '-p', '--output-format', 'json', '--model', this.model || 'sonnet',
        '--resume', this.sessionId, '--', message,
      ], this.cwd);
      return this.parseResponse(raw);
    }
    return runCli('claude', [
      '-p', '--output-format', 'json', '--model', this.model || 'sonnet', '--no-session-persistence', '--', message,
    ], this.cwd);
  }

  private parseResponse(raw: string): string {
    try {
      const envelope = JSON.parse(raw);
      this.sessionId = envelope.session_id ?? this.sessionId;
      return typeof envelope.result === 'string' ? envelope.result : raw;
    } catch { return raw; }
  }
}

class CodexChatSession implements IChatSession {
  private systemPrompt = '';
  constructor(private model: string, private cwd: string) {}

  async start(systemPrompt: string, firstMessage: string): Promise<string> {
    this.systemPrompt = systemPrompt;
    const prompt = `IMPORTANT: You are in READ-ONLY mode. Do NOT write or modify files.\n\n${systemPrompt}\n\n${firstMessage}`;
    const args = ['exec', ...(this.model && this.model !== 'default' ? ['-m', this.model] : []), '--json', '--', prompt];
    const raw = await runCli('codex', args, this.cwd);
    return this.parseResponse(raw);
  }

  async continue(message: string, history?: ChatHistoryEntry[]): Promise<string> {
    const context = buildContextPrompt(this.systemPrompt, history ?? [], message);
    const args = ['exec', ...(this.model && this.model !== 'default' ? ['-m', this.model] : []), '--json', '--', context];
    const raw = await runCli('codex', args, this.cwd);
    return this.parseResponse(raw);
  }

  private parseResponse(raw: string): string {
    const lines = raw.split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const e = JSON.parse(lines[i]);
        if (e.item?.text) return e.item.text;
        if (e.result != null) return String(e.result);
      } catch { /* skip */ }
    }
    return raw;
  }
}

class GeminiChatSession implements IChatSession {
  private systemPrompt = '';
  constructor(private model: string, private cwd: string) {}

  async start(systemPrompt: string, firstMessage: string): Promise<string> {
    this.systemPrompt = systemPrompt;
    const prompt = `IMPORTANT: You are in READ-ONLY mode. Do NOT write or modify files.\n\n${systemPrompt}\n\n${firstMessage}`;
    const raw = await runCli('gemini', [
      '-p', prompt, '--output-format', 'json', '-m', this.model || 'gemini-2.5-flash',
    ], this.cwd);
    return this.parseResponse(raw);
  }

  async continue(message: string, history?: ChatHistoryEntry[]): Promise<string> {
    const context = buildContextPrompt(this.systemPrompt, history ?? [], message);
    const raw = await runCli('gemini', [
      '-p', context, '--output-format', 'json', '-m', this.model || 'gemini-2.5-flash',
    ], this.cwd);
    return this.parseResponse(raw);
  }

  private parseResponse(raw: string): string {
    try {
      const envelope = JSON.parse(raw);
      return envelope.result ?? envelope.response ?? raw;
    } catch { return raw; }
  }
}

const activeSessions = new Map<string, IChatSession>();

export function createChatSession(provider: LLMProvider, model: string, cwd: string): IChatSession {
  switch (provider) {
    case 'claude-cli': return new ClaudeChatSession(model, cwd);
    case 'codex-cli': return new CodexChatSession(model, cwd);
    case 'gemini-cli': return new GeminiChatSession(model, cwd);
    default: throw new Error(`Unknown chat provider: ${provider}`);
  }
}

export function getOrCreateChatSession(
  sessionId: string,
  provider: LLMProvider,
  model: string,
  cwd: string,
): IChatSession {
  const key = sessionId;
  let session = activeSessions.get(key);
  if (!session) {
    session = createChatSession(provider, model, cwd);
    activeSessions.set(key, session);
  }
  return session;
}

export function clearChatSession(sessionId: string): void {
  activeSessions.delete(sessionId);
}

export function clearAllChatSessions(): void {
  activeSessions.clear();
}
