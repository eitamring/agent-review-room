// Core domain types shared between main process, preload, and renderer.
// All network-capable code uses LLMProvider to route through the gateway.

export type LLMProvider = 'claude-cli' | 'codex-cli' | 'gemini-cli';

export type ReviewerRole =
  | 'regression'
  | 'architecture'
  | 'security'
  | 'test-gap'
  | 'performance'
  | 'custom';

export type SessionStatus = 'queued' | 'running' | 'meeting' | 'completed' | 'failed';

export type AgentState =
  | 'planning'
  | 'reading'
  | 'searching'
  | 'comparing'
  | 'drafting'
  | 'blocked'
  | 'done';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Confidence = 'high' | 'medium' | 'low';

export type ReviewTarget =
  | { kind: 'working-tree' }
  | { kind: 'git-range'; baseRef: string; headRef: string }
  | { kind: 'patch-file'; patchPath: string };

export type ReviewerConfig = {
  id: string;
  provider: LLMProvider;
  model: string;
  role: ReviewerRole;
  colorToken: string;
  customRoleTitle?: string;
  customRoleDesc?: string;
  skillFilePath?: string;
};

export type ManagerConfig = {
  provider: LLMProvider;
  model: string;
  synthesisStyle: 'strict' | 'balanced' | 'aggressive';
};

export type ReviewSession = {
  id: string;
  createdAt: string;
  repoPath: string;
  reviewTarget: ReviewTarget;
  reviewers: ReviewerConfig[];
  manager: ManagerConfig;
  status: SessionStatus;
  customPrompt?: string;
};

export type Evidence = {
  kind: 'file' | 'diff' | 'command';
  path?: string;
  line?: number;
  excerpt?: string;
};

export type Finding = {
  id: string;
  severity: Severity;
  title: string;
  summary: string;
  confidence: Confidence;
  evidence: Evidence[];
  recommendation: string;
};

export type ReviewEvent =
  | {
      type: 'agent.status';
      agentId: string;
      at: string;
      state: AgentState;
      label: string;
    }
  | {
      type: 'agent.focus';
      agentId: string;
      at: string;
      filePaths: string[];
      diffRefs?: string[];
    }
  | {
      type: 'agent.note';
      agentId: string;
      at: string;
      note: string;
    }
  | {
      type: 'finding.draft';
      agentId: string;
      at: string;
      finding: Finding;
    }
  | {
      type: 'finding.final';
      agentId: string;
      at: string;
      finding: Finding;
    }
  | {
      type: 'meeting.clustered';
      at: string;
      clusterId: string;
      findingIds: string[];
      title: string;
    }
  | {
      type: 'meeting.summary';
      at: string;
      summaryPath: string;
    };
