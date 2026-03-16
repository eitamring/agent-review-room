import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { assertWithinRepo } from '../security/path-guard';

const execFileAsync = promisify(execFile);

const SAFE_REF = /^[a-zA-Z0-9_.\-\/]+$/;

export type ReadDiffParams = {
  repoPath: string;
  baseRef?: string;
  headRef?: string;
  filePath?: string;
};

export type ReadDiffResult = {
  diff: string;
};

export async function readDiff(params: ReadDiffParams): Promise<ReadDiffResult> {
  const args: string[] = ['-c', 'diff.external=', '-c', 'diff.textconv=', 'diff', '--no-ext-diff', '--no-textconv'];

  if (params.baseRef) {
    if (!SAFE_REF.test(params.baseRef)) {
      throw new Error(`Invalid baseRef: ${params.baseRef}`);
    }
  }
  if (params.headRef) {
    if (!SAFE_REF.test(params.headRef)) {
      throw new Error(`Invalid headRef: ${params.headRef}`);
    }
  }

  if (params.baseRef && params.headRef) {
    args.push(`${params.baseRef}..${params.headRef}`);
  } else if (params.baseRef) {
    args.push(params.baseRef);
  }

  if (params.filePath) {
    const fullPath = path.resolve(params.repoPath, params.filePath);
    await assertWithinRepo(params.repoPath, fullPath);
    args.push('--', params.filePath);
  }

  const { stdout } = await execFileAsync('git', args, { cwd: params.repoPath });
  return { diff: stdout };
}
