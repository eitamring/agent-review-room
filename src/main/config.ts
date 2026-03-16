import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';

export type ModelOption = { id: string; label: string };
export type ProviderOption = { id: string; name: string; cli: string; models: ModelOption[] };
export type AppConfig = { providers: ProviderOption[] };

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
        { id: 'o3-mini', label: 'o3-mini' },
        { id: 'o3', label: 'o3' },
        { id: 'gpt-4.1', label: 'GPT-4.1' },
        { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
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
};

let cached: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;

  const userPath = path.join(app.getPath('userData'), 'config.json');
  try {
    const raw = await fs.readFile(userPath, 'utf-8');
    cached = JSON.parse(raw) as AppConfig;
    return cached;
  } catch { /* no user config */ }

  const projectPath = path.join(process.cwd(), 'config.json');
  try {
    const raw = await fs.readFile(projectPath, 'utf-8');
    cached = JSON.parse(raw) as AppConfig;
    return cached;
  } catch { /* no project config */ }

  cached = DEFAULT_CONFIG;
  return cached;
}
