import fs from 'fs/promises';
import path from 'path';
import { assertWithinRepo } from '../security/path-guard';

// Dot-directories that are never useful for a code review.
// Everything NOT in this set is walked — .github, .changeset, .husky, etc.
const SKIP_DOT_DIRS = new Set(['.git', '.hg', '.svn', '.DS_Store']);

export type ListFilesParams = {
  repoPath: string;
  directory?: string;
};

export type ListFilesResult = {
  files: string[];
};

export async function listFiles(params: ListFilesParams): Promise<ListFilesResult> {
  const targetDir = params.directory
    ? path.resolve(params.repoPath, params.directory)
    : path.resolve(params.repoPath);
  await assertWithinRepo(params.repoPath, targetDir);
  const files = await walkDir(targetDir, path.resolve(params.repoPath));
  return { files };
}

async function walkDir(dir: string, root: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    // Symlinks are excluded at listing time. `Dirent.isDirectory()` and
    // `Dirent.isFile()` both return false for symlinks, but the else-branch
    // below would still push them as plain files without this guard.
    // Exclusion here means an agent cannot obtain a symlinked path to pass to
    // read_file. For direct read_file calls, assertWithinRepo resolves through
    // symlinks via fs.realpath and catches escapes there.
    if (entry.isSymbolicLink()) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      // Only skip dot-dirs that are never review-relevant.
      // .github, .changeset, .husky, .devcontainer, etc. are walked.
      if (entry.name.startsWith('.') && SKIP_DOT_DIRS.has(entry.name)) continue;
      results.push(...(await walkDir(fullPath, root)));
    } else {
      results.push(path.relative(root, fullPath));
    }
  }
  return results;
}
