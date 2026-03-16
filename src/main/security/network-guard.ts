// All outbound HTTP must go through the provider gateway.
// This module enforces the allowlist at the URL level.

export const ALLOWED_HOSTS = [
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
] as const;

export type AllowedHost = (typeof ALLOWED_HOSTS)[number];

export function isAllowedHost(hostname: string): hostname is AllowedHost {
  return (ALLOWED_HOSTS as readonly string[]).includes(hostname);
}

/**
 * Throws if the URL target is not in the provider allowlist.
 * Called by the gateway before any fetch().
 */
export function assertAllowedUrl(url: string): void {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(`Network guard: invalid URL: ${url}`);
  }
  if (!isAllowedHost(hostname)) {
    throw new Error(
      `Network guard: ${hostname} is not an allowed provider host. ` +
        `Allowed: ${ALLOWED_HOSTS.join(', ')}`,
    );
  }
}
