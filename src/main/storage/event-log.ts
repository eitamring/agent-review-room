import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import type { ReviewEvent } from '../../shared/types';

const sessionsDir = () => path.join(app.getPath('userData'), 'sessions');

const MAX_LOG_BYTES = 10 * 1024 * 1024;
const DEFAULT_READ_LIMIT = 500;

class EventLog {
  private logFile(sessionId: string): string {
    return path.join(sessionsDir(), sessionId, 'events.jsonl');
  }

  async append(sessionId: string, event: ReviewEvent): Promise<void> {
    const filePath = this.logFile(sessionId);
    try {
      const stat = await fs.stat(filePath);
      if (stat.size >= MAX_LOG_BYTES) {
        throw new Error(`Event log for session ${sessionId} exceeds ${MAX_LOG_BYTES} bytes`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, JSON.stringify(event) + '\n', 'utf-8');
  }

  async read(sessionId: string, limit: number = DEFAULT_READ_LIMIT): Promise<ReviewEvent[]> {
    try {
      const content = await fs.readFile(this.logFile(sessionId), 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      const tail = lines.slice(-limit);
      return tail.map((line) => JSON.parse(line) as ReviewEvent);
    } catch {
      return [];
    }
  }
}

export const eventLog = new EventLog();
