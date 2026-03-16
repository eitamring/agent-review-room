import fs from 'fs/promises';
import path from 'path';
import { listFiles } from './list-files';

export type SearchTextParams = {
  repoPath: string;
  pattern: string;
  /** When true, `pattern` is treated as a literal string, not a regex. */
  literal?: boolean;
  maxResults?: number;
};

export type SearchMatch = {
  file: string;
  line: number;
  text: string;
};

export type SearchTextResult = {
  matches: SearchMatch[];
  truncated: boolean;
};

export async function searchText(params: SearchTextParams): Promise<SearchTextResult> {
  const limit = params.maxResults ?? 100;

  // Escape metacharacters for literal searches; validate regex patterns early
  // so we surface bad patterns before touching the filesystem.
  const source = params.literal
    ? params.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    : params.pattern;

  if (source.length > 200) {
    throw new Error('Search pattern exceeds maximum length of 200 characters');
  }

  const nestedQuantifiers = (source.match(/[+*?}\)][+*?]/g) ?? []).length;
  if (nestedQuantifiers > 5) {
    throw new Error('Search pattern contains too many nested quantifiers');
  }

  let regex: RegExp;
  try {
    regex = new RegExp(source, 'g');
  } catch (err) {
    throw new Error(
      `Invalid search pattern "${params.pattern}": ${(err as Error).message}`,
    );
  }
  const { files } = await listFiles({ repoPath: params.repoPath });

  const matches: SearchMatch[] = [];
  let truncated = false;

  outer: for (const file of files) {
    const fullPath = path.join(params.repoPath, file);
    let content: string;
    try {
      content = await fs.readFile(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      regex.lastIndex = 0;
      if (regex.test(lines[i])) {
        matches.push({ file, line: i + 1, text: lines[i] });
        if (matches.length >= limit) {
          truncated = true;
          break outer;
        }
      }
    }
  }

  return { matches, truncated };
}
