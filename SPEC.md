# Agent Review Room Spec

## 1. Product Summary

Agent Review Room is a local-first desktop app for orchestrating multiple LLM reviewers against a local repository or diff, showing their live work as visible activity, and ending with a structured meeting summary.

The product is not a chat toy. It is a review control room.

Users should be able to:

- choose a local repo and a review target
- configure a panel of reviewers such as `2 Codex + 2 Claude + 1 Gemini`
- watch each reviewer inspect files, search code, draft findings, and change state live
- switch to a meeting-room view that merges duplicate findings and shows consensus vs disagreement
- get one final manager summary with evidence and clear next actions

Important constraint: the app makes no outbound network calls except direct calls to configured LLM provider APIs.

## 2. Core Product Position

The core value is not "show chain-of-thought". The core value is:

- visible reviewer activity
- transparent evidence
- disagreement handling
- one final synthesis

We should never depend on hidden chain-of-thought. The live UI must show structured work notes, not private reasoning.

## 3. Goals

- Build one small, understandable codebase.
- Keep everything local-first and repo-first.
- Support multi-provider reviewer composition.
- Stream live reviewer activity with low latency.
- Produce final review output that is evidence-based and easy to audit.
- Make the UI feel intentional, polished, keyboard-friendly, and fast on desktop.

## 4. Non-Goals

- No GitHub API integration in MVP.
- No browser extension.
- No cloud backend.
- No collaborative multi-user sync.
- No arbitrary web browsing by agents.
- No general-purpose autonomous coding assistant.
- No raw chain-of-thought capture or display.

## 5. Input Model

The app reviews local material only.

Supported inputs for MVP:

- local repository path
- base and head git refs from the local clone
- uncommitted working tree diff
- pasted patch file

This keeps the system aligned with the no-network rule. If the user wants to review a GitHub PR, they fetch it locally outside the app and point the app at the local refs.

## 6. UX Principles

### 6.1 Product Feel

Visual direction:

- editorial control room, not generic SaaS dashboard
- warm light theme by default
- pixel-art characters and rooms as supporting context, not the main information surface
- strong typography contrast
- restrained but meaningful animation

Suggested typography:

- `IBM Plex Sans` for UI text
- `IBM Plex Mono` for code, paths, and evidence

Suggested color direction:

- paper or stone background
- slate text
- signal colors for severity and activity
- avoid purple-heavy defaults

### 6.2 UI Best Practices

Use current UI best practices from the start:

- keyboard-first navigation for all major actions
- semantic landmarks and accessible names for all controls
- strong visible focus styles
- color is never the only signal for status or severity
- reduced-motion support from day one
- responsive layout without hiding critical information behind hover-only interactions
- progressive disclosure for details instead of dumping everything at once
- virtualize long activity feeds and large finding lists
- prefer optimistic local transitions and skeleton states over spinner-heavy UI
- preserve context when switching views; selected agent, selected finding, and selected file should stay stable where possible

### 6.3 UI Views

The app should have three main screens.

#### A. Setup Screen

- repo path picker
- review target selector: working tree, ref range, patch file
- reviewer composition builder
- manager model selector
- run button

#### B. Live Review Screen

Three-pane desktop layout:

- left: reviewer roster and filters
- center: office/workroom scene plus current activity layer
- right: detail inspector for selected reviewer, file, note, or finding

Persistent bottom timeline:

- live event stream
- run status
- token/cost counters if available

#### C. Meeting Room Screen

- merged findings list
- top agenda cards
- consensus and disagreement sections
- final summary pane
- export actions: markdown and json

### 6.4 Interaction Rules

- Every important action must be available by mouse and keyboard.
- No keyboard traps.
- No hover-only critical information.
- Motion should communicate transitions, not decorate empty space.
- The scene view must never hide the real data model; every animated state must have a text equivalent in the inspector.

## 7. Reviewer Model

There are two kinds of agents.

### 7.1 Reviewer Agents

Each reviewer has:

- provider
- model
- role
- scope
- visible work log
- findings

Recommended reviewer roles:

- regression reviewer
- architecture reviewer
- security reviewer
- test-gap reviewer
- performance reviewer

Do not default to five identical reviewers. Diversity of role is more useful than raw count.

### 7.2 Meeting Manager

The meeting manager does not redo the whole review. It:

- receives reviewer findings
- merges duplicates
- highlights consensus
- preserves disagreement
- produces final notes and next actions

## 8. What Gets Shown Live

The app shows visible work notes, not hidden reasoning.

Allowed live reviewer outputs:

