import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type GitMetadataResult = {
  branch: string;
  commit: string;
  remotes: string[];
  tags: string[];
};

export async function readGitMetadata(repoPath: string): Promise<GitMetadataResult> {
  const run = (args: string[]) =>
    execFileAsync('git', args, { cwd: repoPath }).then(({ stdout }) => stdout.trim());

  const [branch, commit, remotesRaw, tagsRaw] = await Promise.all([
    run(['rev-parse', '--abbrev-ref', 'HEAD']),
    run(['rev-parse', 'HEAD']),
    run(['remote']),
    run(['tag', '--list']),
  ]);

  return {
    branch,
    commit,
    remotes: remotesRaw.split('\n').filter(Boolean),
    tags: tagsRaw.split('\n').filter(Boolean),
  };
}
