# Roadmap

## Next

- Pluggable manager skills (`manager-skills/` folder) -- e.g. flowchart-manager (mermaid diagrams), api-doc-manager, dependency-graph-manager with interactive function inspector
- Jira / external data integration -- custom hooks to fetch context from Jira, Linear, GitHub Issues before review starts
- Custom CLI input -- support arbitrary CLI tools as providers
- Dark theme toggle (tokens defined in `themes.css`)
- Patch file review target
- Duplicate finding dedup before meeting
- Tool hardening: file size limits, binary detection, diff truncation

## Done

- Multi-provider support: Claude CLI, Codex CLI, Gemini CLI
- Config-driven provider/model dropdowns (loaded from config.json or built-in defaults)
- Codex "Default" model option (omits `-m` flag, lets CLI pick its default)
- Custom reviewer roles with title, description, skill file paths
- Skill file path validation against repo boundary
- Agent skill files: 6 built-in agents (security, architecture, regression, test-gap, performance, document-reviewer) loaded from `skills/` folder
- Agent dropdown on Setup screen populated from `.md` skill files
- Import Agents Folder button to load skills from any directory
- User skills directory (`~/.config/agent-review-room/skills/`)
- Default review prompt pre-filled + PR format toggle
- Resilient reviewer execution (one failure doesn't kill the review)
- Per-reviewer finding attribution in Meeting Room (owner badges)
- Meeting Room stats bar (per-reviewer counts, severity breakdown, unique count)
- Collapsible meeting room robot scene (Hide Room / Show Room toggle)
- Follow-up prompts with reviewer selection checkboxes
- Clear all sessions button
- Context-aware manager prompts (PR format detection, question-mode for no-findings)
- Robot sprite characters (Cute Robot CC0) with provider-based coloring
- Meeting Room robots with manager presenting summary
- Manager summary rendered as Markdown (headings, bold, italic, code, lists)
- Export markdown/JSON via save dialogs
- Hand-raise permission flow
- Reviewer/finding detail inspector with code blocks
- Error banners and highlighted error activity
- Keyboard shortcuts (1/2/3 screens, Ctrl+E, Ctrl+N, Ctrl+Enter, Escape)
- Session history with resume
- Security: CSP, path guard with realpath, git subcommand allowlist, input validation
- Claude CLI restricted to specific git subcommands (not `git:*`)
- Codex CLI: no `--output-schema`, uses prompt-based JSON extraction
- Gemini CLI: `--sandbox` + `--approval-mode yolo`
- `read-diff` uses `--no-ext-diff --no-textconv`
- Shared CLI logic (cli-shared.ts): prompt building, JSON extraction, stream event processing
- CI: GitHub Actions (lint, typecheck, build, test)
- Tests via Node built-in test runner (`node --test`)
- MIT License
- File-based persistence (session.json, events.jsonl, findings.json, summary.md)
