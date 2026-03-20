import fs from 'fs/promises';
import path from 'path';
import type { ReviewEvent } from '../../shared/types';
import { resolveSessionPath } from './session-paths';

const MAX_LOG_BYTES = 10 * 1024 * 1024;
const DEFAULT_READ_LIMIT = 500;

class EventLog {
  private async logFile(sessionId: string): Promise<string> {
    return resolveSessionPath(sessionId, 'events.jsonl');
  }

  async append(sessionId: string, event: ReviewEvent): Promise<void> {
    const filePath = await this.logFile(sessionId);
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
      const content = await fs.readFile(await this.logFile(sessionId), 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      const tail = lines.slice(-limit);
      const events: ReviewEvent[] = [];
      for (const line of tail) {
        try {
          events.push(JSON.parse(line) as ReviewEvent);
        } catch {
          // skip malformed line
        }
      }
      return events;
    } catch {
      return [];
    }
  }
}

export const eventLog = new EventLog();
