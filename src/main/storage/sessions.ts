import fs from 'fs/promises';
import path from 'path';
import type { ReviewSession } from '../../shared/types';
import { resolveSessionPath, sessionsDir } from './session-paths';

class SessionsStore {
  private async sessionDir(id: string): Promise<string> {
    return resolveSessionPath(id);
  }

  private async sessionFile(id: string): Promise<string> {
    return resolveSessionPath(id, 'session.json');
  }

  async write(session: ReviewSession): Promise<void> {
    const sessionDir = await this.sessionDir(session.id);
    const sessionFile = await this.sessionFile(session.id);
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(
      sessionFile,
      JSON.stringify(session, null, 2),
      'utf-8',
    );
  }

  async read(id: string): Promise<ReviewSession | null> {
    try {
      const data = await fs.readFile(await this.sessionFile(id), 'utf-8');
      return JSON.parse(data) as ReviewSession;
    } catch {
      return null;
    }
  }

  async list(): Promise<ReviewSession[]> {
    try {
      const entries = await fs.readdir(sessionsDir(), { withFileTypes: true });
      const results = await Promise.all(
        entries.filter((e) => e.isDirectory()).map((e) => this.read(e.name)),
      );
      return results.filter((s): s is ReviewSession => s !== null);
    } catch {
      return [];
    }
  }

  async clearAll(): Promise<void> {
    try {
      const entries = await fs.readdir(sessionsDir(), { withFileTypes: true });
      await Promise.all(
        entries.filter((e) => e.isDirectory()).map((e) =>
          fs.rm(path.join(sessionsDir(), e.name), { recursive: true, force: true }),
        ),
      );
    } catch { /* dir may not exist */ }
  }
}

export const sessionsStore = new SessionsStore();
