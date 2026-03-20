import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ALLOWED_HOSTS = [
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
];

function isAllowedHost(hostname) {
  return ALLOWED_HOSTS.includes(hostname);
}

function assertAllowedUrl(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(`Network guard: invalid URL: ${url}`);
  }
  if (!isAllowedHost(hostname)) {
    throw new Error(
      `Network guard: ${hostname} is not an allowed provider host. Allowed: ${ALLOWED_HOSTS.join(', ')}`,
    );
  }
}

describe('network-guard', () => {
  describe('isAllowedHost', () => {
    it('allows api.openai.com', () => {
      assert.equal(isAllowedHost('api.openai.com'), true);
    });

    it('allows api.anthropic.com', () => {
      assert.equal(isAllowedHost('api.anthropic.com'), true);
    });

    it('allows generativelanguage.googleapis.com', () => {
      assert.equal(isAllowedHost('generativelanguage.googleapis.com'), true);
    });

    it('rejects evil.com', () => {
      assert.equal(isAllowedHost('evil.com'), false);
    });

    it('rejects localhost', () => {
      assert.equal(isAllowedHost('localhost'), false);
    });
  });

  describe('assertAllowedUrl', () => {
    it('accepts valid allowed URLs', () => {
      assert.doesNotThrow(() => assertAllowedUrl('https://api.openai.com/v1/chat'));
      assert.doesNotThrow(() => assertAllowedUrl('https://api.anthropic.com/v1/messages'));
      assert.doesNotThrow(() => assertAllowedUrl('https://generativelanguage.googleapis.com/v1/models'));
    });

    it('throws on invalid URL', () => {
      assert.throws(() => assertAllowedUrl('not-a-url'), /invalid URL/);
    });

    it('throws on non-allowed host', () => {
      assert.throws(
        () => assertAllowedUrl('https://evil.com/steal'),
        /not an allowed provider host/,
      );
    });
  });
});
