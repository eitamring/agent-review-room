# Agent Review Room -- User Guide

## 1. Getting Started

### Prerequisites

- **Node.js 20+**
- At least one AI CLI installed and authenticated:
  - [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) (`claude`)
  - [Codex CLI](https://github.com/openai/codex) (`codex`)
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli) (`gemini`)

### Installation

```bash
git clone <repo-url> 
cd agent-review-room
npm install
npm run dev
```

The app opens as a desktop window. No cloud backend, no account creation.

### Security Note

This app runs AI agents that can READ files on your machine. Each agent runs in a sandboxed/read-only mode.

- Claude CLI uses `--allowedTools` restricted to Read, Grep, Glob, and specific git subcommands (diff, log, show, status, blame, ls-files). Not `git:*`.
- Codex CLI uses `--sandbox read-only`.
- Gemini CLI uses `--sandbox` with `--approval-mode yolo`.
- All file access is restricted to the repository you select. Path traversal and symlink escapes are blocked via `fs.realpath`.
- Skill file paths are validated against the repo boundary before session creation.
- `read-diff` uses `--no-ext-diff --no-textconv` to prevent external tool execution.

---

## 2. Configuring Providers

### Supported Providers

| Provider | CLI Command | Authentication |
|----------|------------|----------------|
| **Claude** | `claude` | Claude subscription via Claude CLI. No API key needed. |
| **Codex** | `codex` | OpenAI authentication (`OPENAI_API_KEY` or `codex auth`). |
| **Gemini** | `gemini` | Google authentication (`gemini auth login` or Google Cloud credentials). |

### Default Models

| Provider | Models |
|----------|--------|
| Claude | Sonnet, Opus, Haiku |
| Codex | Default, o3-mini, o3, GPT-4.1, GPT-4.1 mini |
| Gemini | 2.5 Flash, 2.5 Pro, 2.0 Flash |

Codex uses "Default" as its first model option, which omits the `-m` flag and lets the CLI pick its default.

### Installing Each CLI

**Claude CLI:**
```bash
npm install -g @anthropic-ai/claude-code
claude auth login
```

**Codex CLI:**
```bash
npm install -g @openai/codex
# Authenticate via OPENAI_API_KEY or `codex auth`
```

**Gemini CLI:**
```bash
npm install -g @google/gemini-cli
# Authenticate via `gemini auth login` or Google Cloud credentials
```

You only need to install the CLIs you plan to use. The app works with just one provider.

### Config File System

The app loads configuration in this order:

1. **User config:** Electron `userData` path (e.g. `~/.config/agent-review-room/config.json`)
2. **Project config:** `config.json` in the app's working directory
3. **Built-in defaults** (if no config file is found)

### Config File Format

```json
{
  "providers": [
    {
      "id": "claude-cli",
      "name": "Claude",
      "cli": "claude",
      "models": [
        { "id": "sonnet", "label": "Sonnet" },
        { "id": "opus", "label": "Opus" },
        { "id": "haiku", "label": "Haiku" }
      ]
    },
    {
      "id": "codex-cli",
      "name": "Codex",
      "cli": "codex",
      "models": [
        { "id": "default", "label": "Default" },
        { "id": "o3-mini", "label": "o3-mini" },
        { "id": "o3", "label": "o3" },
        { "id": "gpt-4.1", "label": "GPT-4.1" },
        { "id": "gpt-4.1-mini", "label": "GPT-4.1 mini" }
      ]
    },
    {
      "id": "gemini-cli",
      "name": "Gemini",
      "cli": "gemini",
      "models": [
        { "id": "gemini-2.5-flash", "label": "2.5 Flash" },
        { "id": "gemini-2.5-pro", "label": "2.5 Pro" },
        { "id": "gemini-2.0-flash", "label": "2.0 Flash" }
      ]
    }
  ]
}
```

### Adding Custom Models

Add an entry to the `models` array for the relevant provider in your config file:

```json
{ "id": "my-custom-model-id", "label": "My Custom Model" }
```

You can also type a custom model ID directly in the Setup screen by selecting "custom" from the model dropdown.

---

## 3. Running a Review

### Setup Screen Walkthrough

The Setup screen has these sections:

1. **Recent Sessions** -- If previous sessions exist, they appear at the top. Click to resume. A **Clear all** button deletes all stored sessions.

2. **Repository** -- Type or browse to a local git repository path. The app validates it is a real git repo before starting.

3. **Review Target** -- Choose what to review:
   - **Working tree** -- Reviews uncommitted changes (`git diff` and `git diff --staged`).
   - **Git ref range** -- Reviews changes between two refs. Dropdowns are populated from local branches and tags.

4. **Review Instructions** -- Free-text prompt sent to all reviewers. Pre-filled with a default review prompt. A **PR format** checkbox appends instructions to format the manager summary as a PR review with issues, suggested fixes, and a verdict.

5. **Manager** -- Select provider and model for the manager agent. Config-driven dropdowns with custom model ID option.

6. **Agents** -- Configure 1 to 5 reviewer agents. Each has:
   - **Provider** -- Claude, Codex, or Gemini (config-driven dropdown)
   - **Agent** -- A dropdown listing all available agents loaded from skill files, plus a **+ custom** option for one-off agents
   - **Model** -- Config-driven dropdown with custom model ID option
   - When **+ custom** is selected, a text area appears where you describe what the agent should focus on
   - When a skill-file agent is selected, its source file name is shown below the row

### Choosing Providers and Models

Each reviewer is independent. You can mix providers within a single review:

- Reviewer 1: Claude / Sonnet / security
- Reviewer 2: Codex / Default / architecture
- Reviewer 3: Gemini / 2.5 Pro / regression

### Starting the Review

