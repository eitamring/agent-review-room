import fs from 'fs/promises';
import os from 'os';
import { ipcMain, dialog, app } from 'electron';
import { IPC_CHANNELS } from './channels';
import { sessionManager } from '../review/session-manager';
import { eventLog } from '../storage/event-log';
import { findingsStore } from '../storage/findings';
import { loadConfig, reloadConfig } from '../config';
import { assertWithinDirectory } from '../security/path-guard';
import type { CreateSessionParams } from '../review/session-manager';

export function sanitizePromptInput(s: string): string {
  return s
    .replace(/\x00/g, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

let handlersRegistered = false;

export function registerIpcHandlers(): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle(IPC_CHANNELS.SESSION_CREATE, async (_event, params: CreateSessionParams) => {
    const config = await loadConfig();
    const VALID_PROVIDERS = new Set(config.providers.map((p) => p.id));
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
      if (r.skillFilePath && typeof r.skillFilePath !== 'string') {
        throw new Error('skillFilePath must be a string');
      }
      if (r.skillFilePath) {
        if (!r.skillFilePath.endsWith('.md')) {
          throw new Error(`skillFilePath must be a .md file: ${r.skillFilePath}`);
        }
        const allowedRoots = [process.cwd(), os.homedir(), app.getPath('userData')];
        let withinAllowed = false;
        for (const root of allowedRoots) {
          try {
            await assertWithinDirectory(root, r.skillFilePath);
            withinAllowed = true;
            break;
          } catch { /* not within this root */ }
        }
        if (!withinAllowed) {
          throw new Error(`skillFilePath must be within the app, home, or userData directory: ${r.skillFilePath}`);
        }
        try {
          const stat = await fs.stat(r.skillFilePath);
          if (stat.size > 50 * 1024) {
            throw new Error(`skillFilePath exceeds 50KB: ${r.skillFilePath}`);
          }
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`skillFilePath does not exist: ${r.skillFilePath}`);
          }
          throw err;
        }
      }
      if (r.role === 'custom') {
        if (r.customRoleTitle) {
          r.customRoleTitle = sanitizePromptInput(r.customRoleTitle);
          if (r.customRoleTitle.length > 100) {
            throw new Error('customRoleTitle must be 100 characters or fewer');
          }
        }
        if (r.customRoleDesc) {
          r.customRoleDesc = sanitizePromptInput(r.customRoleDesc);
          if (r.customRoleDesc.length > 5000) {
            throw new Error('customRoleDesc must be 5000 characters or fewer');
          }
        }
      }
    }

    if (params.customPrompt) {
      params.customPrompt = sanitizePromptInput(params.customPrompt);
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

  ipcMain.handle(IPC_CHANNELS.FS_LIST_SKILLS, async (_event, dirPath: string) => {
    const fsP = await import('fs/promises');
    const pathM = await import('path');
    const os = await import('os');

    const normalized = pathM.resolve(dirPath);
    let resolved: string;
    try {
      resolved = await fsP.realpath(normalized);
    } catch {
      return [];
    }
    const homeDir = os.homedir();
    const appData = (await import('electron')).app.getPath('userData');
    const withinDir = (dir: string, allowed: string) =>
      dir === allowed || dir.startsWith(allowed + pathM.sep);
    if (!withinDir(resolved, homeDir) && !withinDir(resolved, appData)) return [];

    try {
      const entries = await fsP.readdir(resolved, { withFileTypes: true });
      const skills: Array<{ name: string; path: string; content: string }> = [];
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const fullPath = pathM.join(resolved, entry.name);
          const content = await fsP.readFile(fullPath, 'utf-8');
          skills.push({
            name: entry.name.replace(/\.md$/, ''),
            path: fullPath,
            content,
          });
        }
      }
      return skills;
    } catch {
      return [];
    }
  });

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

  ipcMain.handle(IPC_CHANNELS.CHAT_SEND, async (_event, sessionId: string, message: string) => {
    if (typeof sessionId !== 'string' || !/^[a-f0-9-]+$/.test(sessionId)) {
      throw new Error('Invalid sessionId');
    }
    if (typeof message !== 'string' || message.length === 0 || message.length > 10000) {
      throw new Error('Invalid message: must be 1-10000 characters');
    }
    return sessionManager.chatWithManager(sessionId, message);
  });

  ipcMain.handle(IPC_CHANNELS.CHAT_GET, async (_event, sessionId: string) => {
    return sessionManager.getChatHistory(sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, () => loadConfig());

  ipcMain.handle(IPC_CHANNELS.CONFIG_RELOAD, () => {
    reloadConfig();
    return loadConfig();
  });
}
