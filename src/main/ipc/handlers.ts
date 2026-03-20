import fs from 'fs/promises';
import { ipcMain, dialog } from 'electron';
import { IPC_CHANNELS } from './channels';
import { sessionManager } from '../review/session-manager';
import { eventLog } from '../storage/event-log';
import { findingsStore } from '../storage/findings';
import { loadConfig } from '../config';
import type { CreateSessionParams } from '../review/session-manager';

let handlersRegistered = false;

export function registerIpcHandlers(): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle(IPC_CHANNELS.SESSION_CREATE, async (_event, params: CreateSessionParams) => {
    const VALID_PROVIDERS = new Set(['claude-cli', 'codex-cli', 'gemini-cli']);
    const VALID_ROLES = new Set(['regression', 'architecture', 'security', 'test-gap', 'performance', 'custom']);

    const repoValidation = await sessionManager.validateRepo(params.repoPath);
    if (!repoValidation.valid) {
      throw new Error(`Invalid repository: ${repoValidation.error}`);
    }

    if (!Array.isArray(params.reviewers) || params.reviewers.length === 0) {
      throw new Error('At least one reviewer is required');
    }

    const UUID_RE = /^[a-zA-Z0-9_-]+$/;
    for (const r of params.reviewers) {
      if (!r.id || !UUID_RE.test(r.id)) {
        throw new Error(`Invalid reviewer ID: ${r.id}`);
      }
      if (!VALID_PROVIDERS.has(r.provider)) {
        throw new Error(`Invalid provider: ${r.provider}`);
      }
      if (!r.model || typeof r.model !== 'string') {
        throw new Error('Each reviewer must have a model');
      }
      if (!VALID_ROLES.has(r.role)) {
        throw new Error(`Invalid role: ${r.role}`);
      }
      if (r.skillFilePath) {
        const { assertWithinRepo } = await import('../security/path-guard');
        await assertWithinRepo(params.repoPath, r.skillFilePath);
      }
    }

    return sessionManager.create(params);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_GET, (_event, id: string) =>
    sessionManager.get(id),
  );

  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, () => sessionManager.list());

  ipcMain.handle(IPC_CHANNELS.SESSION_CLEAR_ALL, () => sessionManager.clearAll());

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_SUMMARY, (_event, id: string) =>
    sessionManager.getSummary(id),
  );

  ipcMain.handle(IPC_CHANNELS.REVIEW_START, (_event, sessionId: string) => {
    sessionManager.start(sessionId).catch((err) => {
      console.error(`Review session ${sessionId} failed:`, err);
    });
    return { started: true };
  });

  ipcMain.handle(IPC_CHANNELS.REVIEW_STOP, (_event, sessionId: string) =>
    sessionManager.stop(sessionId),
  );

  ipcMain.handle(
    IPC_CHANNELS.REVIEW_FOLLOWUP,
    (_event, sessionId: string, prompt: string, reviewerIds: string[]) => {
      sessionManager.followUp(sessionId, prompt, reviewerIds).catch((err) => {
        console.error(`Follow-up for session ${sessionId} failed:`, err);
      });
      return { started: true };
    },
  );

  ipcMain.handle(IPC_CHANNELS.REVIEW_GENERATE_PR_DESC, async (_event, sessionId: string) => {
    return sessionManager.generatePrDesc(sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.EVENTS_GET, (_event, sessionId: string) =>
    eventLog.read(sessionId),
  );

  ipcMain.handle(IPC_CHANNELS.FINDINGS_GET, (_event, sessionId: string) =>
    findingsStore.read(sessionId),
  );

  ipcMain.handle(IPC_CHANNELS.FS_PICK_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.FS_VALIDATE_REPO, (_event, repoPath: string) =>
    sessionManager.validateRepo(repoPath),
  );

  ipcMain.handle(IPC_CHANNELS.FS_GET_GIT_REFS, (_event, repoPath: string) =>
    sessionManager.getGitRefs(repoPath),
  );

  ipcMain.handle(
    IPC_CHANNELS.PERMISSION_RESPOND,
    (_event, requestId: string, approved: boolean) =>
      sessionManager.resolvePermission(requestId, approved),
  );

  ipcMain.handle(IPC_CHANNELS.EXPORT_MARKDOWN, async (_event, sessionId: string) => {
    const summary = await sessionManager.getSummary(sessionId);
    if (!summary) return { success: false, error: 'No summary available' };

    const result = await dialog.showSaveDialog({
      title: 'Export Markdown',
      defaultPath: `review-summary-${sessionId.slice(0, 8)}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };

    await fs.writeFile(result.filePath, summary, 'utf-8');
    return { success: true, filePath: result.filePath };
  });

  ipcMain.handle(IPC_CHANNELS.EXPORT_JSON, async (_event, sessionId: string) => {
    const findings = await findingsStore.read(sessionId);

    const result = await dialog.showSaveDialog({
      title: 'Export JSON',
      defaultPath: `review-findings-${sessionId.slice(0, 8)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };

    await fs.writeFile(result.filePath, JSON.stringify(findings, null, 2), 'utf-8');
    return { success: true, filePath: result.filePath };
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, () => loadConfig());
}
