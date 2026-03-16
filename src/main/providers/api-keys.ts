import type { LLMProvider } from '../../shared/types';

const PROVIDER_ENV_VARS: Record<LLMProvider, string> = {
  'claude-cli': '',
  'codex-cli': '',
  'gemini-cli': '',
};

export function resolveApiKey(provider: LLMProvider): string {
  const envVar = PROVIDER_ENV_VARS[provider];
  if (!envVar) return '';
  return process.env[envVar] ?? '';
}