- current state: planning, reading, searching, comparing, drafting, blocked, done
- current file or diff focus
- short work note
- evidence collected
- finding draft
- confidence level

Not allowed:

- hidden provider chain-of-thought
- raw internal scratchpad logs presented as authoritative truth
- ungrounded final claims without file or diff references

## 9. Review Loop Design

The agent system should be tool-mediated and step-based.

High-level flow:

1. Manager inspects repo metadata and diff summary.
2. Manager creates reviewer assignments.
3. Reviewers run in parallel.
4. Each reviewer loops through local tools and emits structured events.
5. Reviewers submit final findings.
6. The system clusters likely duplicates deterministically.
7. Meeting manager reviews clusters and produces final synthesis.

This structure is better than one giant prompt because it keeps activity observable and allows stronger tool control.

## 10. Local Tool Surface

Reviewers only get local tools.

Required tool set:

- `list_files`
- `search_text`
- `read_file`
- `read_diff`
- `read_git_metadata`
- `add_note`
- `add_finding`
- `complete_review`

Optional later tool:

- `run_allowed_command`

If `run_allowed_command` is added later, it must be repo-configured and allowlist-only. No arbitrary shell access by default.

## 11. Network Rule

Hard rule:

- no outbound network calls except direct LLM provider requests

Implications:

- no GitHub API
- no telemetry
- no analytics
- no remote asset loading
- no CDN fonts
- no update checker in MVP
- no third-party error reporting

Allowed:

- Claude CLI invocations (`claude -p`) for review and synthesis
- Codex CLI invocations (`codex exec`) for review and synthesis
- Gemini CLI invocations (`gemini -p`) for review and synthesis
- local filesystem access
- local git commands
- local IPC between app processes

Implementation rule:

- all outbound HTTP must go through a single provider gateway module
- no other module may import or call `fetch`, `http`, or `https` directly
- all three CLI providers bypass the gateway (each CLI manages its own network); any future direct API-key providers must use the gateway

## 11.1 Provider Status

Three CLI providers are fully implemented:

- **Claude CLI** (`claude -p`): Uses `--output-format stream-json`, `--allowedTools` with restricted git subcommands (diff, log, show, status, blame, ls-files).
- **Codex CLI** (`codex exec`): Uses `--sandbox read-only`, `--json`, output file (`-o`). Does not use `--output-schema`; findings are extracted from prompt-instructed JSON output.
- **Gemini CLI** (`gemini -p`): Uses `--output-format stream-json`, `--sandbox`, `--approval-mode yolo`.

No API keys are configured in the app. Each CLI manages its own authentication. Direct API-key providers (Anthropic, OpenAI, Google) are on the roadmap; the gateway adapter interface is in place.

## 12. Technical Direction

### 12.1 App Shape

Use one small desktop app repo, not a monorepo.

Recommended stack:

- Electron for local process control and IPC
- React 19 + TypeScript for UI
- Vite 7 for renderer build/dev flow
- plain CSS Modules + CSS variables for styling
- minimal headless primitives only where native HTML is insufficient

Why this shape:

- Electron makes local git access, local file access, and child process orchestration straightforward
- React 19 is current and well-suited to a live event-heavy UI
- Vite is the simplest modern build tool fit for a small React desktop renderer
- CSS Modules keep the styling system small and local without utility-class sprawl

### 12.2 React and Renderer Rules

Use current React patterns:

- prefer component-local state unless cross-screen sharing is truly needed
- use `startTransition` for screen and filter updates that should stay responsive
- use `useDeferredValue` for heavy list filtering or search
- use `useEffectEvent` for stream/event handlers inside effects when needed
- do not add `useMemo` and `useCallback` by default; only use them for measured problems or required referential stability
- enable React Compiler if the chosen template/tooling version supports it cleanly

### 12.3 Styling Rules

- Use CSS variables for all design tokens.
- Prefer native CSS and PostCSS nesting over Sass.
- Bundle fonts locally.
- Keep animation durations short and purposeful.
- Respect `prefers-reduced-motion`.
- Use container-aware layouts and avoid hardcoded full-screen assumptions.

### 12.4 Security Rules

Electron settings:

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- strict preload API
- restrictive CSP
- no remote content loading except direct provider calls from the main process

The renderer must never receive unrestricted filesystem or process access.

### 12.5 Persistence

Keep persistence simple and inspectable.

Use file-based session storage for MVP:

- `session.json` for metadata
- `events.jsonl` for append-only event log
- `findings.json` for normalized findings
- `summary.md` for final manager output

This is easier to debug than adding a database too early.

## 13. Data Model

### 13.1 Session

