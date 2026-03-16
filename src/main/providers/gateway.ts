// All outbound LLM calls must go through this module.
// No other module may import fetch, http, or https directly.

import { assertAllowedUrl } from '../security/network-guard';
import type { LLMProvider } from '../../shared/types';

// ── Content blocks (shared between request and response) ─────────────────────

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

// ── Request ──────────────────────────────────────────────────────────────────

export type Message = {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ProviderRequest = {
  model: string;
  system?: string;
  messages: Message[];
  tools?: ToolDefinition[];
  maxTokens?: number;
};

// ── Response ─────────────────────────────────────────────────────────────────

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ProviderResponse = {
  content: ContentBlock[];
  textContent: string;
  toolCalls: ToolCall[];
  usage?: { inputTokens: number; outputTokens: number };
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
};

// ── Adapter interface ────────────────────────────────────────────────────────

export interface LLMProviderAdapter {
  readonly baseUrl: string;
  complete(request: ProviderRequest, apiKey: string): Promise<ProviderResponse>;
}

// ── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<LLMProvider, LLMProviderAdapter>();

export function registerProvider(name: LLMProvider, adapter: LLMProviderAdapter): void {
  assertAllowedUrl(adapter.baseUrl);
  registry.set(name, adapter);
}

export function getProvider(name: LLMProvider): LLMProviderAdapter {
  const adapter = registry.get(name);
  if (!adapter) throw new Error(`Provider not registered: ${name}`);
  return adapter;
}
