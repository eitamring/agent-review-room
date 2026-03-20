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

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((p) => path.resolve(p)))];
}

async function loadJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

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

  const configPaths = uniquePaths([
    path.join(app.getPath('userData'), 'config.json'),
    path.join(app.getAppPath(), 'config.json'),
    path.join(process.cwd(), 'config.json'),
  ]);

  for (const configPath of configPaths) {
    config = await loadJsonIfExists<Omit<AppConfig, 'skills'>>(configPath);
    if (config) {
      break;
    }
  }

  let providers = DEFAULT_CONFIG.providers;
  if (config && Array.isArray(config.providers) && config.providers.every(
    (p: Record<string, unknown>) => typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.models),
  )) {
    providers = config.providers as ProviderOption[];
  }

  // Load skills: user skills dir > bundled app skills dir > cwd skills dir
  let skills: SkillOption[] = [];
  for (const skillsDir of uniquePaths([
    path.join(app.getPath('userData'), 'skills'),
    path.join(app.getAppPath(), 'skills'),
    path.join(process.cwd(), 'skills'),
  ])) {
    skills = await loadSkillsFromDir(skillsDir);
    if (skills.length > 0) {
      break;
    }
  }

  cached = { providers, skills };
  return cached;
}

export function reloadConfig(): void {
  cached = null;
}