```ts
type ReviewSession = {
  id: string;
  createdAt: string;
  repoPath: string;
  reviewTarget:
    | { kind: "working-tree" }
    | { kind: "git-range"; baseRef: string; headRef: string }
    | { kind: "patch-file"; patchPath: string };
  reviewers: ReviewerConfig[];
  manager: ManagerConfig;
  status: "queued" | "running" | "meeting" | "completed" | "failed";
  customPrompt?: string;
};
```

### 13.2 Manager Config

```ts
type ManagerConfig = {
  provider: "claude-cli" | "codex-cli" | "gemini-cli";
  model: string;
  synthesisStyle: "strict" | "balanced" | "aggressive";
};
```

### 13.3 Reviewer Config

```ts
type ReviewerConfig = {
  id: string;
  provider: "claude-cli" | "codex-cli" | "gemini-cli";
  model: string;
  role:
    | "regression"
    | "architecture"
    | "security"
    | "test-gap"
    | "performance"
    | "custom";
  colorToken: string;
  customRoleTitle?: string;
  customRoleDesc?: string;
  skillFilePath?: string;
};
```

### 13.4 Event

```ts
type ReviewEvent =
  | {
      type: "agent.status";
      agentId: string;
      at: string;
      state:
        | "planning"
        | "reading"
        | "searching"
        | "comparing"
        | "drafting"
        | "blocked"
        | "done";
      label: string;
    }
  | {
      type: "agent.focus";
      agentId: string;
      at: string;
      filePaths: string[];
      diffRefs?: string[];
    }
  | {
      type: "agent.note";
      agentId: string;
      at: string;
      note: string;
    }
  | {
      type: "finding.draft";
      agentId: string;
      at: string;
      finding: Finding;
    }
  | {
      type: "finding.final";
      agentId: string;
      at: string;
      finding: Finding;
    }
  | {
      type: "meeting.clustered";
      at: string;
      clusterId: string;
      findingIds: string[];
      title: string;
    }
  | {
      type: "meeting.summary";
      at: string;
      summaryPath: string;
    };
```

### 13.5 Finding

```ts
type Finding = {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  evidence: Array<{
    kind: "file" | "diff" | "command";
    path?: string;
    line?: number;
    excerpt?: string;
  }>;
  recommendation: string;
};
```

## 14. Meeting Logic

The meeting room should not just concatenate findings.

Required behavior:

- merge obvious duplicates
- separate consensus from disagreement
- preserve minority findings when evidence is meaningful
- rank findings by severity and confidence
- produce a short final summary first, then detailed findings

Meeting output sections:

- top issues
- consensus findings
- disputed findings
- test gaps
- recommended next actions

## 15. UI Component Guidance

Build a small design system, not a component zoo.

Needed primitives:

- button
- input
- select
- segmented control
- tabs
- dialog
- tooltip
- badge
- panel
- split-pane
- code block
- timeline item

Rules:

- prefer native elements first
- only use headless primitives for hard accessibility cases such as dialog, menu, and tooltip
- no full third-party dashboard kit

## 16. Folder Structure

```text
agent-review-room/
  SPEC.md
  package.json
  tsconfig.json
  vite.config.ts
  electron-builder.yml
  .editorconfig
  .gitignore
  src/
    main/
      index.ts
      app.ts
      config.ts
      ipc/
        channels.ts
        handlers.ts
      providers/
        gateway.ts
        index.ts
        api-keys.ts
      review/
        session-manager.ts
        manager-agent.ts
        reviewer-agent.ts
        cli-reviewer-agent.ts
        codex-reviewer-agent.ts
        gemini-reviewer-agent.ts
        cli-shared.ts
        clustering.ts
        prompts.ts
      tools/
        list-files.ts
        search-text.ts
        read-file.ts
        read-diff.ts
        run-command.ts
        git-metadata.ts
      storage/
        sessions.ts
        event-log.ts
        findings.ts
      security/
        network-guard.ts
        path-guard.ts
        command-policy.ts
    preload/
      index.ts
      api.ts
    renderer/
      index.html
      main.tsx
      app/
        App.tsx
        routes.tsx
        state/
          app-store.ts
        layout/
          shell.tsx
          split-pane.tsx
        features/
          setup/
          live-review/
          meeting-room/
          findings/
          timeline/
          reviewers/
        components/
          button/
          input/
          tabs/
          dialog/
          badge/
          panel/
          code-block/
        styles/
          tokens.css
          globals.css
          themes.css
      assets/
        fonts/
        sprites/
        icons/
  tests/
    cli-shared.test.mjs
```

## 17. Repo Rules

