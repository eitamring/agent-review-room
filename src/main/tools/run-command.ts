import { execFile } from 'child_process';
import { promisify } from 'util';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../ipc/channels';
import { isCommandAllowed, isCommandReadOnly, isGitSubcommandSafe } from '../security/command-policy';
import { assertWithinRepo } from '../security/path-guard';
import { sessionManager } from '../review/session-manager';
import type { ReviewEvent } from '../../shared/types';

const exec = promisify(execFile);

const EXEC_TIMEOUT_MS = 30_000;
const now = () => new Date().toISOString();

export type RunCommandParams = {
  executable: string;
  args: string[];
  cwd: string;
  repoPath: string;
  agentId: string;
};

export type RunCommandResult = {
  stdout: string;
  stderr: string;
  approved: boolean;
};

function notifyRenderer(
  requestId: string,
  agentId: string,
  command: string,
  args: string[],
): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send(IPC_CHANNELS.PERMISSION_REQUEST, {
      requestId,
      agentId,
      command,
      args,
    });
  }
}

export async function runCommand(
  params: RunCommandParams,
  onEvent?: (event: ReviewEvent) => Promise<void>,
): Promise<RunCommandResult> {
  const { executable, args, cwd, repoPath, agentId } = params;

  await assertWithinRepo(repoPath, cwd);

  const isSafeReadOnly =
    isCommandAllowed(executable) &&
    isCommandReadOnly(executable) &&
    (executable !== 'git' || isGitSubcommandSafe(args));

  if (isSafeReadOnly) {
    const { stdout, stderr } = await exec(executable, args, {
      cwd,
      timeout: EXEC_TIMEOUT_MS,
    });
    return { stdout, stderr, approved: true };
  }

  if (onEvent) {
    await onEvent({
      type: 'agent.status',
      agentId,
      at: now(),
      state: 'blocked',
      label: `Permission: ${executable} ${args.join(' ')}`,
    });
  }

  const approved = await sessionManager.requestPermission(
    agentId,
    executable,
    args,
    notifyRenderer,
  );

  if (!approved) {
    if (onEvent) {
      await onEvent({
        type: 'agent.status',
        agentId,
        at: now(),
        state: 'reading',
        label: 'Permission denied, continuing',
      });
    }
    return { stdout: '', stderr: 'Permission denied by user', approved: false };
  }

  if (onEvent) {
    await onEvent({
      type: 'agent.status',
      agentId,
      at: now(),
      state: 'reading',
      label: `Running ${executable}`,
    });
  }

  const { stdout, stderr } = await exec(executable, args, {
    cwd,
    timeout: EXEC_TIMEOUT_MS,
  });
  return { stdout, stderr, approved: true };
}