Press **Start Review** (or `Ctrl+Enter`). Requirements:
- Repository path set
- At least one reviewer with a model
- If using git-range, both base and head refs selected

The app launches all reviewer agents concurrently (up to 3 at a time) and transitions to the Live Review screen.

---

## 4. Understanding the Live Review

The Live Review screen has a three-pane layout:

### Left Pane: Reviewer Roster

Lists all configured reviewers with:
- A colored dot matching their role
- Current state and activity label
- Click a reviewer to see their detailed activity and findings

### Center Pane: Room Scene and Activity Feed

**Robot Characters** -- Each reviewer is represented by an animated pixel-art robot. Robots animate based on state (walking when active, still when done) and show speech bubbles with current activity.

**The "!" Alert** -- A red "!" bubble means the agent is blocked and needs permission. A dialog shows the exact command for you to approve or deny.

**Activity Feed** -- Real-time event log showing agent states: planning, reading, searching, comparing, drafting, blocked, done. Findings and errors are highlighted.

### Right Pane: Detail Inspector

- **Default:** All findings discovered so far
- **Reviewer view:** Individual activity log and findings
- **Finding view:** Full evidence with file paths, line numbers, and excerpts

### Footer

Shows event count while running, status during meeting phase, and a **Meeting Room** button when complete. **Stop Review** (or `Escape`) is available while running.

### Resilient Execution

If one reviewer fails, the others continue. Failed reviewers emit an error note and a "done/failed" status. The session still proceeds to the meeting phase with findings from successful reviewers.

---

## 5. Meeting Room

### Stats Bar

At the top, a statistics bar shows:
- Findings per reviewer (e.g. "security: 3 findings, architecture: 2 findings")
- Total and unique finding counts
- Severity breakdown (e.g. "1 critical, 2 high, 3 medium")

### Collapsible Room Scene

The robot room scene is collapsible via a **Hide Room / Show Room** toggle. This lets you focus on findings and the summary.

### Findings List

The left panel lists all findings sorted by severity (critical first). Each shows:
- **Severity badge** -- critical, high, medium, low
- **Confidence badge** -- high, medium, low
- **Owner badge** -- which reviewer role found it
- Title, summary, evidence (file paths, line numbers, excerpts), and recommendation

### Manager Summary

The right panel displays the manager's consolidated summary rendered as Markdown (headings, bold, italic, code, lists). If PR format was selected, it is structured as a PR review with issues, fixes, and verdict.

### Follow-Up Prompts

After a review completes, a follow-up section appears at the bottom:
1. Type a follow-up question (e.g. "Look deeper at the auth token handling")
2. Select which reviewers should handle it via checkboxes
3. Press **Send Follow Up**

The follow-up runs with context from the original review (existing finding titles). The manager produces a new summary that includes both original and follow-up findings.

### Export

- **Export Markdown** (`Ctrl+E`) -- Save the manager summary as a `.md` file
- **Export JSON** (`Ctrl+Shift+E`) -- Save all findings as structured JSON

---

## 6. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Switch to Setup screen |
| `2` | Switch to Live Review screen |
| `3` | Switch to Meeting Room screen |
| `Ctrl+N` | Start a new review (returns to Setup) |
| `Ctrl+Enter` | Start the review (when on Setup screen) |
| `Escape` | Stop a running review (when on Live Review) |
| `Ctrl+E` | Export as Markdown (when on Meeting Room) |
| `Ctrl+Shift+E` | Export as JSON (when on Meeting Room) |

---

## 7. Exporting Results

### Markdown Export

From the Meeting Room, click **Export Markdown** or press `Ctrl+E`. A save dialog opens. The exported file contains the full manager summary.

### JSON Export

Click **Export JSON** or press `Ctrl+Shift+E`. The exported file contains all findings as structured JSON with severity, confidence, evidence, and recommendations.

### Session Files

All session data is stored locally under the Electron `userData` directory:

```
<userData>/sessions/<session-id>/
  session.json      # Session metadata (repo, target, reviewers, status)
  events.jsonl      # Append-only event log (every agent action)
  findings.json     # All findings with evidence
  summary.md        # Manager summary output
```

On Linux: `~/.config/agent-review-room/`. On macOS: `~/Library/Application Support/agent-review-room/`. On Windows: `%APPDATA%/agent-review-room/`.

---

## 8. Customization

### Agent Skill Files

Each reviewer agent is defined by a `.md` skill file that describes what it should focus on. The app loads skills from these locations (first match wins):

1. `~/.config/agent-review-room/skills/` (user skills)
2. `skills/` in the project root (built-in skills)

Built-in agents: **security**, **architecture**, **regression**, **test-gap**, **performance**, **document-reviewer**.

#### Creating a Custom Agent

1. Create a `.md` file (e.g. `api-design.md`) describing what the agent should review.
2. Drop it in either skills folder listed above.
3. Restart the app -- the new agent appears in every reviewer's dropdown.

You can also click **Import Agents Folder** on the Setup screen to load skill files from any directory without restarting.

For a one-off agent that you don't want to save as a file, select **+ custom** from the agent dropdown and type a description inline.

### Config File

Place a `config.json` at your user config location or project root to customize available providers and models.

Config file locations (checked in order):
1. `~/.config/agent-review-room/config.json` (user)
2. `config.json` in the project root

```json
{
  "providers": [
    {
      "id": "claude-cli",
      "name": "Claude",
      "cli": "claude",
      "models": [
        { "id": "sonnet", "label": "Sonnet" },
        { "id": "opus", "label": "Opus" }
      ]
    }
  ]
}
```

The provider `id` must be one of: `claude-cli`, `codex-cli`, `gemini-cli`. You can also type a custom model ID directly in the Setup screen.