- One repo only.
- No monorepo.
- No backend service.
- No database in MVP.
- No Storybook in MVP.
- No Tailwind in MVP.
- No Sass in MVP.
- No runtime dependency added without a clear need.
- Prefer small handwritten abstractions over framework layering.

## 18. Implementation Rules

- Every reviewer finding must include evidence.
- Every final report must preserve disagreement explicitly.
- Every network-capable module must be easy to audit.
- All agent-visible repo operations must be deterministic and replayable from session logs.
- All exported outputs must work offline after the review is complete.
- Session files must be human-readable.
- Assets must be bundled locally.

## 19. MVP Cut

MVP is successful if it can:

- review a local git range
- run 3 to 5 reviewers from mixed providers
- show live agent states and notes
- collect structured findings
- merge duplicates into a meeting view
- export a final markdown summary

Anything beyond that is second phase.

## 20. Recommended First Build Order

1. Setup screen and local repo target selection
2. Session storage and append-only event log
3. Provider gateway and one provider implementation
4. Reviewer event loop with local file tools
5. Live review screen
6. Meeting clustering and manager summary
7. Multi-provider support
8. Visual polish and room scene

## 21. Source-Grounded Best-Practice Notes

These choices align with current guidance:

- React now recommends modern app tooling rather than Create React App; Vite is an appropriate small-app fit.
- React 19 patterns such as `useEffectEvent`, `startTransition`, and `useDeferredValue` fit an event-heavy UI well.
- Native CSS is preferred over extra styling layers when possible.
- Keyboard accessibility and no keyboard traps are non-negotiable.
- Electron must use context isolation, sandboxing, and a restrictive renderer surface.

## 22. Agent Permission Requests

When an agent needs to run a privileged command — for example executing a CLI tool such as `claude -p "..."` or a configured shell command — it must pause and request user approval before proceeding.

### 22.1 Visual Signal: Pixel Character Raises Hand

The room scene contains a pixel-art character for each reviewer agent. When an agent is waiting for permission, its character visually raises its hand. This is the primary live signal that something requires attention.

- The raised-hand state is a distinct animation frame on the sprite.
- It replaces the current activity frame for the duration of the wait.
- A text badge on the character card also reads "Waiting for approval" to satisfy the no-hover-only rule.

### 22.2 Permission Request Flow

1. Agent determines it needs to execute a command that is not pre-approved.
2. Agent emits a `permission.request` event with the command and arguments.
3. Main process suspends the agent loop (Promise waits on user response).
4. Renderer receives the event, shows the approval dialog, and sets the character to the raised-hand state.
5. User sees: agent name, the exact command string, and the arguments — no obfuscation.
6. User approves or denies.
7. Renderer sends `permission:respond` IPC with the request ID and decision.
8. Main process resolves the suspended Promise and resumes or aborts the agent.

### 22.3 Command Execution Model

The command mechanism uses direct CLI invocation via `child_process.execFile` with the allowlist policy from `command-policy.ts`.

Examples of commands that go through the approval gate:

- `claude -p "<prompt>"` — run a Claude CLI sub-task
- `npm test` — run the repo test suite (if repo-configured)
- Any command not already in the read-only git allowlist

Commands must always be shown verbatim to the user. No summarizing or paraphrasing.

### 22.4 Data Model Addition

Add a `permission.request` event type to `ReviewEvent`:

```ts
| {
    type: 'permission.request';
    agentId: string;
    at: string;
    requestId: string;
    command: string;
    args: string[];
  }
| {
    type: 'permission.response';
    agentId: string;
    at: string;
    requestId: string;
    approved: boolean;
  }
```

Both events are appended to the session `events.jsonl` log for full auditability.

## 23. Bottom Line

Build a small local desktop review room:

- one repo
- one app
- local files only
- no network except LLM providers
- visible reviewer work
- strong meeting synthesis
- UI that feels like a review control room, not a generic dashboard

## 24. Inspiration

This project was inspired by the visual agent-activity concept in `pixel-agents` by Pablo Delucca:

- https://github.com/pablodelucca/pixel-agents

Agent Review Room is an original implementation with a different product goal and architecture, focused on multi-agent repository review, live reviewer observability, and meeting-style synthesis.

## 25. Asset Notes

Third-party asset provenance is tracked in `ASSETS.md` at the repo root.

Current assets:

- **Cute Platformer Robot** by Foozle (art by mayakhan95) — CC0 1.0, used for reviewer agent characters in the room scene. Source: https://foozlecc.itch.io/cute-platformer-robot
- whether attribution is required
- where the asset is used in this repo
