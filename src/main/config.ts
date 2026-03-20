import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';

export type ModelOption = { id: string; label: string };
export type ProviderOption = { id: string; name: string; cli: string; models: ModelOption[] };
export type SkillOption = { name: string; path: string; content: string };
export type AppConfig = { providers: ProviderOption[]; skills: SkillOption[] };

const DEFAULT_CONFIG: AppConfig = {
  providers: [
    {
      id: 'claude-cli',
      name: 'Claude',
      cli: 'claude',
      models: [
        { id: 'sonnet', label: 'Sonnet' },
        { id: 'opus', label: 'Opus' },
        { id: 'haiku', label: 'Haiku' },
      ],
    },
    {
      id: 'codex-cli',
      name: 'Codex',
      cli: 'codex',
      models: [
        { id: 'default', label: 'Default' },
      ],
    },
    {
      id: 'gemini-cli',
      name: 'Gemini',
      cli: 'gemini',
      models: [
        { id: 'gemini-2.5-flash', label: '2.5 Flash' },
        { id: 'gemini-2.5-pro', label: '2.5 Pro' },
        { id: 'gemini-2.0-flash', label: '2.0 Flash' },
      ],
    },
  ],
  skills: [],
};

let cached: AppConfig | null = null;

async function loadSkillsFromDir(dir: string): Promise<SkillOption[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const skills: SkillOption[] = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const fullPath = path.join(dir, entry.name);
        const content = await fs.readFile(fullPath, 'utf-8');
        skills.push({ name: entry.name.replace(/\.md$/, ''), path: fullPath, content });
      }
    }
    return skills;
  } catch { return []; }
}

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;

  let config: Omit<AppConfig, 'skills'> | null = null;

  const userPath = path.join(app.getPath('userData'), 'config.json');
  try {
    config = JSON.parse(await fs.readFile(userPath, 'utf-8'));
  } catch { /* no user config */ }

  if (!config) {
    const projectPath = path.join(process.cwd(), 'config.json');
    try {
      config = JSON.parse(await fs.readFile(projectPath, 'utf-8'));
    } catch { /* no project config */ }
  }

  const providers = config?.providers ?? DEFAULT_CONFIG.providers;

  // Load skills: user skills dir > project skills dir > built-in
  let skills = await loadSkillsFromDir(path.join(app.getPath('userData'), 'skills'));
  if (skills.length === 0) skills = await loadSkillsFromDir(path.join(process.cwd(), 'skills'));

  cached = { providers, skills };
  return cached;
}
