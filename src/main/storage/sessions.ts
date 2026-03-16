import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import type { ReviewSession } from '../../shared/types';

// app.getPath('userData') is stable after Electron initialises and is always
// writable in both dev and packaged builds — unlike process.cwd().
const sessionsDir = () => path.join(app.getPath('userData'), 'sessions');

class SessionsStore {
  private sessionDir(id: string): string {
    return path.join(sessionsDir(), id);
  }

  private sessionFile(id: string): string {
    return path.join(this.sessionDir(id), 'session.json');
  }

  async write(session: ReviewSession): Promise<void> {
    await fs.mkdir(this.sessionDir(session.id), { recursive: true });
    await fs.writeFile(
      this.sessionFile(session.id),
      JSON.stringify(session, null, 2),
      'utf-8',
    );
  }

  async read(id: string): Promise<ReviewSession | null> {
    try {
      const data = await fs.readFile(this.sessionFile(id), 'utf-8');
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
