import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

async function realOrLexical(p) {
  try {
    return await fs.realpath(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

async function assertWithinDirectory(baseDir, targetPath) {
  const baseReal = await realOrLexical(baseDir);
  const targetReal = await realOrLexical(targetPath);

  const rel = path.relative(baseReal, targetReal);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(
      `Security: path "${targetPath}" escapes the boundary at "${baseDir}"`,
    );
  }
}

describe('path-guard', () => {
  it('allows paths inside the base directory', async () => {
    await assert.doesNotReject(
      assertWithinDirectory('/home/user/repo', '/home/user/repo/src/index.ts'),
    );
  });

  it('allows the base directory itself', async () => {
    await assert.doesNotReject(
      assertWithinDirectory('/home/user/repo', '/home/user/repo'),
    );
  });

  it('rejects paths with .. segments that escape', async () => {
    await assert.rejects(
      assertWithinDirectory('/home/user/repo', '/home/user/repo/../../../etc/passwd'),
      /escapes the boundary/,
    );
  });

  it('rejects absolute paths outside the base', async () => {
    await assert.rejects(
      assertWithinDirectory('/home/user/repo', '/etc/passwd'),
      /escapes the boundary/,
    );
  });

  it('resolves symlinks before checking boundary', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-test-'));
    const innerDir = path.join(tmpDir, 'repo');
    await fs.mkdir(innerDir);
    const targetFile = path.join(tmpDir, 'outside.txt');
    await fs.writeFile(targetFile, 'secret');
    const linkPath = path.join(innerDir, 'sneaky-link');
    await fs.symlink(targetFile, linkPath);

    await assert.rejects(
      assertWithinDirectory(innerDir, linkPath),
      /escapes the boundary/,
    );

    await fs.rm(tmpDir, { recursive: true });
  });

  it('allows symlinks that resolve within the base directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-test-'));
    const innerDir = path.join(tmpDir, 'repo');
    const subDir = path.join(innerDir, 'sub');
    await fs.mkdir(subDir, { recursive: true });
    const targetFile = path.join(subDir, 'real.txt');
    await fs.writeFile(targetFile, 'ok');
    const linkPath = path.join(innerDir, 'good-link');
    await fs.symlink(targetFile, linkPath);

    await assert.doesNotReject(
      assertWithinDirectory(innerDir, linkPath),
    );

    await fs.rm(tmpDir, { recursive: true });
  });
});
