import fs from 'fs/promises';
import path from 'path';
import { assertWithinRepo } from '../security/path-guard';

export type ReadFileParams = {
  repoPath: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
};

export type ReadFileResult = {
  content: string;
  totalLines: number;
};

export async function readFile(params: ReadFileParams): Promise<ReadFileResult> {
  const fullPath = path.resolve(params.repoPath, params.filePath);
  await assertWithinRepo(params.repoPath, fullPath);
  const raw = await fs.readFile(fullPath, 'utf-8');
  const lines = raw.split('\n');
  const start = Math.max(0, (params.startLine ?? 1) - 1);
  const end = params.endLine ?? lines.length;
  return {
    content: lines.slice(start, end).join('\n'),
    totalLines: lines.length,
  };
}
