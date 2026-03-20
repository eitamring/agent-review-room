import fs from 'fs/promises';
import path from 'path';

/**
 * Resolves both paths through symlinks via `fs.realpath`, then asserts the
 * target lies inside the repository root.
 *
 * `path.resolve` only normalises `..` segments lexically.  A symlink inside
 * the repo that points to `~/.ssh/id_rsa` still lexically resolves to a path
 * inside the repo, so lexical-only checks are bypassable.  `fs.realpath`
 * follows every symlink in the chain and returns the actual inode path, so
 * `repo/link -> /etc/passwd` becomes `/etc/passwd` before the boundary test.
 *
 * If the target does not exist yet (e.g. a path about to be created) realpath
 * will throw ENOENT.  In that case we fall back to lexical resolution: a
 * non-existent path cannot be a symlink, so the lexical check is sufficient.
 */
export async function assertWithinDirectory(
  baseDir: string,
  targetPath: string,
): Promise<void> {
  const baseReal = await realOrLexical(baseDir);
  const targetReal = await realOrLexical(targetPath);

  const rel = path.relative(baseReal, targetReal);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(
      `Security: path "${targetPath}" escapes the boundary at "${baseDir}"`,
    );
  }
}

export const assertWithinRepo = assertWithinDirectory;

async function realOrLexical(p: string): Promise<string> {
  try {
    return await fs.realpath(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}
