import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import type {
  ReviewSession,
  ReviewerConfig,
  ManagerConfig,
  ReviewTarget,
  ReviewEvent,
  Finding,
} from '../../shared/types';
import { sessionsStore } from '../storage/sessions';
import { eventLog } from '../storage/event-log';
import { findingsStore } from '../storage/findings';
import { runReviewerAgent } from './reviewer-agent';
import { runCliReviewerAgent } from './cli-reviewer-agent';
import { runCodexReviewerAgent } from './codex-reviewer-agent';
import { runGeminiReviewerAgent } from './gemini-reviewer-agent';
import { runManagerAgent } from './manager-agent';
import { clusterFindings } from './clustering';

function pickRunner(provider: string) {
  switch (provider) {
    case 'claude-cli': return runCliReviewerAgent;
    case 'codex-cli': return runCodexReviewerAgent;
    case 'gemini-cli': return runGeminiReviewerAgent;
    default: return runReviewerAgent;
  }
}

export type CreateSessionParams = {
  repoPath: string;
  reviewTarget: ReviewTarget;
  reviewers: ReviewerConfig[];
  manager: ManagerConfig;
  customPrompt?: string;
  timeoutMinutes?: number;
};

const activeControllers = new Map<string, AbortController>();
const pendingPermissions = new Map<string, (approved: boolean) => void>();
const runningSessionIds = new Set<string>();

// ── Semaphore for concurrent reviewer control ────────────────────────────────

class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private max: number) {}

  acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (this.active < this.max) {
        this.active++;
        resolve();
      } else {
        this.queue.push(() => {
          this.active++;
          resolve();
        });
      }
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

// ── Session Manager ──────────────────────────────────────────────────────────

