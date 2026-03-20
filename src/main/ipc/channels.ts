export const IPC_CHANNELS = {
  SESSION_CREATE: 'session:create',
  SESSION_GET: 'session:get',
  SESSION_LIST: 'session:list',
  SESSION_GET_SUMMARY: 'session:get-summary',
  SESSION_CLEAR_ALL: 'session:clear-all',

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

  EXPORT_MARKDOWN: 'export:markdown',
  EXPORT_JSON: 'export:json',

  CONFIG_GET: 'config:get',
  FS_LIST_SKILLS: 'fs:list-skills',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
