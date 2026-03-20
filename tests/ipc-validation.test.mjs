import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';

function sanitizePromptInput(s) {
  return s
    .replace(/\x00/g, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

describe('sanitizePromptInput', () => {
  it('strips null bytes', () => {
    assert.equal(sanitizePromptInput('hello\x00world'), 'helloworld');
  });

  it('strips ANSI escape sequences', () => {
    assert.equal(sanitizePromptInput('hello\x1b[31mred\x1b[0m'), 'hellored');
    assert.equal(sanitizePromptInput('\x1b[1A\x1b[2Jcleared'), 'cleared');
  });

  it('keeps normal text, newlines, and tabs', () => {
    const input = 'line one\nline two\ttabbed';
    assert.equal(sanitizePromptInput(input), input);
  });

  it('strips other control characters', () => {
    assert.equal(sanitizePromptInput('a\x01b\x07c\x0ed'), 'abcd');
  });

  it('returns empty string for empty input', () => {
    assert.equal(sanitizePromptInput(''), '');
  });
});

describe('skillFilePath validation', () => {
  it('requires .md extension', () => {
    assert.ok('test.md'.endsWith('.md'));
    assert.ok(!'test.txt'.endsWith('.md'));
    assert.ok(!'test.md.txt'.endsWith('.md'));
  });

  it('rejects non-.md extensions', () => {
    for (const ext of ['.js', '.json', '.ts', '.html', '']) {
      assert.ok(!`file${ext}`.endsWith('.md'));
    }
  });

  it('path must be within allowed directories', () => {
    const allowedRoots = [process.cwd(), os.homedir(), '/fake/userData'];

    function isWithinAllowed(filePath) {
      const resolved = path.resolve(filePath);
      return allowedRoots.some((root) => {
        const rel = path.relative(root, resolved);
        return !rel.startsWith('..') && !path.isAbsolute(rel);
      });
    }

    assert.ok(isWithinAllowed(path.join(process.cwd(), 'skills', 'test.md')));
    assert.ok(isWithinAllowed(path.join(os.homedir(), 'skills', 'test.md')));
    assert.ok(isWithinAllowed(path.join('/fake/userData', 'skills', 'test.md')));
    assert.ok(!isWithinAllowed('/etc/passwd.md'));
    assert.ok(!isWithinAllowed('/tmp/evil.md'));
  });
});