class SessionManager {
  async create(params: CreateSessionParams): Promise<ReviewSession> {
    const session: ReviewSession = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      repoPath: params.repoPath,
      reviewTarget: params.reviewTarget,
      reviewers: params.reviewers,
      manager: params.manager,
      timeoutMinutes: params.timeoutMinutes,
      status: 'queued',
      customPrompt: params.customPrompt,
    };
    await sessionsStore.write(session);
    return session;
  }

  async get(id: string): Promise<ReviewSession | null> {
    return sessionsStore.read(id);
  }

  async list(): Promise<ReviewSession[]> {
    return sessionsStore.list();
  }

  async start(sessionId: string): Promise<void> {
    if (runningSessionIds.has(sessionId)) {
      throw new Error(`Session already running: ${sessionId}`);
    }

    const session = await sessionsStore.read(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (!session.reviewers.length) throw new Error('No reviewers configured');

    runningSessionIds.add(sessionId);

    const controller = new AbortController();
    activeControllers.set(sessionId, controller);

    const onEvent = async (event: ReviewEvent) => {
      await eventLog.append(sessionId, event);
    };

    try {
      session.status = 'running';
      await sessionsStore.write(session);

      // Run reviewers concurrently with semaphore (default: up to 3 at once)
      const maxConcurrent = Math.min(session.reviewers.length, 3);
      const sem = new Semaphore(maxConcurrent);
      const allFindings: Finding[] = [];
      const findingOwners = new Map<string, string>();

      await Promise.all(
        session.reviewers.map(async (reviewer) => {
          await sem.acquire();
          try {
            const runAgent = pickRunner(reviewer.provider);
            const findings = await runAgent(
              session,
              reviewer,
              onEvent,
              controller.signal,
            );
            for (const f of findings) findingOwners.set(f.id, reviewer.role);
            allFindings.push(...findings);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await onEvent({
              type: 'agent.note',
              agentId: reviewer.id,
              at: new Date().toISOString(),
              note: `${reviewer.role} reviewer failed: ${msg}`,
            });
            await onEvent({
              type: 'agent.status',
              agentId: reviewer.id,
              at: new Date().toISOString(),
              state: 'done',
              label: 'failed',
            });
          } finally {
            sem.release();
          }
        }),
      );

      await findingsStore.write(sessionId, allFindings);

      // Meeting phase
      session.status = 'meeting';
      await sessionsStore.write(session);

      const clusters = clusterFindings(allFindings);
      for (const cluster of clusters) {
        await onEvent({
          type: 'meeting.clustered',
          at: new Date().toISOString(),
          clusterId: cluster.id,
          findingIds: cluster.findingIds,
          title: cluster.title,
        });
      }

      let agentResponses: string | undefined;
      if (allFindings.length === 0) {
        const allEvents = await eventLog.read(sessionId);
        const notes = allEvents
          .filter((e): e is Extract<ReviewEvent, { type: 'agent.note' }> => e.type === 'agent.note' && e.agentId !== 'system')
          .map((e) => {
            const reviewer = session.reviewers.find((r) => r.id === e.agentId);
            const label = reviewer ? `${reviewer.role} (${reviewer.provider})` : e.agentId;
            return `${label}: ${e.note}`;
          });
        if (notes.length > 0) agentResponses = notes.join('\n');
      }

      const summaryText = await runManagerAgent(session, clusters, allFindings, findingOwners, onEvent, agentResponses);

      const summaryPath = path.join(
        app.getPath('userData'),
        'sessions',
        sessionId,
        'summary.md',
      );
      await fs.writeFile(summaryPath, summaryText, 'utf-8');
      await onEvent({
        type: 'meeting.summary',
        at: new Date().toISOString(),
        summaryPath,
      });

      session.status = 'completed';
      await sessionsStore.write(session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await onEvent({
        type: 'agent.note',
        agentId: 'system',
        at: new Date().toISOString(),
        note: `Review failed: ${msg}`,
      });
      session.status = 'failed';
      await sessionsStore.write(session);
    } finally {
      activeControllers.delete(sessionId);
      runningSessionIds.delete(sessionId);
    }
  }

  async followUp(sessionId: string, prompt: string, reviewerIds: string[]): Promise<void> {
    if (runningSessionIds.has(sessionId)) {
      throw new Error(`Session already running: ${sessionId}`);
    }

    const session = await sessionsStore.read(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const selectedReviewers = session.reviewers.filter((r) => reviewerIds.includes(r.id));
    if (!selectedReviewers.length) throw new Error('No reviewers selected for follow-up');

    runningSessionIds.add(sessionId);

    const controller = new AbortController();
    activeControllers.set(sessionId, controller);

    const onEvent = async (event: ReviewEvent) => {
      await eventLog.append(sessionId, event);
    };

    try {
      session.status = 'running';
      await sessionsStore.write(session);

      const existingFindings = await findingsStore.read(sessionId);
      const existingTitles = existingFindings.map((f) => `- ${f.title}`).join('\n');

      const followUpContext = [
        'Previous review context:',
        existingTitles,
        '',
        `Follow-up task: ${prompt}`,
      ].join('\n');

      const maxConcurrent = Math.min(selectedReviewers.length, 3);
      const sem = new Semaphore(maxConcurrent);
      const newFindings: Finding[] = [];
      const findingOwners = new Map<string, string>();

      for (const f of existingFindings) findingOwners.set(f.id, '');

      await Promise.all(
        selectedReviewers.map(async (reviewer) => {
          await sem.acquire();
          try {
            const followUpSession: ReviewSession = {
              ...session,
              customPrompt: followUpContext,
            };
            const runAgent = pickRunner(reviewer.provider);
            const findings = await runAgent(
              followUpSession,
              reviewer,
              onEvent,
              controller.signal,
            );
            for (const f of findings) findingOwners.set(f.id, reviewer.role);
            newFindings.push(...findings);
          } finally {
            sem.release();
          }
        }),
      );

      const allFindings = [...existingFindings, ...newFindings];
      await findingsStore.write(sessionId, allFindings);

      session.status = 'meeting';
      await sessionsStore.write(session);

      const clusters = clusterFindings(allFindings);
      for (const cluster of clusters) {
        await onEvent({
          type: 'meeting.clustered',
          at: new Date().toISOString(),
          clusterId: cluster.id,
          findingIds: cluster.findingIds,
          title: cluster.title,
        });
      }

      for (const f of allFindings) {
        if (!findingOwners.get(f.id)) {
          const owner = session.reviewers.find((_r) =>
            existingFindings.some((ef) => ef.id === f.id),
          );
          if (owner) findingOwners.set(f.id, owner.role);
        }
      }

      const summaryText = await runManagerAgent(session, clusters, allFindings, findingOwners, onEvent);

      const summaryPath = path.join(
        app.getPath('userData'),
        'sessions',
        sessionId,
        'summary.md',
      );
      await fs.writeFile(summaryPath, summaryText, 'utf-8');
      await onEvent({
        type: 'meeting.summary',
        at: new Date().toISOString(),
        summaryPath,
      });

      session.status = 'completed';
      await sessionsStore.write(session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await onEvent({
        type: 'agent.note',
        agentId: 'system',
        at: new Date().toISOString(),
        note: `Follow-up failed: ${msg}`,
      });
      session.status = 'failed';
      await sessionsStore.write(session);
    } finally {
      activeControllers.delete(sessionId);
      runningSessionIds.delete(sessionId);
    }
  }

  async stop(sessionId: string): Promise<void> {
    const controller = activeControllers.get(sessionId);
    if (controller) {
      controller.abort();
      activeControllers.delete(sessionId);
    }

    for (const [id, resolve] of pendingPermissions) {
      resolve(false);
      pendingPermissions.delete(id);
    }

    runningSessionIds.delete(sessionId);

    const session = await sessionsStore.read(sessionId);
    if (session && session.status !== 'completed') {
      session.status = 'failed';
      await sessionsStore.write(session);
    }
  }

  async getSummary(sessionId: string): Promise<string | null> {
    try {
      const summaryPath = path.join(
        app.getPath('userData'),
        'sessions',
        sessionId,
        'summary.md',
      );
      return await fs.readFile(summaryPath, 'utf-8');
    } catch {
      return null;
    }
  }

  async clearAll(): Promise<void> {
    await sessionsStore.clearAll();
  }

  async validateRepo(repoPath: string): Promise<{ valid: boolean; error?: string }> {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execFile);
    try {
      await exec('git', ['rev-parse', '--git-dir'], { cwd: repoPath });
      return { valid: true };
    } catch {
      return { valid: false, error: 'Not a git repository' };
    }
  }

  async getGitRefs(repoPath: string): Promise<string[]> {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execFile);
    try {
      const { stdout } = await exec(
        'git',
        ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/tags'],
        { cwd: repoPath },
      );
      return stdout.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  async requestPermission(
    agentId: string,
    command: string,
    args: string[],
    notifyRenderer: (requestId: string, agentId: string, command: string, args: string[]) => void,
  ): Promise<boolean> {
    const requestId = crypto.randomUUID();
    return new Promise<boolean>((resolve) => {
      pendingPermissions.set(requestId, resolve);
      notifyRenderer(requestId, agentId, command, args);
    });
  }

  resolvePermission(requestId: string, approved: boolean): void {
    const resolve = pendingPermissions.get(requestId);
    if (resolve) {
      pendingPermissions.delete(requestId);
      resolve(approved);
    }
  }
}

export const sessionManager = new SessionManager();
