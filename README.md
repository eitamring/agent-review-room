# Agent Review Room

Local-first desktop app for orchestrating multiple LLM reviewers against a local repository. Each reviewer works independently, then a manager consolidates their findings into a final synthesis.

## Quick Start

```bash
npm install
npm run dev
```

Requires at least one supported CLI installed and authenticated:
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) (`claude`)
- [Codex CLI](https://github.com/openai/codex) (`codex`)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) (`gemini`)

No API keys are configured in the app -- each CLI manages its own authentication.

## How It Works

1. **Setup** -- Pick a local git repo, choose a review target (working tree or ref range), write optional instructions, toggle PR format, configure 1-5 reviewer agents. Each agent is selected from a dropdown populated by `.md` skill files in `skills/` (or `~/.config/agent-review-room/skills/`). Built-in agents: security, architecture, regression, test-gap, performance, document-reviewer. Use "Import Agents Folder" to load from any directory, or select "+ custom" for a one-off agent with an inline description.

2. **Live Review** -- Reviewers run concurrently (up to 3 at a time) via their respective CLIs. Watch their activity in real-time: file reads, searches, notes. Robot characters animate in the room scene. If one reviewer fails, the rest continue.

3. **Meeting Room** -- Manager consolidates findings. Stats bar shows per-reviewer counts, severity breakdown, and unique finding count. Findings list with evidence, collapsible room scene, follow-up prompts to re-engage selected reviewers. Export as Markdown or JSON.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` `2` `3` | Switch screens |
| `Ctrl+N` | New review |
| `Ctrl+Enter` | Start review (Setup) |
| `Escape` | Stop review (Live Review) |
| `Ctrl+E` | Export markdown (Meeting Room) |
| `Ctrl+Shift+E` | Export JSON (Meeting Room) |

## Architecture

```
src/
  main/           Electron main process
    review/       Session manager, CLI reviewer agents (Claude/Codex/Gemini),
                  manager agent, clustering, shared CLI logic, prompts
    tools/        Local repo tools (read-diff with --no-ext-diff --no-textconv)
    storage/      File-based persistence (session.json, events.jsonl, findings.json)
    security/     Path guard (realpath-based), command policy (git subcommand allowlist)
    ipc/          IPC channels and handlers (input validation, skill file boundary checks)
    providers/    Gateway interface (for future API-key providers)
    config.ts     Config-driven provider/model definitions
  preload/        Typed IPC bridge (contextIsolation + sandbox)
  renderer/       React 19 UI
    app/
      features/   Setup, Live Review, Meeting Room
      components/ Badge
      styles/     Design tokens, globals, themes
  shared/         Types shared across all processes
```

## Security

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`
- CLI providers use restricted git subcommands only: `diff`, `log`, `show`, `status`, `branch`, `tag`, `rev-parse`, `for-each-ref`, `ls-files`, `blame`, `shortlog`
- Claude CLI uses `--allowedTools Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Bash(git show:*),...` (specific subcommands, not `git:*`)
- Codex CLI uses `--sandbox read-only`
- Gemini CLI uses `--sandbox` and `--approval-mode yolo`
- File tools enforce repo boundary via `fs.realpath` (symlink-safe)
- Skill file paths validated against repo boundary before session creation
- `read-diff` uses `--no-ext-diff --no-textconv` to prevent external tool execution
- Restrictive CSP in production

## Provider Model

The app shells out to locally installed CLI tools. No API keys are needed -- each CLI manages its own authentication:

| Provider | CLI | Key flags |
|----------|-----|-----------|
| **Claude** | `claude -p` | `--output-format stream-json`, `--allowedTools` (restricted git subcommands) |
| **Codex** | `codex exec` | `--sandbox read-only`, `--json`, `-o` (output file); no `--output-schema` |
| **Gemini** | `gemini -p` | `--output-format stream-json`, `--sandbox`, `--approval-mode yolo` |

Default models: Claude Sonnet, Codex Default, Gemini 2.5 Flash. All models are config-driven and selectable from dropdowns, with an option to type a custom model ID.

## CI

GitHub Actions runs lint, typecheck, build, and tests on push/PR to main. Tests use Node's built-in test runner (`node --test`).

## Assets

Robot sprites: [Cute Platformer Robot](https://foozlecc.itch.io/cute-platformer-robot) by Foozle (CC0). See `ASSETS.md` for full provenance.

## License

MIT. See `LICENSE`.
