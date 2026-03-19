import path from 'path';
import { app } from 'electron';
import { assertWithinRepo } from '../security/path-guard';

const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sessionsDir(): string {
  return path.join(app.getPath('userData'), 'sessions');
}

export function assertValidSessionId(sessionId: string): void {
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new Error(`Invalid session ID: ${sessionId}`);
  }
}

export async function resolveSessionPath(
  sessionId: string,
  ...parts: string[]
): Promise<string> {
  assertValidSessionId(sessionId);

  const baseDir = sessionsDir();
  const targetPath = path.join(baseDir, sessionId, ...parts);
  await assertWithinRepo(baseDir, targetPath);
  return targetPath;
}
