import type {
  ReviewSession,
  ReviewEvent,
  Finding,
  ReviewTarget,
  ReviewerConfig,
  ManagerConfig,
} from '../shared/types';

export type CreateSessionParams = {
  repoPath: string;
  reviewTarget: ReviewTarget;
  reviewers: ReviewerConfig[];
  manager: ManagerConfig;
  customPrompt?: string;
  timeoutMinutes?: number;
};

export type ExportResult = { success: boolean; filePath?: string; error?: string };

export type AppApi = {
  session: {
    create(params: CreateSessionParams): Promise<ReviewSession>;
    get(id: string): Promise<ReviewSession | null>;
    list(): Promise<ReviewSession[]>;
    getSummary(id: string): Promise<string | null>;
    clearAll(): Promise<void>;
  };
  review: {
    start(sessionId: string): Promise<{ started: boolean }>;
    stop(sessionId: string): Promise<void>;
    followUp(sessionId: string, prompt: string, reviewerIds: string[]): Promise<{ started: boolean }>;
    generatePrDesc(sessionId: string): Promise<string>;
  };
  events: {
    get(sessionId: string): Promise<ReviewEvent[]>;
  };
  findings: {
    get(sessionId: string): Promise<Finding[]>;
  };
  fs: {
    pickDirectory(): Promise<string | null>;
    validateRepo(repoPath: string): Promise<{ valid: boolean; error?: string }>;
    getGitRefs(repoPath: string): Promise<string[]>;
    listSkills(dirPath: string): Promise<Array<{ name: string; path: string; content: string }>>;
  };
  export: {
    markdown(sessionId: string): Promise<ExportResult>;
    json(sessionId: string): Promise<ExportResult>;
  };
  chat: {
    send(sessionId: string, message: string): Promise<string>;
    getHistory(sessionId: string): Promise<Array<{ role: string; content: string; at: string }>>;
  };
  config: {
    get(): Promise<{
      providers: Array<{
        id: string;
        name: string;
        cli: string;
        models: Array<{ id: string; label: string }>;
      }>;
      skills: Array<{ name: string; path: string; content: string }>;
    }>;
  };
};
