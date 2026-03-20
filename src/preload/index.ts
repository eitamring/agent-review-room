import { contextBridge, ipcRenderer } from 'electron';
import type { AppApi, PermissionRequest } from './api';

// Channel constants are inlined here to avoid cross-directory require()
// which can fail under Electron's sandbox mode.
const CH = {
  SESSION_CREATE: 'session:create',
  SESSION_GET: 'session:get',
  SESSION_LIST: 'session:list',
  SESSION_GET_SUMMARY: 'session:get-summary',
  REVIEW_START: 'review:start',
  REVIEW_STOP: 'review:stop',
  REVIEW_FOLLOWUP: 'review:followup',
  REVIEW_GENERATE_PR_DESC: 'review:generate-pr-desc',
  EVENTS_GET: 'events:get',
  FINDINGS_GET: 'findings:get',
  FS_PICK_DIRECTORY: 'fs:pick-directory',
  FS_VALIDATE_REPO: 'fs:validate-repo',
  FS_GET_GIT_REFS: 'fs:get-git-refs',
  PERMISSION_REQUEST: 'permission:request',
  PERMISSION_RESPOND: 'permission:respond',
  SESSION_CLEAR_ALL: 'session:clear-all',
  FS_LIST_SKILLS: 'fs:list-skills',
  EXPORT_MARKDOWN: 'export:markdown',
  EXPORT_JSON: 'export:json',
  CONFIG_GET: 'config:get',
  CHAT_SEND: 'chat:send',
  CHAT_GET: 'chat:get',
} as const;

const api: AppApi = {
  session: {
    create: (params) => ipcRenderer.invoke(CH.SESSION_CREATE, params),
    get: (id) => ipcRenderer.invoke(CH.SESSION_GET, id),
    list: () => ipcRenderer.invoke(CH.SESSION_LIST),
    getSummary: (id) => ipcRenderer.invoke(CH.SESSION_GET_SUMMARY, id),
    clearAll: () => ipcRenderer.invoke(CH.SESSION_CLEAR_ALL),
  },

  review: {
    start: (sessionId) => ipcRenderer.invoke(CH.REVIEW_START, sessionId),
    stop: (sessionId) => ipcRenderer.invoke(CH.REVIEW_STOP, sessionId),
    followUp: (sessionId, prompt, reviewerIds) =>
      ipcRenderer.invoke(CH.REVIEW_FOLLOWUP, sessionId, prompt, reviewerIds),
    generatePrDesc: (sessionId) =>
      ipcRenderer.invoke(CH.REVIEW_GENERATE_PR_DESC, sessionId),
  },

  events: {
    get: (sessionId) => ipcRenderer.invoke(CH.EVENTS_GET, sessionId),
  },

  findings: {
    get: (sessionId) => ipcRenderer.invoke(CH.FINDINGS_GET, sessionId),
  },

  fs: {
    pickDirectory: () => ipcRenderer.invoke(CH.FS_PICK_DIRECTORY),
    validateRepo: (repoPath) => ipcRenderer.invoke(CH.FS_VALIDATE_REPO, repoPath),
    getGitRefs: (repoPath) => ipcRenderer.invoke(CH.FS_GET_GIT_REFS, repoPath),
    listSkills: (dirPath) => ipcRenderer.invoke(CH.FS_LIST_SKILLS, dirPath),
  },

  permissions: {
    respond: (requestId, approved) =>
      ipcRenderer.invoke(CH.PERMISSION_RESPOND, requestId, approved),
    onRequest: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, req: PermissionRequest) =>
        handler(req);
      ipcRenderer.on(CH.PERMISSION_REQUEST, listener);
      return () => ipcRenderer.removeListener(CH.PERMISSION_REQUEST, listener);
    },
  },

  export: {
    markdown: (sessionId) => ipcRenderer.invoke(CH.EXPORT_MARKDOWN, sessionId),
    json: (sessionId) => ipcRenderer.invoke(CH.EXPORT_JSON, sessionId),
  },

  chat: {
    send: (sessionId, message) => ipcRenderer.invoke(CH.CHAT_SEND, sessionId, message),
    getHistory: (sessionId) => ipcRenderer.invoke(CH.CHAT_GET, sessionId),
  },

  config: {
    get: () => ipcRenderer.invoke(CH.CONFIG_GET),
  },
};

contextBridge.exposeInMainWorld('api', api);
