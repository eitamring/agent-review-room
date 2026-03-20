import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const DEFAULT_ALLOWED_COMMANDS = [
  { executable: 'git', description: 'Git read-only operations', readOnly: true },
];

const SAFE_GIT_SUBCOMMANDS = new Set([
  'diff', 'log', 'show', 'status', 'branch', 'tag',
  'rev-parse', 'for-each-ref', 'ls-files', 'blame', 'shortlog',
]);

function isCommandAllowed(executable) {
  return DEFAULT_ALLOWED_COMMANDS.some((c) => c.executable === executable);
}

function isGitSubcommandSafe(args) {
  const subcommand = args[0];
  if (!subcommand) return false;
  return SAFE_GIT_SUBCOMMANDS.has(subcommand);
}

describe('command-policy', () => {
  it('allows git', () => {
    assert.equal(isCommandAllowed('git'), true);
  });

  it('rejects rm', () => {
    assert.equal(isCommandAllowed('rm'), false);
  });

  it('rejects curl', () => {
    assert.equal(isCommandAllowed('curl'), false);
  });

  it('rejects node', () => {
    assert.equal(isCommandAllowed('node'), false);
  });

  describe('isGitSubcommandSafe', () => {
    for (const sub of ['diff', 'log', 'show', 'status', 'branch', 'tag', 'rev-parse', 'for-each-ref', 'ls-files', 'blame', 'shortlog']) {
      it(`allows ${sub}`, () => {
        assert.equal(isGitSubcommandSafe([sub]), true);
      });
    }

    for (const sub of ['push', 'reset', 'clean', 'checkout', 'merge', 'rebase', 'fetch', 'remote', 'config']) {
      it(`rejects ${sub}`, () => {
        assert.equal(isGitSubcommandSafe([sub]), false);
      });
    }

    it('returns false for empty args', () => {
      assert.equal(isGitSubcommandSafe([]), false);
    });
  });
});
